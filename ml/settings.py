"""Choices the detection engine depends on. Each one is a study decision: change
it here, re-run the scoring, and report the change in the manuscript."""

from dataclasses import asdict, dataclass, replace

SINGLE_REQUESTER = "single_requester"
REPEATED_WINNER = "repeated_winner"
PRICE_DEVIATION = "price_deviation"
INDICATORS = (SINGLE_REQUESTER, REPEATED_WINNER, PRICE_DEVIATION)

# Approved-budget bands (pesos) used to decide which contracts are comparable.
BUDGET_BANDS = (1_000_000, 5_000_000, 20_000_000, 50_000_000)


@dataclass(frozen=True)
class Settings:
    # Document requests say something about competition only where bidding was open.
    competitive_mode: str = "Public Bidding"
    # A share of an entity's awards is not meaningful when the entity awarded very few.
    min_entity_awards: int = 5
    # Contracts are comparable when they share a region and a budget band. A group
    # smaller than this widens to the budget band alone, then to all contracts.
    min_comparable_contracts: int = 30
    # A notice awarded below this share of its approved budget is not compared on
    # price. Such amounts cluster at exactly 0.1% and 1%, the pattern of an amount
    # published in thousands or with a misplaced decimal point, not of a real bid.
    min_plausible_price_ratio: float = 0.2
    # Share of scored contracts shown as flagged for review.
    flag_share: float = 0.05
    random_seed: int = 2024
    isolation_forest_trees: int = 200
    clusters: int = 8
    # Rows sampled to stand for "a typical contract" when computing SHAP values.
    shap_background_rows: int = 40
    # Approved-budget band edges (pesos) for comparable contracts.
    budget_bands: tuple[int, ...] = BUDGET_BANDS

    def as_dict(self) -> dict:
        return {**asdict(self), "budget_bands": list(self.budget_bands)}


# Robustness checks (ml/sensitivity.py, ml/stability.py). These do not change
# the scores stored for the dashboard; they measure how much the flagged set
# would move if a study decision above were made differently.

# How many of the highest-ranked contracts are compared between two scorings.
ROBUSTNESS_TOP_N = (100, 500)

# Each alternative changes one decision and keeps every other at its default.
# Pairs of (name, changes to Settings).
SENSITIVITY_VARIANTS: tuple[tuple[str, dict], ...] = (
    # Budget bands: one fewer, finer, and with a band above 100M.
    ("bands_coarse", {"budget_bands": (5_000_000, 50_000_000)}),
    (
        "bands_fine",
        {
            "budget_bands": (
                500_000,
                1_000_000,
                2_000_000,
                5_000_000,
                10_000_000,
                20_000_000,
                50_000_000,
            )
        },
    ),
    (
        "bands_top_100m",
        {"budget_bands": (1_000_000, 5_000_000, 20_000_000, 50_000_000, 100_000_000)},
    ),
    # Share flagged.
    ("flag_share_3pct", {"flag_share": 0.03}),
    ("flag_share_10pct", {"flag_share": 0.10}),
    # Smallest comparable group before widening.
    ("min_group_15", {"min_comparable_contracts": 15}),
    ("min_group_50", {"min_comparable_contracts": 50}),
    ("min_group_100", {"min_comparable_contracts": 100}),
    # Smallest entity for the repeated-winner share.
    ("min_entity_3", {"min_entity_awards": 3}),
    ("min_entity_10", {"min_entity_awards": 10}),
)

# Seeds for the Isolation Forest seed-stability check; the default seed is compared with each.
STABILITY_SEEDS = (1, 7, 42, 99, 123, 2023, 2025, 31337, 4242)


def variant(base: Settings, changes: dict) -> Settings:
    return replace(base, **changes)
