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
}

export type Lookup =
  | { kind: 'top' }
  | { kind: 'counts' }
  | { kind: 'contract'; id: number }
  | { kind: 'search'; text: string };

export type Answer = { reply: Reply } | { lookup: Lookup; thinking: Reply };

/** What Tanod knows about where the reader is. */
export interface Context {
  /** The contract open in the side panel, if any. */
  contractId?: number | null;
}

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
}

/** How strongly a question matches a topic: the words of every cue found in it. */
function score(question: string, words: Set<string>, topic: Topic): number {
  let total = 0;
  for (const cue of topic.cues) {
    if (cue.includes(' ')) {
      if (` ${question} `.includes(` ${cue} `)) total += 2 + cue.split(' ').length;
    } else if (words.has(cue) || (cue.length > 4 && [...words].some((w) => w.startsWith(cue)))) {
      total += 1;
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
      suggestions: ['What are the limits?', 'Where does the data come from?'],
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
  /\bhow many\b.*\b(flag|flagged|contract|contracts)\b|\b(total|count|number of)\b.*\b(flag|flagged)\b/;
const CONTRACT_ID = /\bcontract\s*(?:no|number|id)?\s*(\d{1,9})\b|#\s*(\d{1,9})\b/;
const THIS_CONTRACT =
  /\b(why|explain|tell me about|what about|score of|reasons? for)\b.{0,30}\b(this|that|current|open) (contract|one|project)\b|\bwhy (is|was) (this|it) (flagged|scored|ranked)\b|\bexplain (this|it)\b/;
const SEARCH =
  /^(?:please\s+)?(?:find|search(?: for)?|look up|lookup|show(?: me)?|hanap(?:in)?)\s+(?:the\s+)?(?:flagged\s+)?(?:contracts?|projects?|awards?)?\s*(?:in|from|for|by|of|sa|ng|about|named)?\s+(.+)$/;

const THINKING: Reply = { mood: 'think', text: ['Sandali, let me check…'] };

/** Turn a question into a written reply or a lookup. */
export function answer(question: string, context: Context = {}): Answer {
  const q = normalize(question);
  if (!q) {
    return {
      reply: {
        mood: 'shrug',
        text: ['Type a question and I’ll do my best.'],
        suggestions: STARTERS,
      },
    };
  }

  const id = CONTRACT_ID.exec(question.toLowerCase());
  if (id) return { lookup: { kind: 'contract', id: Number(id[1] ?? id[2]) }, thinking: THINKING };
  if (THIS_CONTRACT.test(q)) {
    if (context.contractId) {
      return { lookup: { kind: 'contract', id: context.contractId }, thinking: THINKING };
    }
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
  if (COUNTS.test(q)) return { lookup: { kind: 'counts' }, thinking: THINKING };
  if (TOP.test(q)) return { lookup: { kind: 'top' }, thinking: THINKING };

  // Accusing questions win over everything else, even with other topic words in them.
  const words = new Set(q.split(' '));
  const accuse = TOPICS.find((t) => t.id === 'accuse')!;
  if (score(q, words, accuse) > 0) return { reply: accuse.reply() };

  const search = SEARCH.exec(q);
  if (search && search[1].length >= 2 && !/^(the )?(top|flag)/.test(search[1])) {
    return { lookup: { kind: 'search', text: search[1] }, thinking: THINKING };
  }

  let best: Topic | null = null;
  let bestScore = 0;
  for (const topic of TOPICS) {
    const s = score(q, words, topic);
    if (s > bestScore) {
      best = topic;
      bestScore = s;
    }
  }
  if (best) return { reply: best.reply() };

  return {
    reply: {
      mood: 'shrug',
      text: [
        'Pasensya, I didn’t catch that. I know about flags and scores, the four indicators, the data, and how to use this site. I can also look up contracts.',
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
          links: list.items.map((c) => ({ label: `Open #${c.rank}`, to: `/contracts/${c.id}` })),
          suggestions: ['How is the score calculated?', 'What does a flag mean?'],
        };
      }
      case 'contract': {
        const c = await fetchJson<ContractDetail>(withRun(`/api/contracts/${lookup.id}`, run));
        const reasons = c.indicators
          .filter((i) => i.value !== null && Math.abs(i.contribution) >= NOTABLE)
          .sort((a, b) => b.contribution - a.contribution);
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
              : [
                  'None of the four indicators moved its score much; it sits near the starting level.',
                ]),
            c.flagged
              ? CAVEAT
              : 'A low score is not a clean bill of health either: it only means the indicators look typical.',
          ],
          links: [{ label: 'Open this contract', to: `/contracts/${c.id}` }],
          suggestions: ['What are SHAP points?', 'What should I do with a flagged contract?'],
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
        return {
          mood: 'point',
          text: [`Here’s what matches “${lookup.text}”. Pick one to open it.`],
          links,
          suggestions: ['Show the top flagged contracts'],
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
  TOPICS.map((t) => ({ id: t.id, reply: t.reply() }));
