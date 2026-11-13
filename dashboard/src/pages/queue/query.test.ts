import { describe, expect, it } from 'vitest';
import { exportShortfall, filterChips, readQuery, sheetFilterCount } from './query';

describe('readQuery', () => {
  it('opens on flagged contracts ranked by score', () => {
    const query = readQuery(new URLSearchParams());

    expect(query).toMatchObject({ flaggedOnly: true, sort: 'rank', page: 1, grouped: false });
  });

  it('reads the filters and ignores an unknown sort or a bad page', () => {
    const query = readQuery(new URLSearchParams('show=all&sort=bogus&page=-3&group=1&q=road'));

    expect(query).toMatchObject({ flaggedOnly: false, sort: 'rank', page: 1, grouped: true });
    expect(query.q).toBe('road');
  });
});

describe('filterChips', () => {
  it('names the first spelling of a map shape and clears the province with the city', () => {
    const chips = filterChips(readQuery(new URLSearchParams('city=Imus|IMUS&province=Cavite')));

    expect(chips).toEqual([{ label: 'Imus', clear: { city: '', province: '' } }]);
  });

  it('shows a score band in points', () => {
    const chips = filterChips(readQuery(new URLSearchParams('scoreFrom=0.6&scoreTo=0.65')));

    expect(chips.map((chip) => chip.label)).toEqual(['Score 60 to 65']);
  });

  it('counts the filters behind the phone sheet, a non-default sort included', () => {
    expect(sheetFilterCount(readQuery(new URLSearchParams('region=NCR&sort=amount')))).toBe(2);
  });
});

describe('exportShortfall', () => {
  it('is how many matching contracts the export leaves out', () => {
    expect(exportShortfall(15_000, 12_000)).toBe(3_000);
  });

  it('is 0 when the export holds them all, or the limit is not known', () => {
    expect(exportShortfall(12_000, 12_000)).toBe(0);
    expect(exportShortfall(4_511, 12_000)).toBe(0);
    expect(exportShortfall(90_000, undefined)).toBe(0);
  });
});
