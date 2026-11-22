/** Plain-language meanings of the terms the dashboard uses, shown where the term appears. */
export const GLOSSARY = {
  flagged:
    'Among the most statistically unusual contracts in this scoring run (the top 5 percent). A prompt to review the records, not a finding of wrongdoing.',
  score:
    'How unusual a contract is on the four indicators, from 0 (typical) to 100 (most unusual). It ranks contracts; it is not a probability of anything.',
  cutoff:
    'Contracts at or above this score are flagged. It is set so that the highest-scoring 5 percent are flagged.',
  documentRequests:
    'How many suppliers requested the bidding documents, read from the public bid notice. PhilGEPS does not publish how many bids were submitted, so this stands in as a sign of competition.',
  awardToBudget:
    'The contract amount as a share of the approved budget. Awards cluster just under the budget; this compares one award with similar contracts.',
  startingLevel:
    'The score every contract starts from before its indicators move it up or down: the average score in this run.',
  mainReason: 'The indicator that raised the score the most.',
  points:
    'How much one indicator moved this score up or down. The starting level plus every indicator’s points equals the score.',
  scoringRun:
    'One run of the model over the data. Earlier runs are kept, so a score can always be traced to the run that produced it.',
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
