import { describe, expect, it } from 'vitest';
import type { ContractDetail, ContractList, Overview } from '../api';
import {
  allWrittenReplies,
  answer,
  distance,
  remember,
  resolve,
  STARTERS,
  type Answer,
  type Fetcher,
  type Reply,
} from './brain';

/** Topic id of a written reply, found by comparing with every topic's reply. */
function topicOf(result: Answer): string {
  if (!('reply' in result)) return `lookup:${result.lookup.kind}`;
  const match = allWrittenReplies().find(
    (t) => JSON.stringify(t.reply) === JSON.stringify(result.reply),
  );
  return match?.id ?? `mood:${result.reply.mood}`;
}

const sentences = (reply: Reply) =>
  [...reply.text, ...(reply.links ?? []).map((l) => l.label)].join(' ');

/**
 * The project's wording rules (CLAUDE.md, "Never accuse"; indicator 1 is a
 * proxy). Accusing words may appear only in a sentence that denies them.
 */
function wordingProblems(text: string): string[] {
  const problems: string[] = [];
  const parts = text.split(/(?<=[.!?:])\s+/);
  for (const sentence of parts) {
    const lower = sentence.toLowerCase();
    const denies = /\b(not|no|never|can’t|cannot|isn’t|don’t)\b/.test(lower);
    for (const word of [
      'corrupt',
      'fraud',
      'guilty',
      'steal',
      'rigg',
      'criminal',
      'anomal',
      'scam',
    ]) {
      if (lower.includes(word)) problems.push(`accusing word "${word}": ${sentence}`);
    }
    if (/wrongdoing/.test(lower) && !denies)
      problems.push(`"wrongdoing" without a denial: ${sentence}`);
    if (/\bbidders?\b|\bbids\b/.test(lower) && !denies && !/“bidders”/.test(sentence)) {
      problems.push(`bids/bidders used as a count: ${sentence}`);
    }
    if (/\b(risky|suspicious|suspect|dangerous)\b/.test(lower)) {
      problems.push(`alarm word: ${sentence}`);
    }
  }
  return problems;
}

describe('Tanod understands common questions', () => {
  const cases: [string, string][] = [
    ['hi', 'greeting'],
    ['Kumusta!', 'greeting'],
    ['Magandang umaga po', 'greeting'],
    ['salamat', 'thanks'],
    ['thank you so much', 'thanks'],
    ['bye', 'bye'],
    ['who are you?', 'who'],
    ['Are you an AI?', 'who'],
    ['What does a flag mean?', 'flag'],
    ['what is a flagged contract', 'flag'],
    ['Is a flagged contract corrupt?', 'accuse'],
    ['which mayor is stealing money', 'accuse'],
    ['sino ang kurakot', 'accuse'],
    ['is this bid rigging?', 'accuse'],
    ['How is the score calculated?', 'score'],
    ['what is the cutoff', 'score'],
    ['What are the four indicators?', 'indicators'],
    ['what is the document request proxy?', 'single_requester'],
    ['how many bidders were there', 'single_requester'],
    ['Explain repeated winner', 'repeated_winner'],
    ['Explain the award-to-budget ratio', 'price_deviation'],
    ['What are grouped small-value awards?', 'contract_splitting'],
    ['is this contract splitting', 'contract_splitting'],
    ['What are SHAP points?', 'shap'],
    ['What model do you use?', 'model'],
    ['how accurate is it', 'model'],
    ['Where does the data come from?', 'data'],
    ['why only 2024', 'data'],
    ['What are the limits?', 'limits'],
    ['What should I do with a flagged contract?', 'what_to_do'],
    ['How do I use this site?', 'howto'],
    ['How do I filter the list?', 'filter'],
    ['How do I compare contracts?', 'compare'],
    ['Can I download the data?', 'export'],
    ['do I need to sign in', 'signin'],
    ['what is procureguard', 'purpose'],
    ['turn on dark mode', 'theme'],
  ];
  it.each(cases)('“%s” → %s', (question, topic) => {
    expect(topicOf(answer(question))).toBe(topic);
  });

  it('turns data questions into lookups', () => {
    expect(answer('Show the top flagged contracts')).toMatchObject({ lookup: { kind: 'top' } });
    expect(answer('what are the highest scores')).toMatchObject({ lookup: { kind: 'top' } });
    expect(answer('How many contracts are flagged?')).toMatchObject({ lookup: { kind: 'counts' } });
    expect(answer('explain contract 42')).toMatchObject({ lookup: { kind: 'contract', id: 42 } });
    // "#7" is a rank: Tanod and the list write ranks with "#", not contract ids.
    expect(answer('what about #7')).toMatchObject({ lookup: { kind: 'rank', rank: 7 } });
    expect(answer('Find contracts in Cebu')).toMatchObject({
      lookup: { kind: 'search', text: 'cebu' },
    });
    expect(answer('search for DPWH Region VII')).toMatchObject({
      lookup: { kind: 'search', text: 'dpwh region vii' },
    });
  });

  it('explains the open contract, or asks the reader to open one', () => {
    expect(answer('why is this contract flagged?', { contractId: 9 })).toMatchObject({
      lookup: { kind: 'contract', id: 9 },
    });
    const none = answer('explain this contract');
    expect('reply' in none && none.reply.links?.[0]?.to).toBe('/');
  });

  it('never searches for an accusation', () => {
    expect(topicOf(answer('find the corrupt contractors in Cebu'))).toBe('accuse');
  });

  it('admits what it does not know and offers starters', () => {
    const result = answer('what is the weather in Manila tomorrow');
    expect('reply' in result && result.reply.mood).toBe('shrug');
    expect('reply' in result && result.reply.suggestions).toEqual(STARTERS);
    expect(topicOf(answer('   '))).toBe('mood:shrug');
  });

  it('suggests only questions it can answer', () => {
    for (const { reply } of allWrittenReplies()) {
      for (const suggestion of reply.suggestions ?? []) {
        const result = answer(suggestion);
        if ('reply' in result) expect(result.reply.mood, suggestion).not.toBe('shrug');
      }
    }
  });
});

describe('Tanod’s wording follows the project’s rules', () => {
  it.each(allWrittenReplies().map((t) => [t.id, t.reply] as const))('%s', (_id, reply) => {
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('the accusation answer says a flag is not a finding', () => {
    const result = answer('is the mayor corrupt');
    expect('reply' in result && sentences(result.reply)).toMatch(/not a finding of wrongdoing/);
  });

  it('calls document requests a proxy, never a bid count', () => {
    const result = answer('how many bidders');
    const text = 'reply' in result ? sentences(result.reply) : '';
    expect(text).toMatch(/proxy/);
    expect(text).toMatch(/never calls these “bidders”/);
  });

  it('makes no accuracy claim', () => {
    const result = answer('how accurate is the model');
    const text = 'reply' in result ? sentences(result.reply) : '';
    expect(text).toMatch(/no accuracy figure/);
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it('links only to pages that exist', () => {
    const pages = ['/', '/about', '/patterns', '/stability', '/signin'];
    for (const { reply } of allWrittenReplies()) {
      for (const link of reply.links ?? []) {
        expect(pages, link.to).toContain(link.to.split(/[?#]/)[0]);
      }
    }
  });
});

describe('Tanod looks things up', () => {
  const overview = {
    run: null,
    totals: {
      contracts: 1000,
      flagged: 50,
      totalValue: 0,
      flaggedValue: 0,
      entities: 200,
      entitiesWithFlag: 40,
    },
    histogram: [],
    mainReasons: [],
    filters: { regions: [], entityTypes: [] },
  } satisfies Overview;

  const list = {
    total: 50,
    matchedContracts: 50,
    screenedMatches: null,
    closeMatches: [],
    page: 1,
    pageSize: 3,
    items: [
      {
        id: 11,
        rank: 1,
        score: 0.91,
        title: 'Road concreting',
        entityName: 'Town A',
        mainReason: 'repeated_winner',
      },
      { id: 12, rank: 2, score: 0.88, title: 'Seawall', entityName: 'Town B', mainReason: null },
    ],
  } as unknown as ContractList;

  const detail = {
    id: 11,
    title: 'Road concreting',
    entityName: 'Town A',
    score: 0.91,
    rank: 1,
    scoredContracts: 1000,
    flagged: true,
    indicators: [
      {
        indicator: 'repeated_winner',
        value: 0.8,
        contribution: 0.2,
        context: { wins: 8, entity_awards: 10 },
      },
      {
        indicator: 'single_requester',
        value: 1,
        contribution: 0.05,
        context: { typical_requests: 4 },
      },
      { indicator: 'price_deviation', value: 0.001, contribution: 0.001, context: {} },
      { indicator: 'contract_splitting', value: null, contribution: 0, context: {} },
    ],
  } as unknown as ContractDetail;

  const fake =
    (routes: Record<string, unknown>, calls: string[] = []): Fetcher =>
    async <T>(path: string) => {
      calls.push(path);
      const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
      if (!key) throw new Error('Not found');
      return routes[key] as T;
    };

  it('counts flags for the chosen run', async () => {
    const calls: string[] = [];
    const reply = await resolve({ kind: 'counts' }, fake({ '/api/overview': overview }, calls), 3);
    expect(calls).toEqual(['/api/overview?run=3']);
    expect(reply.text[0]).toBe(
      'This scoring run covers 1,000 contracts. 50 of them (5.0%) are flagged for review.',
    );
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('lists the top flags with links', async () => {
    const reply = await resolve({ kind: 'top' }, fake({ '/api/contracts': list }), null);
    expect(reply.text[1]).toBe(
      '#1 · score 91 · Road concreting (Town A). Main reason: repeated winner.',
    );
    expect(reply.text[2]).toBe('#2 · score 88 · Seawall (Town B).');
    expect(reply.links).toEqual([
      { label: '#1 · Road concreting', to: '/contracts/11' },
      { label: '#2 · Seawall', to: '/contracts/12' },
    ]);
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('explains a contract with only the indicators that moved its score', async () => {
    const reply = await resolve(
      { kind: 'contract', id: 11 },
      fake({ '/api/contracts/11': detail }),
      null,
    );
    expect(reply.text[0]).toBe(
      'Road concreting (Town A) has a score of 91, rank 1 of 1,000. It is flagged for review.',
    );
    expect(reply.text[1]).toBe(
      'Raised by repeated winner: This awardee won 8 of the 10 bid notices this entity awarded (80%).',
    );
    expect(reply.text[2]).toMatch(/^Raised by few document requests: 1 supplier requested/);
    // Grouped small-value awards is missing outside Small Value Procurement and read
    // as "no group", so it is not reported as filled with the typical value.
    expect(reply.text).toHaveLength(4);
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('says which indicators could not be computed', async () => {
    const noPrice = {
      ...detail,
      indicators: detail.indicators.map((i) =>
        i.indicator === 'price_deviation' ? { ...i, value: null } : i,
      ),
    } as ContractDetail;
    const reply = await resolve(
      { kind: 'contract', id: 11 },
      fake({ '/api/contracts/11': noPrice }),
      null,
    );
    expect(reply.text[3]).toMatch(/^Could not be computed here: high award-to-budget ratio\./);
    expect(reply.text).toHaveLength(5);
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('searches places, entities and contracts', async () => {
    const suggest = {
      contracts: [{ id: 5, title: 'Bridge', rank: 30, flagged: true }],
      entities: [{ key: 'CEBU PROVINCE', name: 'Province of Cebu', contracts: 40, flagged: 3 }],
      awardees: [],
      places: [{ name: 'Cebu', kind: 'province', contracts: 900, flagged: 45 }],
    };
    const calls: string[] = [];
    const reply = await resolve(
      { kind: 'search', text: 'cebu' },
      fake({ '/api/suggest': suggest }, calls),
      null,
    );
    expect(calls).toEqual(['/api/suggest?q=cebu']);
    expect(reply.links).toEqual([
      { label: 'Cebu: 45 flagged', to: '/?province=Cebu' },
      { label: 'Province of Cebu: 3 flagged', to: '/profile/entity?name=CEBU+PROVINCE' },
      { label: 'Contract #30: Bridge', to: '/contracts/5' },
    ]);
  });

  it('opens the contract at a rank, or says the rank is past the end', async () => {
    const calls: string[] = [];
    const reply = await resolve(
      { kind: 'rank', rank: 1 },
      fake({ '/api/contracts/11': detail, '/api/contracts?': list }, calls),
      4,
    );
    expect(calls).toEqual([
      '/api/contracts?sort=rank&page=1&pageSize=1&run=4',
      '/api/contracts/11?run=4',
    ]);
    expect(reply.text[0]).toMatch(/^Road concreting \(Town A\) has a score of 91, rank 1/);
    const past = await resolve(
      { kind: 'rank', rank: 9999 },
      fake({ '/api/contracts?': { ...list, items: [] } }),
      null,
    );
    expect(past.text[0]).toBe('There is no rank 9,999 in this scoring run: it ranks 50 contracts.');
  });

  it('counts the main reasons among flagged contracts', async () => {
    const reply = await resolve(
      { kind: 'reasons' },
      fake({
        '/api/overview': {
          ...overview,
          mainReasons: [
            { indicator: 'price_deviation', count: 10 },
            { indicator: 'repeated_winner', count: 30 },
          ],
        },
      }),
      null,
    );
    expect(reply.text[1]).toBe('Repeated winner: 30 flagged contracts (75%).');
    expect(reply.text[2]).toMatch(/: 10 flagged contracts \(25%\)\.$/);
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('remembers the contracts it listed, so "the second one" opens', async () => {
    const reply = await resolve({ kind: 'top' }, fake({ '/api/contracts': list }), null);
    expect(reply.listed).toEqual([
      { rank: 1, id: 11 },
      { rank: 2, id: 12 },
    ]);
    const memory = remember(reply);
    expect(answer('explain the second one', { memory })).toMatchObject({
      lookup: { kind: 'contract', id: 12 },
    });
    expect(answer('#1', { memory })).toMatchObject({ lookup: { kind: 'contract', id: 11 } });
    // Without a list, an ordinal asks which list is meant instead of guessing.
    const none = answer('the second one');
    expect('reply' in none && none.reply.text[0]).toMatch(/^Which list do you mean/);
  });

  it('answers place counts in words, not only in the links', async () => {
    const suggest = {
      contracts: [],
      entities: [],
      awardees: [],
      places: [{ name: 'Cebu', kind: 'province', contracts: 900, flagged: 45 }],
    };
    const reply = await resolve(
      { kind: 'search', text: 'cebu' },
      fake({ '/api/suggest': suggest }),
      null,
    );
    expect(reply.text[1]).toBe('Cebu (province): 45 flagged of 900 contracts screened.');
    expect(wordingProblems(sentences(reply))).toEqual([]);
  });

  it('says so when nothing matches or the API is down', async () => {
    const empty = { contracts: [], entities: [], awardees: [], places: [] };
    const nothing = await resolve(
      { kind: 'search', text: 'zzz' },
      fake({ '/api/suggest': empty }),
      null,
    );
    expect(nothing.mood).toBe('shrug');
    const missing = await resolve({ kind: 'contract', id: 999 }, fake({}), null);
    expect(missing.text[0]).toMatch(/couldn’t find that contract/);
    const down: Fetcher = async () => {
      throw new Error('Request failed (500)');
    };
    expect((await resolve({ kind: 'top' }, down, null)).text[0]).toMatch(/couldn’t reach the data/);
  });
});

describe('Tanod follows a conversation', () => {
  it('reads common misspellings, but not real words as typos', () => {
    expect(distance('indicaters', 'indicators')).toBe(1);
    expect(distance('spliting', 'splitting')).toBe(1);
    expect(distance('teh', 'the')).toBe(1);
    expect(topicOf(answer('what are the indicaters'))).toBe('indicators');
    expect(topicOf(answer('explain contract spliting'))).toBe('contract_splitting');
    expect(topicOf(answer('who is corupt'))).toBe('accuse');
    // "steel" is a construction material, not a misspelled accusation.
    expect(topicOf(answer('steel prices'))).toBe('price_deviation');
    expect(topicOf(answer('How do I compare contracts?'))).toBe('compare');
  });

  it('says more about the topic it just explained', () => {
    const memory = remember(allWrittenReplies().find((t) => t.id === 'price_deviation')!.reply);
    const more = answer('tell me more', { memory });
    expect('reply' in more && more.reply.topic).toBe('price_deviation');
    expect('reply' in more && more.reply.text[0]).toMatch(/^Comparable contracts share a region/);
    const why = answer('why?', { memory: { topic: 'single_requester' } });
    expect('reply' in why && why.reply.text[0]).toMatch(/^Counts exist only for Public Bidding/);
    const nothing = answer('tell me more', { memory: { topic: 'compare' } });
    expect('reply' in nothing && nothing.reply.text[0]).toMatch(/^That’s all I have/);
  });

  it('keeps every "tell me more" within the wording rules', () => {
    for (const { id } of allWrittenReplies()) {
      const result = answer('tell me more', { memory: { topic: id } });
      if ('reply' in result) expect(wordingProblems(sentences(result.reply))).toEqual([]);
    }
  });

  it('answers two questions asked as one', () => {
    const both = answer('what is a flag and how is the score calculated');
    expect('reply' in both && both.reply.text[0]).toMatch(/statistically unusual/);
    expect('reply' in both && both.reply.topic).toBe('score');
    expect('reply' in both && both.reply.text.length).toBeGreaterThan(3);
  });

  it('keeps the last topic and list through a lookup', () => {
    const first = remember({ mood: 'explain', text: [], topic: 'model' });
    const after = remember({ mood: 'point', text: [], listed: [{ rank: 1, id: 7 }] }, first);
    expect(after).toEqual({ topic: 'model', listed: [{ rank: 1, id: 7 }] });
  });

  it.each([
    ['how many contracts are in Cebu', { kind: 'search', text: 'cebu' }],
    ['show me flagged contracts in Davao', { kind: 'search', text: 'davao' }],
    ['how many flagged in this run', { kind: 'counts' }],
    ['what is the most common reason for a flag', { kind: 'reasons' }],
    ['ilan ang flagged', { kind: 'counts' }],
    ['contract #12', { kind: 'rank', rank: 12 }],
    ['/contracts/88', { kind: 'contract', id: 88 }],
  ])('“%s” is a lookup', (question, lookup) => {
    expect(answer(question)).toMatchObject({ lookup });
  });

  it.each([
    ['do other algorithms agree', 'agreement'],
    ['what is ECOD', 'agreement'],
    ['is the ranking stable', 'agreement'],
    ['what if a value is missing', 'missing'],
    ['what is a procuring entity', 'terms'],
    ['which entity has the most flags', 'most_flags'],
    ['how do i read the chart', 'charts'],
    ['whats new', 'new'],
    ['paano gamitin ito', 'howto'],
    ['ok', 'smalltalk'],
    ['what is the first indicator', 'indicators'],
    ['what does main reason mean', 'shap'],
  ])('“%s” → %s', (question, topic) => {
    expect(topicOf(answer(question))).toBe(topic);
  });
});
