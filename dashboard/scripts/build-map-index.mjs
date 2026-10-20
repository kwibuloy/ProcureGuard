// Builds public/maps/index.json: every region, province and city/municipality
// in the boundary files, with its PSGC code, so the dashboard can match
// PhilGEPS place names to map shapes without loading every shape first.
//
// Run from dashboard/: node scripts/build-map-index.mjs
//
// Boundary files: github.com/faeldon/philippines-json-maps (MIT), 2023 PSGC,
// low resolution. See public/maps/LICENSE.txt.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAPS = join(import.meta.dirname, '..', 'public', 'maps');
const read = (path) => JSON.parse(readFileSync(join(MAPS, path), 'utf8'));
const geometries = (topology) => Object.values(topology.objects)[0].geometries;

const regions = geometries(read('country.json')).map(({ properties: p }) => ({
  code: p.adm1_psgc,
  name: p.adm1_en,
}));

const provinces = readdirSync(join(MAPS, 'regions')).flatMap((file) =>
  geometries(read(join('regions', file))).map(({ properties: p }) => ({
    code: p.adm2_psgc,
    name: p.adm2_en,
    region: p.adm1_psgc,
  })),
);

const cities = readdirSync(join(MAPS, 'provinces')).flatMap((file) =>
  geometries(read(join('provinces', file))).map(({ properties: p }) => ({
    code: p.adm3_psgc,
    name: p.adm3_en,
    province: p.adm2_psgc,
    region: p.adm1_psgc,
  })),
);

writeFileSync(join(MAPS, 'index.json'), JSON.stringify({ regions, provinces, cities }));
console.log(`${regions.length} regions, ${provinces.length} provinces, ${cities.length} cities`);
