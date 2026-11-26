---
name: validate-flags
description: Check the top flagged bid notices against the Philippine Competition Commission red-flag patterns, for the feature verification in Objective 7 (Section 3.13 of the methodology). Use when asked to validate, sanity-check or review flagged contracts.
argument-hint: "[number of notices, default 20] [scoring run id]"
---

Support the feature verification against PCC red-flag patterns (Objective 7; methodology Section 3.13; patterns from phcc.gov.ph/enforcement/bid-rigging-what-it-is-and-how-to-detect). There is no labeled ground truth. Most patterns this check can assess are the same ones the indicators measure, so it shows whether the top flags are consistent with the PCC descriptions, not independent evidence that they matter more than other contracts. Say so in the summary. Arguments, if given: $ARGUMENTS

This is read-only: query the database, change nothing.

## Steps

1. Use the scoring run named in the arguments, or else the latest Isolation Forest run that is not a demo run (`scoring_runs.model_name = 'Isolation Forest' AND NOT is_demo`, highest `id`).
2. Take the highest-ranked **bid notices**, 20 unless the arguments say otherwise. A notice awarded in lots holds several contracts: count it once, under its best-ranked contract (group by `source_series` and `bid_reference_no`). Contracts without a bid reference count as their own notice.
3. For each notice, pull the contract details, all four indicators (`single_requester`, `repeated_winner`, `price_deviation`, `contract_splitting`) with their value, SHAP contribution and `context`, and the main reason (the indicator with the largest positive contribution).
4. Mark every pattern in the table below as **shown**, **not shown** or **not assessable** with the available fields. The thresholds are fixed before looking at the notices; apply them exactly, and count a pattern as shown only when the published figures meet them.
5. Note whether the main reason the dashboard would show matches what the figures show.

## Patterns and fixed thresholds

| PCC pattern | Fields used | Shown when |
|---|---|---|
| Few suppliers compete, as in bid suppression | Document request count (`single_requester` value), a proxy for competition, never a bidder count | 1 document request or fewer. Public Bidding notices only; other modes are not assessable |
| The same supplier keeps winning from one entity, as in market allocation | `repeated_winner` value and its context (`wins`, `entity_awards`) | Share of the entity's bid notices of 50% or more. Not assessable when the entity has fewer than 5 notices. Bid rotation, where several suppliers take turns, cannot be seen from winners alone |
| The winning price is close to the budget ceiling compared with similar contracts | `price_deviation` context: `amount_to_budget_ratio`, `comparable_median_ratio`; value = ratio / median - 1 | `amount_to_budget_ratio` of 0.95 or more **and** `price_deviation` value of 0.01 or more (at least 1% above the comparable median) |
| Several small purchases that together exceed the Small Value Procurement ceiling, as in contract splitting (IRR Section 54.1, a procurement rule rather than a PCC pattern) | `contract_splitting` value and context (`notices_in_window`, `window_budget_total`, `ceiling`) | Value of 2 or more. Small Value Procurement awards only; other modes are not assessable |
| A suspicious gap between the winning and losing bids, as in cover bidding | Losing bids | Never: not assessable, losing bids are not published |
| Identical cost estimates across competing bids | Individual bid amounts | Never: not assessable, bid amounts are not published |
| A price drop when a new competitor joins | Bidder identities over time | Never: not assessable, bidders are not published |

## Be honest about what the data can show

A pattern that cannot be assessed is reported as **not assessable**, never counted as absent: treating missing data as a clean result would make the system look more reliable than it is. An indicator value that is missing (see `context.why_missing`) makes its pattern not assessable for that notice. Do not stretch an indicator to claim a pattern it does not measure.

## Output

A table with one row per notice: rank, bid reference, procuring entity, score, the four indicator values, main reason, each pattern's mark, and a one-line note. Then a short summary:

- For each pattern, how many notices show it, do not show it, and cannot be assessed.
- How many notices show at least one pattern, and how many show none of the assessable ones.
- How many main reasons match the figures, and which do not.
- Flags that look like data quality artifacts (a misspelled entity, an implausible amount) rather than real unusualness.
- The reminder that this check is consistency with the PCC descriptions, not independent evidence.

This output is evidence for the manuscript, so report counts exactly and do not round a weak result upward. Write "shows the pattern" or "is consistent with", never "is bid rigging" or "is corrupt". Give the result in the reply; save it to a file only if the user asks.
