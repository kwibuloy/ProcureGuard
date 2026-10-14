"""Choices the detection engine depends on. Each one is a study decision: change
it here, re-run the scoring, and report the change in the manuscript."""

from dataclasses import asdict, dataclass

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
    # Share of scored contracts shown as flagged for review.
    flag_share: float = 0.05
    random_seed: int = 2024
    isolation_forest_trees: int = 200
    clusters: int = 8
    # Rows sampled to stand for "a typical contract" when computing SHAP values.
    shap_background_rows: int = 40

    def as_dict(self) -> dict:
        return {**asdict(self), "budget_bands": list(BUDGET_BANDS)}
