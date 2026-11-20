# ml

Feature engineering and anomaly detection (Objectives 2 to 4). Reads cleaned contracts from PostgreSQL, computes the four indicators, scores every contract with an unsupervised model (Isolation Forest), explains each score with SHAP, and writes the results back for the API to serve.

## Commands

Run from the repo root with the virtual environment's Python. PostgreSQL must be up and contracts loaded (`pipeline/README.md`).

| Step | Command |
|---|---|
| Score every contract | `python -m ml.score` |

Each run is stored as a new row in `scoring_runs`; earlier runs are kept. A few minutes for the 90,204 contracts of 2024.

Robustness checks (read the database, write only to `data/processed/`, never change stored runs):

| Check | Command | Writes |
|---|---|---|
| Sensitivity to the study defaults | `python -m ml.sensitivity` | `data/processed/sensitivity_isolation-forest.csv` and `.json` |
| Isolation Forest seed stability | `python -m ml.stability` | `data/processed/seed_stability.csv` and `.json` |

## What is stored

- `contract_scores`: a score from 0 to 1 (higher is more statistically unusual), a rank, and whether the contract is flagged.
- `contract_indicators`: per indicator, the value, its SHAP contribution, and the figures behind the value (`context`) so a reviewer can check it by hand.
- `scoring_runs`: model name, every setting used, the random seed, the flagging score and the SHAP base value.

Base value + a contract's four contributions = its score, exactly. `score.py` prints the largest gap after each run.

## Study decisions

All in `settings.py`. Each is a default I chose, pending the team's confirmation. Changing one changes the results, so re-run and report it.

| Decision | Default | Why |
|---|---|---|
| Comparable contracts (price deviation) | Same region and approved-budget band; widens to the band alone, then to all contracts, when a group has fewer than 30 | `Business Category` is "Construction Projects" for about 92% of civil works rows, so it cannot separate project types |
| Budget bands | Below 1M, 1M to 5M, 5M to 20M, 20M to 50M, 50M and above (pesos) | Round thresholds; not derived from procurement rules |
| Share flagged | Highest-scoring 5% of contracts | Unsupervised scores have no natural cut-off; a fixed share keeps the review queue a known size |
| Implausibly low price | A notice awarded below 20% of its approved budget is not compared on price | 77 of about 86,000 notices in 2024. They cluster at exactly 0.1% and 1% of budget, the pattern of amounts published in thousands or with a shifted decimal point. Between 20% and 50% there is no such pattern, so those stay in |
| Smallest entity for repeated winner | 5 bid notices | A share of one or two awards is not a pattern |
| Document requests | Used only for Public Bidding | Other modes are not open to competing bids |
| Contract splitting | Small Value Procurement notices from one entity to one supplier within 30 days whose approved budgets together exceed PHP 1,000,000 | PHP 1,000,000 is the highest Small Value Procurement ceiling for infrastructure (Annex H, 2016 Revised IRR of R.A. 9184, consolidated 15 October 2023, page 156). LGU ceilings are lower (PHP 50,000 to 1,000,000 by income class), but the data has no LGU income class, so the highest ceiling is used: no entity is counted for a total it was allowed to procure this way. 30 days is a round window, not from the rules |

## How each indicator is computed

- **Few document requests** (`single_requester`): the notice's document request count. It is a proxy for competition, never called a bid count. The model sees `1 / count`, so only low counts are extreme.
- **Repeated winner**: the share of the procuring entity's bid notices that were awarded to this awardee. Counted by notice, not by award record, so a notice awarded in several lots, or posted with several award notices, is one win.
- **Unusual price** (`price_deviation`): the awarded amount as a share of the approved budget, relative to the median share among comparable contracts. When a notice is awarded in several lots that share one budget, the lots are summed first. The model sees only the part above the median (below it counts as 0): an award cannot exceed the approved budget, so nearly all room to differ is downward, and a low price is not one of the red flags studied; at the low end it is mostly partial awards and data entry errors. The dashboard still shows the signed value. Left missing when:
  - one line item of the notice has more than one award notice (all to the same awardee in 2024; 96 notices). PhilGEPS does not say which one is in force, and adding them up produced totals of up to 391% of budget;
  - the result is below the implausibly low price floor above.

- **Grouped small-value awards** (`contract_splitting`): for a Small Value Procurement award, the number of such notices the same entity awarded to the same supplier within 30 days (this one included), when their approved budgets together exceed the ceiling above; 0 when there is no such group. Splitting a contract to evade public bidding is prohibited by Section 54.1 of the IRR. The data cannot show intent, so this is a pattern for review only. Counted by notice, so lots of one notice are one award. Missing for other procurement modes and when the award date is not published; the model sees 0 for those.

A value that cannot be computed is stored as missing with the reason in `context.why_missing`. The model treats it as the typical (median) value so that it neither raises nor lowers the score much.

## The model

**Isolation Forest** scores a contract by how few random splits isolate it. It is fitted on all contracts and scaled linearly to 0 to 1.

A clustering model (k-means distance to the nearest large cluster) was scored alongside it for comparison until November 2026, when the team removed it; migration 007 deleted its stored runs. Reasons: on the 2024 data it flagged 4,512 of 4,513 contracts mainly for price, so it reduced to one indicator, and its results depended on choices that are hard to defend (number of clusters, scaling, what counts as a large cluster).

SHAP values are exact Shapley values over all 16 combinations of the four indicators, against a sample of 40 contracts as background. `explain.py` computes them for all contracts at once; a test checks the result against the `shap` library's exact explainer, which gives the same values but took about 50 minutes on 90,247 contracts where this takes about a minute.

## A property to know about

A repeated-winner share is the same for every contract an entity gave that awardee. If an entity awarded 57 of 63 contracts to one awardee, those 57 contracts look alike, form a dense group, and are *not* isolated: the model does not treat them as rare. Contract-level anomaly detection flags contracts that differ from the rest, and a pattern repeated many times stops being different. On the demonstration data, repeated winner was not the main reason for any flagged contract for this reason. The entity pages in the dashboard show the concentration directly, which is where a reviewer will see it.

## Robustness of the flagged set

`ml/sensitivity.py` changes one study decision at a time (the alternatives are `SENSITIVITY_VARIANTS` in `settings.py`), recomputes the indicators, refits the model and compares the result with the default settings. `ml/stability.py` refits the Isolation Forest with each seed in `STABILITY_SEEDS` and compares it with the default seed (2024) and every pair of seeds. Both skip SHAP, which the ranking does not need.

What each column means (`ml/robustness.py`):

- `flagged_jaccard`: contracts flagged by both, over contracts flagged by either.
- `default_flags_kept`: share of the default's flagged contracts that the alternative also flags.
- `top_N_overlap`: share of the default's N highest-ranked contracts that are also in the alternative's top N (N = 100 and 500, `ROBUSTNESS_TOP_N`).
- `spearman_all`: Spearman rank correlation of the two scores over all contracts.

These compare two scorings of the same contracts. They say how much a result depends on a choice, not whether a flag is right: no labelled cases exist to say that.

### Measured on the 2024 data (13 November 2026)

90,204 contracts (those `ml/data.py` loads for the study period), the same set and settings as stored run 24, which the default reproduces (4,511 flagged in both). Only 103 notices have a document request count, so the document-request indicator is missing for nearly every contract and is replaced by its median; the figures below therefore mostly reflect the other two indicators, and need re-running after the document request scrape.

Sensitivity, Isolation Forest (29 s):

| Alternative | Flagged | Flagged Jaccard | Default flags kept | Top 100 | Top 500 | Spearman |
|---|---|---|---|---|---|---|
| Bands 5M, 50M (coarser) | 4,511 | 0.710 | 0.830 | 0.36 | 0.702 | 0.969 |
| Bands 0.5M to 50M, 7 edges (finer) | 4,511 | 0.802 | 0.890 | 0.87 | 0.938 | 0.975 |
| Bands with an extra edge at 100M | 4,511 | 0.873 | 0.932 | 0.67 | 0.742 | 0.991 |
| 3% flagged | 2,708 | 0.600 | 0.600 | 1.00 | 1.000 | 1.000 |
| 10% flagged | 9,021 | 0.500 | 1.000 | 1.00 | 1.000 | 1.000 |
| Smallest comparable group 15 | 4,511 | 1.000 | 1.000 | 1.00 | 1.000 | 1.000 |
| Smallest comparable group 50 | 4,512 | 0.997 | 0.998 | 1.00 | 0.998 | 0.999 |
| Smallest comparable group 100 | 4,512 | 0.991 | 0.995 | 0.95 | 0.996 | 0.998 |
| Smallest entity 3 bid notices | 5,107 | 0.794 | 0.944 | 0.88 | 0.956 | 0.943 |
| Smallest entity 10 bid notices | 4,518 | 0.729 | 0.844 | 0.55 | 0.762 | 0.938 |

The share flagged changes only the cut-off, so the ranking is unchanged (Spearman 1.000); with 3% every flag is one of the default's, with 10% every default flag stays. The smallest comparable group barely matters between 15 and 100. Budget bands and the smallest entity move the most: with coarser bands 17% of the default's flags change and only 36 of the top 100 stay. With a smallest entity of 3, more contracts share the flagging score, so 5,107 are flagged instead of 4,511.

Seed stability, Isolation Forest, 10 seeds (42 s). Default seed 2024 against the 9 others: flagged Jaccard 0.888 to 0.944, top 100 overlap 0.37 to 0.68, top 500 overlap 0.650 to 0.928, Spearman 0.986 to 0.993. Over all 45 pairs of seeds (min / mean / max):

| Measure | Min | Mean | Max |
|---|---|---|---|
| Flagged Jaccard | 0.834 | 0.905 | 0.946 |
| Top 100 overlap | 0.37 | 0.775 | 0.99 |
| Top 500 overlap | 0.650 | 0.866 | 0.952 |
| Spearman | 0.982 | 0.989 | 0.995 |

So the overall ranking hardly depends on the seed, and about nine in ten flags are the same whichever seed is used, but which contracts make the top 100 does depend on it. A reviewer should not read much into the difference between rank 40 and rank 140. Whether to respond (more trees, or averaging scores over seeds) is a study decision; nothing has been changed.

## Tests

```
.venv\Scripts\python -m pytest ml
```

Indicators are tested on small tables where the expected value is worked out by hand. Models are tested for: a planted extreme contract ranking first, contributions adding up to the score, and the same seed giving the same scores. The robustness measures are tested on hand-worked cases (`ml/tests/test_robustness.py`).
