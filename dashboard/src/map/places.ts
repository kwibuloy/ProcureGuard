/**
 * Match PhilGEPS place names (region, province, city/municipality of the
 * procuring entity) to the boundary files' PSGC codes, and add up flagged
 * contracts per map shape.
 *
 * Measured on the 2024 data: 99.9% of contracts match a province and about 90%
 * a city. Most of the rest are highly urbanized cities (Iloilo City, Cebu
 * City...), which the boundary files do not draw; they still count towards
 * their region and province and are listed by name.
 */

export interface PlaceRow {
  region: string | null;
  province: string | null;
  city: string | null;
  contracts: number;
  flagged: number;
  flaggedValue: number;
}

export interface MapIndex {
  regions: { code: number; name: string }[];
  provinces: { code: number; name: string; region: number }[];
  cities: { code: number; name: string; province: number; region: number }[];
}

export interface Totals {
  contracts: number;
  flagged: number;
  flaggedValue: number;
}

/** A place on the map, with its totals and the PhilGEPS spellings that matched it. */
export interface PlaceTotals extends Totals {
  regions: Set<string>;
  provinces: Set<string>;
  cities: Set<string>;
}

/** PhilGEPS region labels and the boundary files' region codes. */
export const REGION_CODES: Record<string, number> = {
  'Region I': 100000000,
  'Region II': 200000000,
  'Region III': 300000000,
  'Region IV-A': 400000000,
  'Region V': 500000000,
  'Region VI': 600000000,
  'Region VII': 700000000,
  'Region VIII': 800000000,
  'Region IX': 900000000,
  'Region X': 1000000000,
  'Region XI': 1100000000,
  'Region XII': 1200000000,
  NCR: 1300000000,
  CAR: 1400000000,
  Caraga: 1600000000,
  'Region IV-B': 1700000000,
  BARMM: 1900000000,
};

/**
 * The Negros Island Region was formed in 2024, after the boundary files'
 * December 2023 edition; its provinces are drawn in their former regions.
 */
const NEGROS_ISLAND: Record<string, number> = {
  'negros occidental': 600000000,
  'negros oriental': 700000000,
  siquijor: 700000000,
};

const base = (name: string | null) =>
  (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\bsta\b/g, 'santa')
    .replace(/\bsto\b/g, 'santo')
    .replace(/\bgen\b/g, 'general')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

/** "Imus City" and "City of Imus" are written both ways. */
export const placeKey = (name: string | null) => {
  const plain = base(name);
  const city = /^(.*) city$/.exec(plain);
  return city && !plain.startsWith('city of ') ? `city of ${city[1]}` : plain;
};

const bareKey = (name: string | null) => placeKey(name).replace(/^city of /, '');
const provinceKey = (name: string | null) => base(name).replace(/^province of /, '');

/** Similarity from 0 to 1 (1 - edit distance / longer length). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}

type City = MapIndex['cities'][number];

/** The one city in `pool` the name matches: exact, then without "City of", then a close spelling. */
function pickCity(pool: City[], name: string): City | null {
  const key = placeKey(name);
  const exact = pool.filter((city) => placeKey(city.name) === key);
  if (exact.length === 1) return exact[0]!;
  const bare = bareKey(name);
  const loose = pool.filter((city) => bareKey(city.name) === bare);
  if (loose.length === 1) return loose[0]!;
  // A close spelling ("Damanjug" for Dumanjug), only when one candidate clearly wins.
  const scored = pool
    .map((city) => ({ city, score: similarity(placeKey(city.name), key) }))
    .filter(({ score }) => score >= 0.85)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1) return scored[0]!.city;
  if (scored.length > 1 && scored[0]!.score - scored[1]!.score > 0.05) return scored[0]!.city;
  return null;
}

export interface Resolved {
  region: number | null;
  province: number | null;
  city: number | null;
}

export function makeResolver(index: MapIndex) {
  const citiesByRegion = new Map<number, City[]>();
  for (const city of index.cities) {
    citiesByRegion.set(city.region, [...(citiesByRegion.get(city.region) ?? []), city]);
  }
  const cache = new Map<string, Resolved>();
  return (row: Pick<PlaceRow, 'region' | 'province' | 'city'>): Resolved => {
    const cacheKey = `${row.region}|${row.province}|${row.city}`;
    const known = cache.get(cacheKey);
    if (known) return known;
    const region =
      row.region === 'Negros Island Region'
        ? (NEGROS_ISLAND[provinceKey(row.province)] ?? null)
        : (REGION_CODES[row.region ?? ''] ?? null);
    let province: number | null = null;
    let city: number | null = null;
    if (region) {
      const matches = index.provinces.filter(
        (p) => p.region === region && provinceKey(p.name) === provinceKey(row.province),
      );
      province = matches.length === 1 ? matches[0]!.code : null;
      const pool = citiesByRegion.get(region) ?? [];
      if (row.city) {
        const found =
          (province !== null &&
            pickCity(
              pool.filter((c) => c.province === province),
              row.city,
            )) ||
          pickCity(pool, row.city);
        if (found) {
          city = found.code;
          province = found.province;
        }
      }
    }
    const resolved = { region, province, city };
    cache.set(cacheKey, resolved);
    return resolved;
  };
}

const empty = (): PlaceTotals => ({
  contracts: 0,
  flagged: 0,
  flaggedValue: 0,
  regions: new Set(),
  provinces: new Set(),
  cities: new Set(),
});

function add(map: Map<number, PlaceTotals>, code: number, row: PlaceRow) {
  const totals = map.get(code) ?? empty();
  totals.contracts += row.contracts;
  totals.flagged += row.flagged;
  totals.flaggedValue += row.flaggedValue;
  if (row.region) totals.regions.add(row.region);
  if (row.province) totals.provinces.add(row.province);
  if (row.city) totals.cities.add(row.city);
  map.set(code, totals);
}

/** Totals by region code, which need no index: the region label says it. */
export function regionTotals(rows: PlaceRow[]) {
  const regions = new Map<number, PlaceTotals>();
  for (const row of rows) {
    const code =
      row.region === 'Negros Island Region'
        ? NEGROS_ISLAND[provinceKey(row.province)]
        : REGION_CODES[row.region ?? ''];
    if (code) add(regions, code, row);
  }
  return regions;
}

/** Places matched to no city shape in a province: listed by name beside the map. */
export interface Undrawn extends Totals {
  name: string;
}

export function placeTotals(rows: PlaceRow[], index: MapIndex) {
  const resolve = makeResolver(index);
  const provinces = new Map<number, PlaceTotals>();
  const cities = new Map<number, PlaceTotals>();
  const undrawn = new Map<number, Map<string, Undrawn>>();
  let matchedProvince = 0;
  let matchedCity = 0;
  let all = 0;
  for (const row of rows) {
    const resolved = resolve(row);
    all += row.contracts;
    if (resolved.province === null) continue;
    matchedProvince += row.contracts;
    add(provinces, resolved.province, row);
    if (resolved.city !== null) {
      matchedCity += row.contracts;
      add(cities, resolved.city, row);
    } else {
      const inProvince = undrawn.get(resolved.province) ?? new Map<string, Undrawn>();
      const name = row.city ?? 'City not published';
      const entry = inProvince.get(name) ?? { name, contracts: 0, flagged: 0, flaggedValue: 0 };
      entry.contracts += row.contracts;
      entry.flagged += row.flagged;
      entry.flaggedValue += row.flaggedValue;
      inProvince.set(name, entry);
      undrawn.set(resolved.province, inProvince);
    }
  }
  return {
    provinces,
    cities,
    undrawn,
    coverage: { contracts: all, province: matchedProvince, city: matchedCity },
  };
}
