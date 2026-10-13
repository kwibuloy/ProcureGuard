"""The quarterly CSV files published on the PhilGEPS Open Data Portal.

File IDs come from the portal's "Datasets" page (docs/data-source.md). Only
publicly downloadable quarters are listed.
"""

from dataclasses import dataclass

LEGACY = "legacy"  # PhilGEPS 1.5
MODERN = "modern"  # Modernized PhilGEPS 2.0


@dataclass(frozen=True)
class Source:
    series: str
    year: int
    quarter: int
    file_id: str

    @property
    def filename(self) -> str:
        return f"{self.series}_{self.year}_Q{self.quarter}.csv"


SOURCES = (
    Source(LEGACY, 2024, 1, "12giiBfKdKXEJN5ADJqsTzujtJEX2tdop"),
    Source(LEGACY, 2024, 2, "1fRDMW5myhn_1JHthpmeijsGzKqj7NGtL"),
    Source(LEGACY, 2024, 3, "13LI2GC9VWNXi1zow93xNYzekuU3FyLua"),
    Source(LEGACY, 2024, 4, "1y4-jcz_SmUiNd_oqyjtK9yWu1W1QCvHt"),
    # The portal's 2024 Q2 link for this series points at the Q1 file, so there is
    # no separate Q2 entry.
    Source(MODERN, 2024, 1, "16PQO-RlUARu8Yh7zxel4b3Tet-S1r3js"),
    Source(MODERN, 2024, 3, "1Hgjk994GVu6rWeO6jUcNZ_wK2G7mKLK0"),
    Source(MODERN, 2024, 4, "1n71MlwYuZzghSEbAhs6KGW4aSLtK_wVy"),
)
