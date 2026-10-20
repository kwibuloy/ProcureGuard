import { describe, expect, it } from 'vitest';
import {
  makeResolver,
  placeKey,
  placeTotals,
  regionTotals,
  similarity,
  type MapIndex,
} from './places';

const INDEX: MapIndex = {
  regions: [
    { code: 400000000, name: 'Region IV-A (CALABARZON)' },
    { code: 600000000, name: 'Region VI (Western Visayas)' },
    { code: 700000000, name: 'Region VII (Central Visayas)' },
  ],
  provinces: [
    { code: 402100000, name: 'Cavite', region: 400000000 },
    { code: 603000000, name: 'Iloilo', region: 600000000 },
    { code: 604500000, name: 'Negros Occidental', region: 600000000 },
    { code: 702200000, name: 'Cebu', region: 700000000 },
  ],
  cities: [
    { code: 402109000, name: 'City of Imus', province: 402100000, region: 400000000 },
    { code: 402123000, name: 'City of Trece Martires', province: 402100000, region: 400000000 },
    { code: 603001000, name: 'Ajuy', province: 603000000, region: 600000000 },
    { code: 604502000, name: 'City of Bago', province: 604500000, region: 600000000 },
    { code: 702228000, name: 'Dumanjug', province: 702200000, region: 700000000 },
  ],
};

const row = (region: string, province: string, city: string) => ({ region, province, city });

describe('place names', () => {
  it('treats "Imus City" and "City of Imus" as one name', () => {
    expect(placeKey('Imus City')).toBe(placeKey('City of Imus'));
    expect(placeKey('Iloilo City')).not.toBe(placeKey('Iloilo'));
  });

  it('scores close spellings', () => {
    expect(similarity('damanjug', 'dumanjug')).toBeGreaterThan(0.85);
    expect(similarity('imus', 'iloilo')).toBeLessThan(0.5);
  });
});

describe('makeResolver', () => {
  const resolve = makeResolver(INDEX);

  it('matches a city written without "City of"', () => {
    expect(resolve(row('Region IV-A', 'Cavite', 'Imus'))).toEqual({
      region: 400000000,
      province: 402100000,
      city: 402109000,
    });
  });

  it('matches a misspelled city only when one candidate clearly wins', () => {
    expect(resolve(row('Region VII', 'Cebu', 'Damanjug')).city).toBe(702228000);
    expect(resolve(row('Region IV-A', 'Cavite', 'Trece Martirez City')).city).toBe(402123000);
  });

  it('keeps a highly urbanized city in its province but draws no city shape for it', () => {
    expect(resolve(row('Region VI', 'Iloilo', 'Iloilo City'))).toEqual({
      region: 600000000,
      province: 603000000,
      city: null,
    });
  });

  it('places the Negros Island Region in its former regions', () => {
    expect(resolve(row('Negros Island Region', 'Negros Occidental', 'Bago City'))).toEqual({
      region: 600000000,
      province: 604500000,
      city: 604502000,
    });
  });
});

describe('totals', () => {
  const rows = [
    { ...row('Region IV-A', 'Cavite', 'Imus'), contracts: 61, flagged: 0, flaggedValue: 0 },
    { ...row('Region VI', 'Iloilo', 'Iloilo City'), contracts: 10, flagged: 2, flaggedValue: 5e6 },
    {
      ...row('Negros Island Region', 'Negros Occidental', 'Bago City'),
      contracts: 4,
      flagged: 1,
      flaggedValue: 1e6,
    },
  ];

  it('adds region totals from the region label alone', () => {
    const regions = regionTotals(rows);
    expect(regions.get(600000000)).toMatchObject({ contracts: 14, flagged: 3 });
    expect(regions.get(400000000)?.flagged).toBe(0);
  });

  it('lists places with no city shape under their province, and reports coverage', () => {
    const totals = placeTotals(rows, INDEX);
    expect(totals.cities.get(402109000)?.cities).toEqual(new Set(['Imus']));
    expect([...(totals.undrawn.get(603000000)?.values() ?? [])]).toEqual([
      { name: 'Iloilo City', contracts: 10, flagged: 2, flaggedValue: 5e6 },
    ]);
    expect(totals.coverage).toEqual({ contracts: 75, province: 75, city: 65 });
  });
});
