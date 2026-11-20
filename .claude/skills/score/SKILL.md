---
name: score
description: Recompute the four red-flag indicators, run the Isolation Forest, generate SHAP explanations, and write risk scores to PostgreSQL.
disable-model-invocation: true
---

Run the scoring workflow for ProcureGuard on the contracts currently in PostgreSQL.

The exact commands live in `ml/README.md`. If `ml/` or that README does not exist yet, say the layer has not been built and stop.

## Before running

- PostgreSQL is running and holds cleaned contracts. If the last `/ingest` report said the data was not ready, tell the user and ask before continuing.

## Steps

1. **Indicators.** Compute single-bidder win (document request proxy), repeated-winner concentration (same supplier, same procuring entity), price deviation from the median of comparable contracts, and grouped small-value awards (contract splitting).
2. **Model.** Fit and score with a fixed random seed.
3. **Explain.** Compute SHAP contributions per indicator for each contract.
4. **Store.** Write scores and contributions as a new run, recorded with model name, parameters and timestamp. Earlier runs are kept; replacing or deleting them needs the user's say-so.
5. **Check** by querying the database after writing.

## Report

- Contracts scored against contracts available, and why any were not scored.
- Score distribution: min, median, max, and how many fall above the flagging threshold in use.
- The ten highest-scoring contracts with their four indicator values and top contributing indicator.
- Anything odd, such as an indicator that is constant, or one indicator dominating every explanation.

Describe results as "statistically unusual" or "flagged for review". A high score is not evidence of wrongdoing, and the report must not read as if it were.
