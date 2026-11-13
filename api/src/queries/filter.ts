/** Search words and the WHERE clause shared by the contract list and the CSV export. */
import type { Db, ListFilters } from './shared.js';

export type ContractFilters = Omit<ListFilters, 'sort' | 'page' | 'pageSize' | 'grouped'>;

/** A search word, and whether it matched nothing exactly and so matches close spellings. */
export interface SearchTerm {
  word: string;
  fuzzy: boolean;
}

const MAX_SEARCH_WORDS = 8;

/** A LIKE pattern matching the word anywhere, with LIKE's wildcards taken literally. */
export const likePattern = (word: string) => `%${word.replace(/[\\%_]/g, '\\$&')}%`;

/** The lower-case words of a search, without repeats. */
export const searchWords = (q: string | undefined) =>
  [...new Set((q ?? '').toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_SEARCH_WORDS);

/**
 * Decide per word whether to match exactly or allow typos. A word that appears
 * somewhere in the data matches exactly, because typo matching on it adds noise
 * ("imus" would also find "various improvement"). A word found nowhere ("imuz")
 * falls back to close spellings through the trigram index.
 */
export async function resolveSearch(db: Db, q: string | undefined): Promise<SearchTerm[]> {
  const words = searchWords(q);
  if (!words.length) return [];
  const { rows } = await db.query(
    `SELECT t.i::int AS i,
            NOT EXISTS (SELECT 1 FROM contracts WHERE search_text LIKE t.pattern) AS fuzzy
     FROM unnest($1::text[]) WITH ORDINALITY AS t(pattern, i)`,
    [words.map(likePattern)],
  );
  const fuzzy = new Map<number, boolean>(rows.map((row) => [row.i, Boolean(row.fuzzy)]));
  return words.map((word, index) => ({ word, fuzzy: fuzzy.get(index + 1) ?? false }));
}

/** WHERE clause and parameters shared by the paged list and the CSV export. */
export function contractFilter(runId: number, filters: ContractFilters, terms: SearchTerm[] = []) {
  const where = ['s.run_id = $1'];
  const params: unknown[] = [runId];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replaceAll('?', `$${params.length}`));
  };

  // Every word must match somewhere: title, entity, awardee, references, city or province.
  for (const term of terms) {
    if (term.fuzzy) add('? <% c.search_text', term.word);
    else add('c.search_text LIKE ?', likePattern(term.word));
  }
  if (filters.region) add('c.region = ?', filters.region);
  if (filters.provinces?.length) add('c.province = ANY(?)', filters.provinces);
  if (filters.cities?.length) add('c.city_municipality = ANY(?)', filters.cities);
  if (filters.entityType) add('c.entity_type_group = ?', filters.entityType);
  if (filters.entity) add('c.procuring_entity = ?', filters.entity);
  if (filters.awardee) add('c.awardee = ?', filters.awardee);
  if (filters.reason) add('r.main_reason = ?', filters.reason);
  if (filters.scoreFrom !== undefined) add('s.risk_score >= ?', filters.scoreFrom);
  // The top band includes a score of exactly 1.
  if (filters.scoreTo !== undefined && filters.scoreTo < 1)
    add('s.risk_score < ?', filters.scoreTo);
  if (filters.flaggedOnly) where.push('s.is_flagged');
  return { where: where.join(' AND '), params };
}
