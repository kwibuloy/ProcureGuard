/**
 * Tanod's answers. No AI service: a question is matched to a known topic by its
 * words, and every reply is written here (or built from the dashboard's own
 * indicator and glossary text), so the wording can be tested against the
 * project's rules. Questions that need live figures become a lookup that
 * `resolve` answers from the existing API.
 */
import type { ContractDetail, ContractList, Indicator, Overview } from '../api';
import { formatCount, formatPercent, plural, toPoints } from '../format';
import { GLOSSARY } from '../glossary';
import { explain, INDICATOR_ORDER, INDICATORS, NOTABLE } from '../indicators';

/** How Tanod moves while he says a reply. */
export type Mood =
  | 'wave' // greeting, goodbye
  | 'happy' // thanks, good news
  | 'explain' // teaching: open arms, nods
  | 'point' // points toward the page or a link
  | 'think' // looking something up
  | 'shrug' // did not understand
  | 'firm'; // the "a flag is not an accusation" answers

export interface Link {
  label: string;
  /** In-app path (with any search string), opened with the router. */
  to: string;
}

export interface Reply {
  /** Paragraphs, said one after another. */
  text: string[];
  mood: Mood;
  links?: Link[];
  /** Follow-up questions offered as buttons. */
  suggestions?: string[];
  /** The written topic this reply answers, so "tell me more" knows what to expand. */
  topic?: string;
  /** Contracts this reply listed by rank, so "the second one" can be opened. */
  listed?: Listed[];
}

export interface Listed {
  rank: number;
  id: number;
}

export type Lookup =
  | { kind: 'top' }
  | { kind: 'counts' }
  | { kind: 'reasons' }
  | { kind: 'contract'; id: number }
  | { kind: 'rank'; rank: number }
  | { kind: 'search'; text: string };

export type Answer = { reply: Reply } | { lookup: Lookup; thinking: Reply };

/** What Tanod knows about where the reader is. */
export interface Context {
  /** The contract open in the side panel, if any. */
  contractId?: number | null;
  /** What Tanod said last: its topic and any contracts it listed. */
  memory?: Memory;
}

/** Kept by the chat from Tanod's latest reply, so follow-up questions make sense. */
export interface Memory {
  topic?: string;
  listed?: Listed[];
}

/** The parts of a reply the next question can refer back to. */
export const remember = (reply: Reply, previous: Memory = {}): Memory => ({
  // A reply with no topic of its own (a lookup, a shrug) keeps the last one.
  topic: reply.topic ?? previous.topic,
  listed: reply.listed ?? previous.listed,
});

export const STARTERS = [
  'What does a flag mean?',
  'Show the top flagged contracts',
  'What are the four indicators?',
  'How do I use this site?',
];

const INDICATOR_SUGGESTIONS = [
  'What is the document request proxy?',
  'Explain repeated winner',
  'Explain the award-to-budget ratio',
  'What are grouped small-value awards?',
];

/* ---------------------------------------------------------------------------
 * Matching
 * ------------------------------------------------------------------------ */

/** Lower case, letters and digits only, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

interface Topic {
  id: string;
  /** Phrases (normalized) that point to this topic; longer phrases count more. */
  cues: string[];
  reply: () => Reply;
  /** Said for "tell me more" right after this topic. */
  more?: () => string[];
  /** Shortest single-word cue that may match a misspelling (default 6 letters). */
  fuzzyFrom?: number;
}

/**
 * Edits (insert, delete, substitute, swap two neighbours) between two words,
 * counted up to `limit`; anything further returns limit + 1.
 */
export function distance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

/** A typo of `cue`: one edit for words up to 7 letters, two from 8. */
function misspelled(word: string, cue: string): boolean {
  if (word.length < 4) return false;
  return distance(word, cue, cue.length >= 8 ? 2 : 1) <= (cue.length >= 8 ? 2 : 1);
}

/** How strongly a question matches a topic: the words of every cue found in it. */
function score(question: string, words: Set<string>, topic: Topic): number {
  let total = 0;
  const fuzzyFrom = topic.fuzzyFrom ?? 6;
  for (const cue of topic.cues) {
    if (cue.includes(' ')) {
      if (` ${question} `.includes(` ${cue} `)) total += 2 + cue.split(' ').length;
    } else if (words.has(cue) || (cue.length > 4 && [...words].some((w) => w.startsWith(cue)))) {
      total += 1;
    } else if (
      cue.length >= fuzzyFrom &&
      // A word Tanod knows is spelled right: "contracts" is not a typo of "contractor".
      [...words].some((w) => !vocabulary().has(w) && misspelled(w, cue))
    ) {
      // A misspelling counts a little less than the word itself.
      total += 0.75;
    }
  }
  return total;
}

/* ---------------------------------------------------------------------------
 * Written replies
 * ------------------------------------------------------------------------ */

const NOT_A_FINDING =
  'A flag only says a contract is statistically unusual and worth a closer look. It is not a finding of wrongdoing by anyone.';

const indicatorReply = (indicator: Indicator, extra: string[] = []): Reply => ({
  mood: 'explain',
  text: [
    `${INDICATORS[indicator].label}: ${INDICATORS[indicator].measures}`,
    ...extra,
    `What it can't tell you: ${INDICATORS[indicator].limit}`,
  ],
  links: [{ label: 'How scores work', to: '/about#method' }],
  suggestions: INDICATOR_SUGGESTIONS.filter(
    (q) => !q.toLowerCase().includes(indicatorWord(indicator)),
  ),
});

function indicatorWord(indicator: Indicator): string {
  return {
    single_requester: 'document request',
    repeated_winner: 'repeated winner',
    price_deviation: 'award-to-budget',
    contract_splitting: 'small-value',
  }[indicator];
}

const TOPICS: Topic[] = [
  {
    id: 'greeting',
    cues: [
      'hi',
      'hello',
      'hey',
      'kumusta',
      'kamusta',
      'musta',
      'good morning',
      'good afternoon',
      'good evening',
      'magandang araw',
      'magandang umaga',
      'magandang hapon',
      'yo',
      'sup',
    ],
    reply: () => ({
      mood: 'wave',
      text: [
        'Magandang araw! I’m Tanod, ProcureGuard’s helper.',
        'I can explain what a flag means, how a score is built, and how to find your way around. I can also look up the contracts flagged for review.',
      ],
      suggestions: STARTERS,
    }),
  },
  {
    id: 'thanks',
    cues: [
      'thanks',
      'thank',
      'salamat',
      'ty',
      'thx',
      'appreciate',
      'great',
      'nice',
      'awesome',
      'galing',
    ],
    reply: () => ({
      mood: 'happy',
      text: [
        'Walang anuman! Happy to help. Ask me anything else about the contracts or the scores.',
      ],
      suggestions: ['Show the top flagged contracts', 'How is the score calculated?'],
    }),
  },
  {
    id: 'bye',
    cues: ['bye', 'goodbye', 'paalam', 'see you', 'later', 'ingat'],
    reply: () => ({
      mood: 'wave',
      text: ['Ingat! I’ll be right here in the corner if you need me.'],
    }),
  },
  {
    id: 'who',
    cues: [
      'who are you',
      'what are you',
      'your name',
      'tanod',
      'are you a bot',
      'are you ai',
      'are you an ai',
      'are you human',
      'what can you do',
      'help me',
      'what do you do',
    ],
    reply: () => ({
      mood: 'wave',
      text: [
        'I’m Tanod, named after the barangay tanod who keeps watch in the neighborhood. I keep watch over ProcureGuard’s data in the same spirit: I point things out, I don’t judge anyone.',
        'I answer from written explanations and live figures from this site. I’m not an AI chatbot, so if I don’t know a question, I’ll say so and suggest one I do know.',
      ],
      suggestions: STARTERS,
    }),
  },
  {
    id: 'flag',
    cues: [
      'flag',
      'flagged',
      'what does a flag mean',
      'what is a flag',
      'flag mean',
      'red flag',
      'unusual',
      'warrants review',
    ],
    reply: () => ({
      mood: 'firm',
      text: [
        `${GLOSSARY.flagged}`,
        'In practice: a reviewer opens the contract, reads the indicators behind the score, and checks the published records. Many flags turn out to have ordinary explanations.',
      ],
      links: [{ label: 'See flagged contracts', to: '/' }],
      suggestions: [
        'Is a flagged contract corrupt?',
        'How is the score calculated?',
        'Show the top flagged contracts',
      ],
    }),
    more: () => [
      'Unsupervised scores have no natural cut-off, so the highest-scoring 5% of the contracts in a scoring run are flagged. A fixed share keeps the review queue a known size.',
      'So whether a contract is flagged depends on how it compares with the rest of the year, not on any fixed rule it broke.',
    ],
  },
  {
    id: 'accuse',
    cues: [
      'corrupt',
      'corruption',
      'kurakot',
      'fraud',
      'guilty',
      'steal',
      'stealing',
      'nagnakaw',
      'magnanakaw',
      'thief',
      'crime',
      'criminal',
      'rigged',
      'rigging',
      'bid rigging',
      'anomaly',
      'anomalous',
      'scam',
      'illegal',
      'jail',
      'sue',
      'kickback',
      'who is corrupt',
      'is it corrupt',
    ],
    // "steel" and "prime" are not "steal" and "crime": only long words may be misspelled.
    fuzzyFrom: 7,
    reply: () => ({
      mood: 'firm',
      text: [
        'I can’t say that about anyone, and neither can ProcureGuard.',
        NOT_A_FINDING,
        'The scores come from patterns in published PhilGEPS data. They can rank where a reviewer looks first, but only a review of the actual records can explain a contract.',
      ],
      links: [{ label: 'What a flag means', to: '/about#faq-title' }],
      suggestions: [
        'What does a flag mean?',
        'What are the limits?',
        'What should I do with a flagged contract?',
      ],
    }),
  },
  {
    id: 'score',
    cues: [
      'score',
      'scoring',
      'how is the score',
      'risk score',
      'calculated',
      'computed',
      'points',
      'rank',
      'ranking',
      'percent',
      'probability',
      '0 to 100',
      'cutoff',
      'threshold',
      'top 5',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        GLOSSARY.score,
        GLOSSARY.cutoff,
        'Each contract’s score is broken into points: a starting level plus the points each of the four indicators added or took away. They always add up to the score, so every score can be checked.',
      ],
      links: [{ label: 'How scores work', to: '/about#method' }],
      suggestions: [
        'What are the four indicators?',
        'What are SHAP points?',
        'What model do you use?',
      ],
    }),
    more: () => [
      'The score is not a probability or a percentage chance of anything. It only orders contracts from most typical to most unusual within one scoring run, so a score is best read next to its rank.',
      'A high score says the combination of indicators is rare in the data. A low score says they look typical, which is not a clean bill of health either.',
    ],
  },
  {
    id: 'indicators',
    cues: [
      'indicator',
      'indicators',
      'four indicators',
      '4 indicators',
      'red flags',
      'criteria',
      'factors',
      'what do you check',
      'what do you look at',
      'patterns',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'Every contract is checked on four indicators:',
        ...INDICATOR_ORDER.map(
          (i, n) => `${n + 1}. ${INDICATORS[i].label}: ${firstSentence(INDICATORS[i].measures)}`,
        ),
        'Each one is a pattern the Philippine Competition Commission and procurement rules point to, measured from structured PhilGEPS fields only.',
      ],
      links: [{ label: 'How scores work', to: '/about#method' }],
      suggestions: INDICATOR_SUGGESTIONS,
    }),
    more: () => [
      'The study keeps to these four on purpose: each is a pattern named in the Competition Commission’s red flags or the procurement rules, and each can be measured from structured PhilGEPS fields without reading attachments.',
      'Ask me about any one of them for what it measures and what it can’t tell you.',
    ],
  },
  {
    id: 'single_requester',
    cues: [
      'document request',
      'document requests',
      'requests',
      'requested',
      'single bidder',
      'one bidder',
      'bidder',
      'bidders',
      'number of bidders',
      'how many bids',
      'few document',
      'competition',
      'proxy',
      'single requester',
    ],
    reply: () =>
      indicatorReply('single_requester', [
        'So this is a proxy for competition. PhilGEPS publishes no count of bids, so ProcureGuard never calls these “bidders”.',
      ]),
    more: () => [
      'Counts exist only for Public Bidding, the one mode open to any interested contractor.',
      'A low count is common: in 2024, 31% of public bidding notices had at most one document request (the median is 3). So on its own it rarely makes a contract stand out; it adds points where it comes together with other indicators.',
    ],
  },
  {
    id: 'repeated_winner',
    cues: [
      'repeated winner',
      'repeat winner',
      'same winner',
      'same contractor',
      'same supplier',
      'concentration',
      'repeated',
      'always wins',
      'favorite contractor',
    ],
    reply: () => indicatorReply('repeated_winner'),
    more: () => [
      'It is the share of a procuring entity’s bid notices awarded to the same awardee, counted by notice, and only for entities with at least 5 bid notices: a share of one or two awards is not a pattern.',
      'One property to know: when an entity gives many contracts to one awardee, those contracts all share the same value and look alike, so the model does not treat them as rare. The entity’s page shows the concentration directly.',
    ],
  },
  {
    id: 'price_deviation',
    cues: [
      'price',
      'price deviation',
      'award to budget',
      'award-to-budget',
      'budget ratio',
      'overpriced',
      'expensive',
      'abc',
      'approved budget',
      'median',
      'comparable',
    ],
    reply: () => indicatorReply('price_deviation'),
    more: () => [
      'Comparable contracts share a region and an approved-budget band. When fewer than 30 contracts share both, the comparison widens to the budget band alone, then to all contracts.',
      'Only the part above the comparable median counts: an award cannot exceed its budget, and a low price is not one of the patterns studied. A notice awarded below 20% of its budget is not compared at all, because such amounts look like data entry errors.',
    ],
  },
  {
    id: 'contract_splitting',
    cues: [
      'splitting',
      'split',
      'contract splitting',
      'small value',
      'small-value',
      'svp',
      'grouped',
      'grouped small value awards',
      'chopping',
    ],
    reply: () => indicatorReply('contract_splitting'),
    more: () => [
      'It counts Small Value Procurement notices from one entity to one supplier within 30 days whose approved budgets together exceed PHP 1,000,000, the highest Small Value Procurement ceiling for infrastructure (Annex H of the 2016 Revised IRR).',
      'Splitting a contract to avoid public bidding is prohibited by Section 54.1 of the IRR, but the data cannot show intent: separate small jobs close together can be entirely ordinary.',
    ],
  },
  {
    id: 'shap',
    cues: [
      'shap',
      'shap points',
      'contribution',
      'contributions',
      'starting level',
      'main reason',
      'why flagged',
      'explain the score',
      'explainable',
      'base value',
      'points mean',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'The points come from SHAP, a standard way to split a model’s score into the part each input is responsible for.',
        GLOSSARY.startingLevel,
        GLOSSARY.points,
        GLOSSARY.mainReason,
      ],
      links: [{ label: 'How scores work', to: '/about#method' }],
      suggestions: ['How is the score calculated?', 'What model do you use?'],
    }),
    more: () => [
      'They are exact Shapley values over all 16 combinations of the four indicators, measured against a sample of typical contracts. The starting level plus a contract’s four contributions equals its score exactly.',
    ],
  },
  {
    id: 'model',
    cues: [
      'model',
      'isolation forest',
      'machine learning',
      'ml',
      'algorithm',
      'ai',
      'unsupervised',
      'trained',
      'training',
      'accuracy',
      'accurate',
      'precision',
      'recall',
      'how reliable',
      'reliable',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'ProcureGuard uses an Isolation Forest, an unsupervised model: it learns what typical contracts look like and scores how easy a contract is to tell apart from the rest.',
        'It was never shown examples of “bad” contracts, because no labeled cases exist. That is also why there is no accuracy figure: there is nothing to check the flags against except a human review.',
      ],
      links: [
        { label: 'How scores work', to: '/about#method' },
        { label: 'How stable the ranking is', to: '/stability' },
      ],
      suggestions: [
        'Do other algorithms agree?',
        'What are the limits?',
        'Where does the data come from?',
      ],
    }),
    more: () => [
      'The forest uses random splits, so it was refitted with ten different seeds: about nine in ten flags stay whichever seed is used, and the overall ranking barely moves (rank correlation 0.99).',
      'A second algorithm, ECOD, was also run on the same indicators as a check. It is used only for comparison; the dashboard shows the Isolation Forest.',
    ],
  },
  {
    id: 'agreement',
    cues: [
      'ecod',
      'other algorithm',
      'other algorithms',
      'another algorithm',
      'other model',
      'other models',
      'another model',
      'second model',
      'different model',
      'agree',
      'agreement',
      'stable',
      'stability',
      'seed',
      'seeds',
      'robust',
      'robustness',
      'sensitivity',
      'depend on',
      'ranking stable',
      'how stable',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'To see how much the flags depend on the choice of algorithm, the team also ran ECOD, a second unsupervised method that scores how far into the tail of each indicator a contract sits. It has no settings to tune and no random seed.',
        'On the 2024 data the two agree on 90 of the top 100 contracts and on about three quarters of the flags. Where they differ, it is mostly repeated winner: ECOD counts a 100% share as extreme even when many contracts share it, the Isolation Forest does not.',
        'Agreement shows a flag doesn’t hinge on one algorithm. It is not proof that the flag is right: there are no labeled cases to check against.',
      ],
      links: [{ label: 'How stable the ranking is', to: '/stability' }],
      suggestions: ['What model do you use?', 'What are the limits?'],
    }),
  },
  {
    id: 'missing',
    cues: [
      'missing',
      'missing value',
      'no value',
      'blank',
      'not computed',
      'cannot be computed',
      'null',
      'unknown value',
      'empty',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'When an indicator can’t be computed for a contract (no document request count, an entity with too few notices, a price that can’t be compared), it is shown as missing, with the reason.',
        'For the model, a missing value is filled with the typical value of that indicator (grouped small-value awards, which applies only to Small Value Procurement, counts as no group instead). That is a practical choice, not a neutral one: on the 2024 data it lowers a contract’s score by about 4 to 6 points on average, so a contract with missing values can rank lower than it otherwise would.',
      ],
      links: [{ label: 'How scores work', to: '/about#method' }],
      suggestions: ['What are the limits?', 'What are the four indicators?'],
    }),
  },
  {
    id: 'terms',
    cues: [
      'procuring entity',
      'entity',
      'entities',
      'agency',
      'agencies',
      'lgu',
      'awardee',
      'awardees',
      'contractor',
      'contractors',
      'supplier',
      'what is an awardee',
      'what is a procuring entity',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'A procuring entity is the government office that buys: a national agency, a local government unit, a state university, a government corporation.',
        'An awardee is the contractor the award went to. Both have their own page here, with every contract, the flags among them, and who they dealt with most.',
      ],
      links: [{ label: 'Find one on Contracts', to: '/' }],
      suggestions: ['Explain repeated winner', 'Which entity has the most flags?'],
    }),
  },
  {
    id: 'most_flags',
    cues: [
      'most flags',
      'most flagged',
      'which entity',
      'which agency',
      'which lgu',
      'which contractor',
      'which awardee',
      'who won the most',
      'won the most',
      'most contracts',
      'biggest',
      'ranking of entities',
      'leaderboard',
    ],
    reply: () => ({
      mood: 'firm',
      text: [
        'I don’t rank entities or contractors by flags, and the site doesn’t either. An office that awards many contracts will collect more flags just by its size, so a count of flags says little about how anyone works.',
        'To explore, Patterns shows where flags cluster by region and main reason, and each entity’s or awardee’s page shows its share of flags and who it dealt with most.',
        NOT_A_FINDING,
      ],
      links: [
        { label: 'Patterns', to: '/patterns' },
        { label: 'Search an entity', to: '/' },
      ],
      suggestions: ['What is the most common reason for a flag?', 'Find contracts in Cebu'],
    }),
  },
  {
    id: 'charts',
    cues: [
      'chart',
      'charts',
      'graph',
      'graphs',
      'histogram',
      'color',
      'colors',
      'colour',
      'colours',
      'bars',
      'legend',
      'shading',
      'read the',
    ],
    reply: () => ({
      mood: 'point',
      text: [
        'The score spread on Patterns counts contracts by score; the flagged ones are those at or past the cutoff.',
        'In a contract’s panel, each indicator’s bar shows the points it added to the score or took away, starting from the starting level, so the bars add up to the score.',
        'On the map, a darker place has more flagged contracts (or more pesos flagged, whichever you choose).',
      ],
      links: [{ label: 'Patterns', to: '/patterns' }],
      suggestions: ['What are SHAP points?', 'How is the score calculated?'],
    }),
  },
  {
    id: 'new',
    cues: ['whats new', 'what is new', 'new flags', 'newly flagged', 'new this run'],
    reply: () => ({
      mood: 'point',
      text: [
        'A contract flagged in this scoring run but not in the one before it is marked new. On Contracts, the “New flags only” filter lists just those.',
      ],
      links: [{ label: 'New flags', to: '/?new=1' }],
      suggestions: ['Show the top flagged contracts', 'How many contracts are flagged?'],
    }),
  },
  {
    id: 'smalltalk',
    cues: [
      'ok',
      'okay',
      'okey',
      'oki',
      'sige',
      'cool',
      'lol',
      'haha',
      'hehe',
      'yes',
      'yeah',
      'yep',
      'no',
      'nope',
      'hmm',
      'oh',
      'i see',
      'got it',
      'noted',
    ],
    fuzzyFrom: 99,
    reply: () => ({
      mood: 'happy',
      text: ['Sige! Ask me anything else, or pick a question below.'],
      suggestions: STARTERS,
    }),
  },
  {
    id: 'data',
    cues: [
      'data',
      'source',
      'philgeps',
      'where does the data come from',
      'dataset',
      'year',
      '2024',
      '2023',
      '2025',
      'civil works',
      'infrastructure',
      'goods',
      'consulting',
      'how many contracts',
      'open data',
      'updated',
      'time period',
      'period',
      'covered',
      'coverage',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'Everything comes from the PhilGEPS Open Data Portal: 2024 awards for infrastructure and civil works only, plus the document request counts read from each public bid notice.',
        'Goods, consulting and supplies are left out, and so are the 2023 and 2025 files, which PhilGEPS does not offer for public download.',
      ],
      links: [{ label: 'Data quality figures', to: '/about#data' }],
      suggestions: ['How many contracts are flagged?', 'What are the limits?'],
    }),
    more: () => [
      'That is 90,204 contract awards, and document request counts read from all 80,422 public bid notices of the year.',
      'Only structured fields are used: dates, amounts, names, procurement mode. Nothing is read from attachments.',
    ],
  },
  {
    id: 'limits',
    cues: [
      'limit',
      'limits',
      'limitation',
      'limitations',
      'weakness',
      'cannot',
      'cant',
      'wrong',
      'false positive',
      'mistake',
      'trust',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'ProcureGuard can’t see how many bids were actually submitted, the project type, where the project is built, or anything written in attachments. It uses structured fields only.',
        'So a flag can have an ordinary explanation: a remote area with few contractors, a project close to its budget for good reasons, separate small jobs in the same month.',
        NOT_A_FINDING,
      ],
      links: [{ label: 'How scores work', to: '/about#method' }],
      suggestions: ['What does a flag mean?', 'What should I do with a flagged contract?'],
    }),
    more: () => [
      'Two more to keep in mind: a missing indicator value is filled with the typical value, which tends to lower a score; and the indicators use the whole year, so a contract is partly described by awards made after it.',
    ],
  },
  {
    id: 'what_to_do',
    cues: [
      'what should i do',
      'what do i do',
      'next step',
      'report',
      'complain',
      'complaint',
      'respond',
      'response',
      'contact',
      'email',
      'review',
      'reviewer',
      'investigate',
      'coa',
      'audit',
    ],
    reply: () => ({
      mood: 'point',
      text: [
        'Open the contract and read the reasons under its score, then compare it with the published records: the bid notice on PhilGEPS (linked in the panel) and the entity’s COA audit reports (linked on its page).',
        'If you’re named in a flagged contract and want to add context, use “Respond by email” in the contract panel. Reviews from the team are public.',
      ],
      links: [{ label: 'Open the contract list', to: '/' }],
      suggestions: ['What does a flag mean?', 'Show the top flagged contracts'],
    }),
  },
  {
    id: 'howto',
    cues: [
      'how do i use',
      'how to use',
      'navigate',
      'guide',
      'tutorial',
      'tour',
      'start',
      'begin',
      'how does this work',
      'use this site',
      'getting started',
      'paano',
      'gamitin',
      'tulong',
      'help',
    ],
    reply: () => ({
      mood: 'point',
      text: [
        'Start on Contracts: it lists flagged contracts with the highest score first. Click one to see why it scored that way.',
        'Patterns shows the score spread, the main reasons and a map; clicking any of them filters the list. About explains the method.',
        'Tip: J and K move through the list, Enter opens a contract, and ? shows every shortcut.',
      ],
      links: [
        { label: 'Contracts', to: '/' },
        { label: 'Patterns', to: '/patterns' },
      ],
      suggestions: [
        'How do I filter the list?',
        'How do I compare contracts?',
        'Can I download the data?',
      ],
    }),
  },
  {
    id: 'filter',
    cues: [
      'filter',
      'filters',
      'search',
      'find',
      'region',
      'province',
      'city',
      'map',
      'sort',
      'narrow',
      'saved views',
      'save view',
    ],
    reply: () => ({
      mood: 'point',
      text: [
        'On Contracts, type in the search box: a title, city or province, procuring entity, awardee or reference number. Suggestions appear after two letters.',
        'Use the filters for region, main reason, score band and award dates, or pick a place on the Patterns map. “Saved views” keeps a set of filters in this browser, and the address bar always holds the filters, so you can share the link.',
        'You can also ask me directly, like “find contracts in Cebu”.',
      ],
      links: [
        { label: 'Contracts', to: '/' },
        { label: 'Patterns map', to: '/patterns' },
      ],
      suggestions: ['Find contracts in Cebu', 'Can I download the data?'],
    }),
  },
  {
    id: 'compare',
    cues: ['compare', 'comparison', 'side by side', 'versus', 'vs'],
    reply: () => ({
      mood: 'point',
      text: [
        'Open a contract and press “Compare” in its panel. It goes into a tray at the bottom; add a second one and the tray opens both side by side, with the indicators behind each score.',
      ],
      links: [{ label: 'Open the contract list', to: '/' }],
    }),
  },
  {
    id: 'export',
    cues: [
      'download',
      'download the data',
      'can i download',
      'export',
      'csv',
      'excel',
      'spreadsheet',
      'rss',
      'feed',
      'print',
      'pdf',
    ],
    reply: () => ({
      mood: 'point',
      text: [
        'On Contracts, “Export CSV” downloads every contract that matches your filters, not just the page on screen.',
        'A contract’s panel prints as a one-page summary with the disclaimer, and new flags have an RSS feed at /api/feed.xml.',
      ],
      links: [{ label: 'Contracts', to: '/' }],
    }),
  },
  {
    id: 'signin',
    cues: ['sign in', 'login', 'log in', 'account', 'password', 'register', 'sign up'],
    reply: () => ({
      mood: 'explain',
      text: [
        'You don’t need an account to look at anything. Sign-in is only for the review team, who write the public reviews on flagged contracts.',
      ],
      links: [{ label: 'Team sign-in', to: '/signin' }],
    }),
  },
  {
    id: 'purpose',
    cues: [
      'what is procureguard',
      'procureguard',
      'purpose',
      'why',
      'capstone',
      'thesis',
      'study',
      'objective',
      'who made',
      'who built',
    ],
    reply: () => ({
      mood: 'explain',
      text: [
        'ProcureGuard is a capstone research prototype. It screens public infrastructure contracts in PhilGEPS and ranks the statistically unusual ones, so reviewers, journalists and citizens know where to look first.',
        'It explains every score, and it never treats a flag as proof of anything.',
      ],
      links: [{ label: 'About ProcureGuard', to: '/about' }],
      suggestions: ['What does a flag mean?', 'Where does the data come from?'],
    }),
  },
  {
    id: 'theme',
    cues: ['dark mode', 'light mode', 'theme', 'dark'],
    reply: () => ({
      mood: 'point',
      text: ['The moon (or sun) button at the top right switches between light and dark.'],
    }),
  },
];

let known: Set<string> | null = null;
/** Every word of every cue, plus common words: these are never read as typos. */
function vocabulary(): Set<string> {
  known ??= new Set([
    ...TOPICS.flatMap((topic) => topic.cues.flatMap((cue) => cue.split(' '))),
    ...['contract', 'contracts', 'project', 'projects', 'award', 'awards', 'awarded', 'what'],
  ]);
  return known;
}

function firstSentence(text: string): string {
  const end = text.indexOf('. ');
  return end === -1 ? text : text.slice(0, end + 1);
}

/* ---------------------------------------------------------------------------
 * Live lookups
 * ------------------------------------------------------------------------ */

const TOP =
  /\b(top|highest|most unusual|riskiest|worst|first)\b.*\b(flag|flagged|contract|contracts|score|scores|ranked)\b|\bshow\b.*\bflag/;
const COUNTS =
  /\bhow many\b.*\b(flag|flagged|contract|contracts)\b|\b(total|count|number of)\b.*\b(flag|flagged)\b|\bilan\b.*\b(flag|flagged|kontrata|contracts?)\b/;
const REASONS =
  /\b(most common|common|usual|top|biggest)\b.*\breasons?\b|\bmain reasons\b|\bwhy are (most|so many)\b.*\bflag/;
// An explicit contract id: "contract 123", "contract id 123", "/contracts/123".
const CONTRACT_ID = /\bcontract\s*(?:no|number|id)?\s*(\d{1,9})\b|\/contracts\/(\d{1,9})\b/;
// "#2", "rank 2", "number 2": Tanod and the list write ranks with "#".
const RANK_REF = /#\s*(\d{1,6})\b|\brank\s*(\d{1,6})\b|\b(?:number|no)\s*(\d{1,6})\b/;
const ORDINALS: Record<string, number> = {
  first: 1,
  '1st': 1,
  una: 1,
  second: 2,
  '2nd': 2,
  pangalawa: 2,
  third: 3,
  '3rd': 3,
  pangatlo: 3,
};
const ORDINAL = /\b(first|1st|una|second|2nd|pangalawa|third|3rd|pangatlo|last)\b/;
const THIS_CONTRACT =
  /\b(why|explain|tell me about|what about|score of|reasons? for)\b.{0,30}\b(this|that|current|open) (contract|one|project)\b|\bwhy (is|was) (this|it) (flagged|scored|ranked)\b|\bexplain (this|it)\b/;
const SEARCH =
  /^(?:please\s+)?(?:find|search(?: for)?|look up|lookup|show(?: me)?|hanap(?:in)?)\s+(?:the\s+)?(?:flagged\s+)?(?:contracts?|projects?|awards?)?\s*(?:in|from|for|by|of|sa|ng|about|named)?\s+(.+)$/;
// A place at the end of a count or a "show flagged" question: "how many flagged in Cebu".
const IN_PLACE = /\b(?:in|from|sa)\s+([a-z][a-z0-9ñ ]{1,40})$/;
const NOT_A_PLACE =
  /^(the )?(this|that|current|run|list|data|total|all|top|20\d\d|philgeps|site)\b/;
const MORE =
  /^(tell me more|more|more please|go on|continue|elaborate|explain more|explain further|details|more details|and|then|ano pa|bakit|why|how so|example|for example|say more|what else|anything else)$/;
// Joins two questions in one: "what is a flag and how is the score calculated".
const JOINS = / (?:and|also|plus|tapos|then) /;

const THINKING: Reply = { mood: 'think', text: ['Sandali, let me check…'] };

const withTopic = (topic: Topic): Reply => ({ ...topic.reply(), topic: topic.id });

/** The best-matching written topic and its strength. */
function bestTopic(q: string): { topic: Topic | null; strength: number } {
  const words = new Set(q.split(' '));
  let topic: Topic | null = null;
  let strength = 0;
  for (const candidate of TOPICS) {
    const s = score(q, words, candidate);
    if (s > strength) {
      topic = candidate;
      strength = s;
    }
  }
  return { topic, strength };
}

/** Two topics asked in one question, answered one after the other. */
function compound(q: string): Reply | null {
  // A one-word part counts when it is a real word ("price"), not "it" or "so".
  const parts = q.split(JOINS).filter((part) => part.includes(' ') || part.length >= 4);
  if (parts.length < 2) return null;
  const found: Topic[] = [];
  for (const part of parts.slice(0, 3)) {
    const { topic } = bestTopic(part);
    if (topic && topic.id !== 'smalltalk' && !found.includes(topic)) found.push(topic);
  }
  if (found.length < 2) return null;
  const replies = found.slice(0, 2).map(withTopic);
  const links = replies.flatMap((r) => r.links ?? []);
  return {
    mood: replies[0].mood,
    text: replies.flatMap((r) => r.text),
    links: links.filter((l, i) => links.findIndex((m) => m.to === l.to) === i).slice(0, 3),
    suggestions: replies[1].suggestions,
    topic: replies[1].topic,
  };
}

const contractLookup = (id: number): Answer => ({
  lookup: { kind: 'contract', id },
  thinking: THINKING,
});

/** Turn a question into a written reply or a lookup. */
export function answer(question: string, context: Context = {}): Answer {
  const q = normalize(question);
  const raw = question.toLowerCase();
  const memory = context.memory ?? {};
  if (!q) {
    return {
      reply: {
        mood: 'shrug',
        text: ['Type a question and I’ll do my best.'],
        suggestions: STARTERS,
      },
    };
  }

  // A rank Tanod or the list showed ("#2", "rank 2"): the listed contract if it
  // was just shown, otherwise the contract at that rank in this run.
  const rankRef = RANK_REF.exec(raw);
  if (rankRef) {
    const rank = Number(rankRef[1] ?? rankRef[2] ?? rankRef[3]);
    const listed = memory.listed?.find((item) => item.rank === rank);
    if (listed) return contractLookup(listed.id);
    if (rank >= 1) return { lookup: { kind: 'rank', rank }, thinking: THINKING };
  }
  const id = CONTRACT_ID.exec(raw);
  if (id) return contractLookup(Number(id[1] ?? id[2]));

  // "The second one", "explain the first", right after a list of contracts.
  const ordinal = ORDINAL.exec(q);
  // Only when it names a thing in a list: "the first indicator" is not a contract.
  const pointsAtList = /\b(one|contract|project|it)\b/.test(q) || q.split(' ').length <= 2;
  if (ordinal && pointsAtList && !TOP.test(q)) {
    const listed = memory.listed ?? [];
    if (listed.length) {
      const item =
        ordinal[1] === 'last' ? listed[listed.length - 1] : listed[ORDINALS[ordinal[1]] - 1];
      if (item) return contractLookup(item.id);
    } else {
      return {
        reply: {
          mood: 'point',
          text: ['Which list do you mean? Ask me for the top flagged contracts, then pick one.'],
          suggestions: ['Show the top flagged contracts'],
        },
      };
    }
  }

  if (THIS_CONTRACT.test(q)) {
    if (context.contractId) return contractLookup(context.contractId);
    return {
      reply: {
        mood: 'point',
        text: [
          'Open a contract from the list first, then ask me again and I’ll walk you through its score.',
        ],
        links: [{ label: 'Open the contract list', to: '/' }],
      },
    };
  }

  // "Tell me more", "why?": expand what was just said.
  if (MORE.test(q) && memory.topic) {
    const topic = TOPICS.find((t) => t.id === memory.topic);
    if (topic?.more) {
      return {
        reply: {
          mood: 'explain',
          text: topic.more(),
          links: topic.reply().links,
          suggestions: topic.reply().suggestions,
          topic: topic.id,
        },
      };
    }
    if (topic) {
      return {
        reply: {
          mood: 'shrug',
          text: [
            'That’s all I have on that one. Ask me about something else, or pick a question below.',
          ],
          suggestions: STARTERS,
        },
      };
    }
  }

  if (REASONS.test(q)) return { lookup: { kind: 'reasons' }, thinking: THINKING };

  // "How many flagged in Cebu", "show flagged contracts in Davao": a place search.
  const counts = COUNTS.test(q);
  const top = TOP.test(q);
  if (counts || top) {
    const place = IN_PLACE.exec(q);
    if (place && !NOT_A_PLACE.test(place[1])) {
      return { lookup: { kind: 'search', text: place[1].trim() }, thinking: THINKING };
    }
  }
  if (counts) return { lookup: { kind: 'counts' }, thinking: THINKING };
  if (top) return { lookup: { kind: 'top' }, thinking: THINKING };

  // Accusing questions win over everything else, even with other topic words in them.
  const words = new Set(q.split(' '));
  const accuse = TOPICS.find((t) => t.id === 'accuse')!;
  if (score(q, words, accuse) > 0) return { reply: withTopic(accuse) };

  const search = SEARCH.exec(q);
  if (search && search[1].length >= 2 && !/^(the )?(top|flag)/.test(search[1])) {
    return { lookup: { kind: 'search', text: search[1] }, thinking: THINKING };
  }

  const both = compound(q);
  if (both) return { reply: both };

  const { topic } = bestTopic(q);
  if (topic) return { reply: withTopic(topic) };

  return {
    reply: {
      mood: 'shrug',
      text: [
        'Pasensya, I didn’t catch that. I know about flags and scores, the four indicators, the data, and how to use this site. I can also look up contracts, a rank like “#5”, or a place like “Cebu”.',
      ],
      suggestions: STARTERS,
    },
  };
}

/** Fetches JSON from the API; injected so tests can supply their own data. */
export type Fetcher = <T>(path: string) => Promise<T>;

const withRun = (path: string, run: number | null) =>
  run ? `${path}${path.includes('?') ? '&' : '?'}run=${run}` : path;

interface Suggestions {
  contracts: { id: number; title: string; rank: number; flagged: boolean }[];
  entities: { key: string; name: string; contracts: number; flagged: number }[];
  awardees: { key: string; name: string; contracts: number; flagged: number }[];
  places: { name: string; kind: 'province' | 'city'; contracts: number; flagged: number }[];
}

/** Long PhilGEPS titles cut to a readable length. */
export const shorten = (text: string, max = 72) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const CAVEAT = 'Remember, a flag means “worth a closer look”, not that anything is wrong.';

/** One contract's score, rank and the indicators that moved it, in words. */
function explainContract(c: ContractDetail): Reply {
  const reasons = c.indicators
    .filter((i) => i.value !== null && Math.abs(i.contribution) >= NOTABLE)
    .sort((a, b) => b.contribution - a.contribution);
  // Grouped small-value awards is missing for every other procurement mode, and
  // the model reads that as "no group" (0), not as the typical value.
  const missing = c.indicators.filter(
    (i) => i.value === null && i.indicator !== 'contract_splitting',
  );
  const status = c.flagged
    ? 'It is flagged for review.'
    : 'It is not flagged: its score is below the cutoff.';
  return {
    mood: 'explain',
    text: [
      `${shorten(c.title)} (${c.entityName}) has a score of ${toPoints(c.score)}, rank ${formatCount(c.rank)} of ${formatCount(c.scoredContracts)}. ${status}`,
      ...(reasons.length
        ? reasons.map(
            (i) =>
              `${i.contribution > 0 ? 'Raised' : 'Lowered'} by ${INDICATORS[i.indicator].label.toLowerCase()}: ${explain(i)}`,
          )
        : ['None of the four indicators moved its score much; it sits near the starting level.']),
      ...(missing.length
        ? [
            `Could not be computed here: ${missing.map((i) => INDICATORS[i.indicator].label.toLowerCase()).join(', ')}. A missing value is filled with the typical one, which tends to lower a score.`,
          ]
        : []),
      c.flagged
        ? CAVEAT
        : 'A low score is not a clean bill of health either: it only means the indicators look typical.',
    ],
    links: [{ label: 'Open this contract', to: `/contracts/${c.id}` }],
    suggestions: ['What are SHAP points?', 'What should I do with a flagged contract?'],
  };
}

/** Answer a lookup from the API. Never throws: a failure becomes a reply. */
export async function resolve(
  lookup: Lookup,
  fetchJson: Fetcher,
  run: number | null,
): Promise<Reply> {
  try {
    switch (lookup.kind) {
      case 'counts': {
        const overview = await fetchJson<Overview>(withRun('/api/overview', run));
        const { contracts, flagged, entities, entitiesWithFlag } = overview.totals;
        return {
          mood: 'happy',
          text: [
            `This scoring run covers ${plural(contracts, 'contract')}. ${formatCount(flagged)} of them (${formatPercent(contracts ? flagged / contracts : 0, 1)}) are flagged for review.`,
            `Those flags involve ${formatCount(entitiesWithFlag)} of the ${plural(entities, 'procuring entity', 'procuring entities')}.`,
            CAVEAT,
          ],
          links: [{ label: 'See flagged contracts', to: '/' }],
          suggestions: ['Show the top flagged contracts', 'What does a flag mean?'],
        };
      }
      case 'top': {
        const list = await fetchJson<ContractList>(
          withRun('/api/contracts?flagged=true&page=1&pageSize=3', run),
        );
        if (!list.items.length) {
          return { mood: 'shrug', text: ['No contracts are flagged in this scoring run.'] };
        }
        return {
          mood: 'point',
          text: [
            'The three highest-ranked flags in this scoring run:',
            ...list.items.map(
              (c) =>
                `#${c.rank} · score ${toPoints(c.score)} · ${shorten(c.title)} (${c.entityName})${c.mainReason ? `. Main reason: ${INDICATORS[c.mainReason].label.toLowerCase()}` : ''}.`,
            ),
            CAVEAT,
          ],
          links: list.items.map((c) => ({
            label: `#${c.rank} · ${shorten(c.title, 44)}`,
            to: `/contracts/${c.id}`,
          })),
          suggestions: ['Explain the first one', 'How is the score calculated?'],
          listed: list.items.map((c) => ({ rank: c.rank, id: c.id })),
        };
      }
      case 'contract': {
        const c = await fetchJson<ContractDetail>(withRun(`/api/contracts/${lookup.id}`, run));
        return explainContract(c);
      }
      case 'rank': {
        const list = await fetchJson<ContractList>(
          withRun(`/api/contracts?sort=rank&page=${lookup.rank}&pageSize=1`, run),
        );
        const row = list.items[0];
        if (!row) {
          return {
            mood: 'shrug',
            text: [
              `There is no rank ${formatCount(lookup.rank)} in this scoring run: it ranks ${plural(list.total, 'contract')}.`,
            ],
            suggestions: ['Show the top flagged contracts'],
          };
        }
        const c = await fetchJson<ContractDetail>(withRun(`/api/contracts/${row.id}`, run));
        return explainContract(c);
      }
      case 'reasons': {
        const overview = await fetchJson<Overview>(withRun('/api/overview', run));
        const reasons = [...overview.mainReasons].sort((x, y) => y.count - x.count);
        const total = reasons.reduce((sum, r) => sum + r.count, 0);
        if (!total) {
          return { mood: 'shrug', text: ['No contracts are flagged in this scoring run.'] };
        }
        return {
          mood: 'explain',
          text: [
            'The main reason is the indicator that raised a flagged contract’s score the most. In this scoring run:',
            ...reasons.map(
              (r) =>
                `${INDICATORS[r.indicator].label}: ${plural(r.count, 'flagged contract')} (${formatPercent(r.count / total, 0)}).`,
            ),
            'A reason that rarely leads does not mean the indicator is unused: it still adds points where it combines with others.',
          ],
          links: [{ label: 'Main reasons on Patterns', to: '/patterns' }],
          suggestions: ['What are the four indicators?', 'Show the top flagged contracts'],
        };
      }
      case 'search': {
        const s = await fetchJson<Suggestions>(
          withRun(`/api/suggest?${new URLSearchParams({ q: lookup.text.slice(0, 80) })}`, run),
        );
        const links: Link[] = [
          ...s.places.slice(0, 2).map((p) => ({
            label: `${p.name}: ${formatCount(p.flagged)} flagged`,
            to: `/?${new URLSearchParams({ [p.kind]: p.name })}`,
          })),
          ...s.entities.slice(0, 2).map((e) => ({
            label: `${e.name}: ${formatCount(e.flagged)} flagged`,
            to: `/profile/entity?${new URLSearchParams({ name: e.key })}`,
          })),
          ...s.awardees.slice(0, 1).map((a) => ({
            label: `${a.name}: ${formatCount(a.flagged)} flagged`,
            to: `/profile/awardee?${new URLSearchParams({ name: a.key })}`,
          })),
          ...s.contracts.slice(0, 2).map((c) => ({
            label: `Contract #${c.rank}: ${shorten(c.title, 48)}`,
            to: `/contracts/${c.id}`,
          })),
        ];
        if (!links.length) {
          return {
            mood: 'shrug',
            text: [
              `I found nothing matching “${lookup.text}”. Try a province, city, procuring entity or awardee name.`,
            ],
            suggestions: ['Find contracts in Cebu', 'How do I filter the list?'],
          };
        }
        // Places answer "how many" questions in words too, not only in the links.
        const places = s.places
          .slice(0, 2)
          .map(
            (p) =>
              `${p.name} (${p.kind === 'city' ? 'city or municipality' : 'province'}): ${formatCount(p.flagged)} flagged of ${plural(p.contracts, 'contract')} screened.`,
          );
        return {
          mood: 'point',
          text: [
            `Here’s what matches “${lookup.text}”. Pick one to open it.`,
            ...places,
            ...(places.length ? [CAVEAT] : []),
          ],
          links,
          suggestions: ['Show the top flagged contracts'],
          listed: s.contracts.slice(0, 2).map((c) => ({ rank: c.rank, id: c.id })),
        };
      }
    }
  } catch (error) {
    const notFound = error instanceof Error && error.message === 'Not found';
    return {
      mood: 'shrug',
      text: [
        notFound
          ? 'I couldn’t find that contract. Contract numbers are the ones in the address bar, like /contracts/123.'
          : 'I couldn’t reach the data just now. Please try again in a moment.',
      ],
      suggestions: STARTERS,
    };
  }
}

/** Every written reply, for tests and the style guide. */
export const allWrittenReplies = (): { id: string; reply: Reply }[] =>
  TOPICS.map((t) => ({ id: t.id, reply: withTopic(t) }));
