---
name: validate-flags
description: Check the top flagged contracts against the Philippine Competition Commission red-flag patterns, for the manual validation in Objective 7. Use when asked to validate, sanity-check or review flagged contracts.
argument-hint: "[number of contracts, default 20] [model run]"
---

Support the manual validation of ProcureGuard's flags (Objective 7, `docs/BDC_CH1-CH2.pdf` page 5). There is no labeled ground truth, so validation means checking whether flagged contracts show the patterns the Philippine Competition Commission describes. Arguments, if given: $ARGUMENTS

This is read-only: query the database, change nothing.

## Steps

1. Take the highest-scoring contracts from the latest scoring run, or the run named in the arguments. Default to 20 contracts if no number is given.
2. For each one, pull the contract details, the three indicator values and the SHAP contributions.
3. Compare against the PCC patterns (paper page 10; source: phcc.gov.ph/enforcement/bid-rigging-what-it-is-and-how-to-detect):
   - Suspicious price differences between winning and losing bids
   - The same bidders winning in rotation over consecutive periods
   - Identical cost estimates across competing bids
   - A sudden price drop when a new competitor joins
   - Bids clustered near the approved budget ceiling (GPPB manual, paper page 11)
4. Look at the supplier's and procuring entity's other contracts in the data where a pattern needs context, such as rotation.

## Be honest about what the data can show

ProcureGuard holds award-level fields. Several PCC patterns need losing bids or bid-by-bid history, which may not be in the data. For each pattern say one of: **shown** (with the figures), **not shown**, or **cannot be assessed with available fields**. Do not stretch an indicator to claim a pattern it does not measure.

## Output

A table with one row per contract: reference, procuring entity, score, the three indicator values, top contributing indicator, PCC patterns shown, and a one-line note. Then a short summary:

- How many flagged contracts show at least one PCC pattern, and how many show none.
- Which patterns could not be assessed at all, and what data would be needed.
- Flags that look like data quality artifacts (a misspelled entity, a missing bidder count) and not real unusualness.

This output is evidence for the manuscript, so report counts exactly and do not round a weak result upward. Write "shows the pattern" or "is consistent with", never "is bid rigging" or "is corrupt". Give the result in the reply; save it to a file only if the user asks.
