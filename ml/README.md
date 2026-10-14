# ml

Feature engineering and anomaly detection (Objectives 2 to 4). Reads cleaned contracts from PostgreSQL, computes the three indicators, scores every contract with an unsupervised model, explains each score with SHAP, and writes the results back for the API to serve.

## Commands

Run from the repo root with the virtual environment's Python. PostgreSQL must be up and contracts loaded (`pipeline/README.md`).

| Step | Command |
|---|---|
| Score with both models (the default while the model choice is open) | `python -m ml.score` |
| Score with one model | `python -m ml.score --model isolation-forest` or `--model clustering` |

Each run is stored as a new row in `scoring_runs`; earlier runs are kept. About a minute and a half for the 90,247 contracts of 2024 with both models.

## What is stored

- `contract_scores`: a score from 0 to 1 (higher is more statistically unusual), a rank, and whether the contract is flagged.
- `contract_indicators`: per indicator, the value, its SHAP contribution, and the figures behind the value (`context`) so a reviewer can check it by hand.
- `scoring_runs`: model name, every setting used, the random seed, the flagging score and the SHAP base value.

Base value + a contract's three contributions = its score, exactly. `score.py` prints the largest gap after each run.

## Study decisions

All in `settings.py`. Each is a default I chose, pending the team's confirmation. Changing one changes the results, so re-run and report it.

| Decision | Default | Why |
|---|---|---|
| Comparable contracts (price deviation) | Same region and approved-budget band; widens to the band alone, then to all contracts, when a group has fewer than 30 | `Business Category` is "Construction Projects" for about 92% of civil works rows, so it cannot separate project types |
| Budget bands | Below 1M, 1M to 5M, 5M to 20M, 20M to 50M, 50M and above (pesos) | Round thresholds; not derived from procurement rules |
| Share flagged | Highest-scoring 5% of contracts | Unsupervised scores have no natural cut-off; a fixed share keeps the review queue a known size |
| Smallest entity for repeated winner | 5 awards | A share of one or two awards is not a pattern |
| Document requests | Used only for Public Bidding | Other modes are not open to competing bids |

## How each indicator is computed

- **Few document requests** (`single_requester`): the notice's document request count. It is a proxy for competition, never called a bid count. The model sees `1 / count`, so only low counts are extreme.
- **Repeated winner**: the share of the procuring entity's awards that went to this awardee, by number of contracts.
- **Unusual price** (`price_deviation`): the awarded amount as a share of the approved budget, relative to the median share among comparable contracts. When a notice is awarded in several lots that share one budget, the lots are summed first.

A value that cannot be computed is stored as missing with the reason in `context.why_missing`. The model treats it as the typical (median) value so that it neither raises nor lowers the score much.

## The two models

- **Isolation Forest**: scores a contract by how few random splits isolate it.
- **Clustering distance**: k-means on robustly scaled indicators; the score is the (log) distance to the nearest *large* cluster. Small clusters are not counted as ordinary, because k-means will form a cluster around a handful of extreme contracts and put them at distance zero.

Both are fitted on all contracts and scaled linearly to 0 to 1.

SHAP values are exact Shapley values over all eight combinations of the three indicators, against a sample of 40 contracts as background, so the same explanation method applies to both models. `explain.py` computes them for all contracts at once; a test checks the result against the `shap` library's exact explainer, which gives the same values but took about 50 minutes on 90,247 contracts where this takes about a minute.

## A property to know about

A repeated-winner share is the same for every contract an entity gave that awardee. If an entity awarded 57 of 63 contracts to one awardee, those 57 contracts look alike, form a dense group, and are *not* isolated: neither model treats them as rare. Contract-level anomaly detection flags contracts that differ from the rest, and a pattern repeated many times stops being different. On the demonstration data, repeated winner was not the main reason for any flagged contract for this reason. The entity pages in the dashboard show the concentration directly, which is where a reviewer will see it.

## Tests

```
.venv\Scripts\python -m pytest ml
```

Indicators are tested on small tables where the expected value is worked out by hand. Models are tested for: a planted extreme contract ranking first, contributions adding up to the score, and the same seed giving the same scores.
