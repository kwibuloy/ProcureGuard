"""The three red-flag indicators, computed for every contract.

Each indicator returns a value and the figures behind it, so a reviewer can check
the value by hand. A value that cannot be computed is left missing with the
reason stated; it is never filled in.
"""

import numpy as np
import pandas as pd

from ml.settings import BUDGET_BANDS, PRICE_DEVIATION, REPEATED_WINNER, SINGLE_REQUESTER, Settings

WHY_MISSING = "why_missing"


def single_requester(contracts: pd.DataFrame, settings: Settings) -> pd.DataFrame:
    """Proxy for a single-bidder win: how many suppliers requested the bidding documents.

    PhilGEPS publishes no bidder count. A count of 1 means one supplier requested
    the documents, not that one bid was submitted.
    """
    competitive = contracts["procurement_mode"] == settings.competitive_mode
    requests = contracts["document_requests"].astype(float).where(competitive)
    typical = float(requests.median()) if requests.notna().any() else None
    context = []
    for is_competitive, count in zip(competitive, requests, strict=True):
        if not is_competitive:
            context.append({WHY_MISSING: "the contract was not procured through public bidding"})
        elif pd.isna(count):
            context.append(
                {WHY_MISSING: "the document request count for its notice is not available"}
            )
        else:
            entry = {"document_requests": int(count)}
            if typical is not None:
                entry["typical_requests"] = typical
            context.append(entry)
    return pd.DataFrame({"value": requests, "context": context}, index=contracts.index)


def repeated_winner(contracts: pd.DataFrame, settings: Settings) -> pd.DataFrame:
    """Share of a procuring entity's awards that went to this contract's awardee."""
    entity_awards = contracts.groupby("procuring_entity")["id"].transform("count")
    wins = contracts.groupby(["procuring_entity", "awardee"])["id"].transform("count")
    enough = entity_awards >= settings.min_entity_awards
    share = (wins / entity_awards).where(enough)
    context = [
        {"wins": int(won), "entity_awards": int(total)}
        if has_enough
        else {
            "entity_awards": int(total),
            WHY_MISSING: f"the entity awarded fewer than {settings.min_entity_awards} contracts",
        }
        for won, total, has_enough in zip(wins, entity_awards, enough, strict=True)
    ]
    return pd.DataFrame({"value": share, "context": context}, index=contracts.index)


def budget_band(budget: pd.Series) -> pd.Series:
    """Which approved-budget band each contract falls in (missing budgets stay missing)."""
    band = pd.Series(
        np.searchsorted(BUDGET_BANDS, budget.fillna(0).to_numpy(), side="right"),
        index=budget.index,
        dtype=float,
    )
    return band.where(budget.notna())


def price_deviation(contracts: pd.DataFrame, settings: Settings) -> pd.DataFrame:
    """Awarded price against the median of comparable contracts.

    Projects differ in size, so prices are compared as a share of the approved
    budget. The value is how far that share sits from the comparable median:
    0.02 is two percent above it, -0.30 is thirty percent below.
    """
    ratio = contracts["notice_awarded_total"].astype(float) / contracts["approved_budget"].astype(
        float
    )
    ratio = ratio.where(np.isfinite(ratio) & (ratio > 0))
    frame = pd.DataFrame(
        {
            "ratio": ratio,
            "band": budget_band(contracts["approved_budget"].astype(float)),
            "region": contracts["region"],
        }
    )

    def group_stats(keys: list[str]) -> tuple[pd.Series, pd.Series]:
        stats = (
            frame.dropna(subset=["ratio", *keys]).groupby(keys)["ratio"].agg(["median", "count"])
        )
        joined = frame[keys].merge(stats, how="left", left_on=keys, right_index=True)
        return joined["median"], joined["count"].fillna(0)

    median = pd.Series(np.nan, index=frame.index)
    count = pd.Series(0.0, index=frame.index)
    basis = pd.Series("", index=frame.index, dtype=object)
    levels = [
        (["region", "band"], "same region and budget band"),
        (["band"], "same budget band"),
    ]
    for keys, label in levels:
        level_median, level_count = group_stats(keys)
        use = median.isna() & (level_count >= settings.min_comparable_contracts)
        median = median.where(~use, level_median)
        count = count.where(~use, level_count)
        basis = basis.where(~use, label)
    everything = median.isna()
    median = median.where(~everything, ratio.median())
    count = count.where(~everything, float(ratio.notna().sum()))
    basis = basis.where(~everything, "all scored contracts")

    deviation = ratio / median - 1
    context = []
    for own, mid, size, label in zip(ratio, median, count, basis, strict=True):
        if pd.isna(own) or pd.isna(mid):
            context.append({WHY_MISSING: "the approved budget or contract amount is not published"})
        else:
            context.append(
                {
                    "amount_to_budget_ratio": float(own),
                    "comparable_median_ratio": float(mid),
                    "comparable_count": int(size),
                    "comparable_basis": label,
                }
            )
    return pd.DataFrame({"value": deviation, "context": context}, index=contracts.index)


COMPUTE = {
    SINGLE_REQUESTER: single_requester,
    REPEATED_WINNER: repeated_winner,
    PRICE_DEVIATION: price_deviation,
}


def compute(contracts: pd.DataFrame, settings: Settings) -> dict[str, pd.DataFrame]:
    return {name: function(contracts, settings) for name, function in COMPUTE.items()}


def model_features(indicators: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """The numbers the model sees, one column per indicator.

    Document requests are inverted (1 request -> 1.0, 10 requests -> 0.1) so that
    only few requests are extreme; a notice with many requests is ordinary. A
    missing value is replaced by the median of its column, the most typical value,
    so that it neither raises nor lowers the score much. The stored indicator
    value stays missing.
    """
    features = pd.DataFrame(
        {
            SINGLE_REQUESTER: 1.0 / indicators[SINGLE_REQUESTER]["value"].clip(lower=1),
            REPEATED_WINNER: indicators[REPEATED_WINNER]["value"],
            PRICE_DEVIATION: indicators[PRICE_DEVIATION]["value"],
        }
    ).astype(float)
    return features.fillna(features.median().fillna(0.0))
