import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useApi, withRun } from '../api';
import { formatCount, formatPesoCompact, plural } from '../format';
import {
  placeTotals,
  REGION_CODES,
  regionTotals,
  type MapIndex,
  type PlaceRow,
  type PlaceTotals,
  type Undrawn,
} from '../map/places';
import { decode, fit, type Shape, type Topology } from '../map/topojson';

type Metric = 'value' | 'count';

type Level =
  | { kind: 'country' }
  | { kind: 'region'; region: number }
  | { kind: 'province'; region: number; province: number };

/** What the review list is filtered to when a place is chosen. */
export interface PlaceFilter {
  region: string;
  province: string;
  city: string;
}

const MAP_WIDTH = 600;
const SHADES = 5;

// Map files are fetched once per page load and kept.
const files = new Map<string, Promise<unknown>>();
function load<T>(path: string): Promise<T> {
  if (!files.has(path)) {
    files.set(
      path,
      fetch(path).then((response) => {
        if (!response.ok) throw new Error(`Map file not found: ${path}`);
        return response.json();
      }),
    );
  }
  return files.get(path) as Promise<T>;
}

/** "NCR, Second District (Not a Province)" reads better without the note. */
const cleanName = (name: unknown) =>
  String(name ?? '')
    .replace(/\s*\(Not a Province\)/i, '')
    .replace(/^NCR, /, '');

const REGION_LABEL = new Map(Object.entries(REGION_CODES).map(([label, code]) => [code, label]));

const metricOf = (totals: PlaceTotals | Undrawn | undefined, metric: Metric) =>
  totals ? (metric === 'value' ? totals.flaggedValue : totals.flagged) : 0;

/** Shade steps from the spread of values on screen, so a level is never all one colour. */
function shadeSteps(values: number[]) {
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!positive.length) return () => 0;
  const cuts = Array.from(
    { length: SHADES - 1 },
    (_, i) => positive[Math.floor(((i + 1) * positive.length) / SHADES)]!,
  );
  return (value: number) => (value <= 0 ? 0 : 1 + cuts.filter((cut) => value >= cut).length);
}

interface Drawn {
  code: number;
  name: string;
  path: string;
}

const Shapes = memo(function Shapes({
  shapes,
  shade,
  selected,
  onPick,
  onHover,
  label,
}: {
  shapes: Drawn[];
  shade: (code: number) => number;
  selected: number | null;
  onPick: (code: number) => void;
  onHover: (code: number | null) => void;
  label: (code: number, name: string) => string;
}) {
  return (
    <g>
      {shapes.map((shape) => (
        <path
          key={shape.code}
          d={shape.path}
          className={`map-shape shade-${shade(shape.code)} ${shape.code === selected ? 'is-selected' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={label(shape.code, shape.name)}
          onClick={() => onPick(shape.code)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPick(shape.code);
            }
          }}
          onPointerEnter={(event) => event.pointerType === 'mouse' && onHover(shape.code)}
          onPointerLeave={(event) => event.pointerType === 'mouse' && onHover(null)}
        />
      ))}
    </g>
  );
});

/**
 * Flagged contracts by place, on a map of the Philippines: regions, then a
 * region's provinces, then a province's cities and municipalities. Choosing a
 * place filters the review list. Shapes load only when the card is on screen
 * and only for the level being looked at, to stay light on phones.
 */
export function PlaceMap({
  run,
  onFilter,
}: {
  run: number;
  onFilter: (filter: PlaceFilter) => void;
}) {
  const card = useRef<HTMLElement>(null);
  // Without IntersectionObserver (very old browsers), load straight away.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = card.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && setVisible(true),
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  const rows = useApi<PlaceRow[]>(visible ? withRun('/api/places', run) : null);
  const [level, setLevel] = useState<Level>({ kind: 'country' });
  const [metric, setMetric] = useState<Metric>('value');
  const [hovered, setHovered] = useState<number | null>(null);
  const [topology, setTopology] = useState<{ key: string; shapes: Shape[] } | null>(null);
  const [index, setIndex] = useState<MapIndex | null>(null);
  const [failed, setFailed] = useState(false);

  const file =
    level.kind === 'country'
      ? '/maps/country.json'
      : level.kind === 'region'
        ? `/maps/regions/${level.region}.json`
        : `/maps/provinces/${level.province}.json`;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    load<Topology>(file)
      .then((data) => live && setTopology({ key: file, shapes: decode(data) }))
      .catch(() => live && setFailed(true));
    // Below the country level, names have to be matched to shapes.
    if (level.kind !== 'country' && !index) {
      load<MapIndex>('/maps/index.json')
        .then((data) => live && setIndex(data))
        .catch(() => live && setFailed(true));
    }
    return () => {
      live = false;
    };
  }, [visible, file, level.kind, index]);

  const regions = useMemo(() => (rows.data ? regionTotals(rows.data) : null), [rows.data]);
  const matched = useMemo(
    () => (rows.data && index ? placeTotals(rows.data, index) : null),
    [rows.data, index],
  );

  const totalsFor = (code: number): PlaceTotals | undefined =>
    level.kind === 'country'
      ? regions?.get(code)
      : level.kind === 'region'
        ? matched?.provinces.get(code)
        : matched?.cities.get(code);

  const ready = topology?.key === file ? topology : null;
  const codeKey =
    level.kind === 'country' ? 'adm1_psgc' : level.kind === 'region' ? 'adm2_psgc' : 'adm3_psgc';
  const nameKey =
    level.kind === 'country' ? 'adm1_en' : level.kind === 'region' ? 'adm2_en' : 'adm3_en';
  const drawn = useMemo(() => {
    if (!ready) return null;
    const projection = fit(ready.shapes, MAP_WIDTH);
    return {
      height: projection.height,
      shapes: ready.shapes.map((shape) => ({
        code: Number(shape.properties[codeKey]),
        name: cleanName(shape.properties[nameKey]),
        path: projection.path(shape),
      })),
    };
  }, [ready, codeKey, nameKey]);

  const step = useMemo(
    () => shadeSteps(drawn?.shapes.map((shape) => metricOf(totalsFor(shape.code), metric)) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawn, metric, regions, matched],
  );
  const shade = (code: number) => step(metricOf(totalsFor(code), metric));

  const nameOf = (code: number) => drawn?.shapes.find((shape) => shape.code === code)?.name ?? '';
  const [names, setNames] = useState<{ region?: string; province?: string }>({});

  // Figures for this level have arrived (place names need the index below the country).
  const figuresReady = level.kind === 'country' ? Boolean(regions) : Boolean(matched);

  const describe = (totals: PlaceTotals | Undrawn | undefined) =>
    totals
      ? `${plural(totals.flagged, 'flagged contract')}, ${formatPesoCompact(totals.flaggedValue)}, of ${formatCount(totals.contracts)} screened`
      : 'No contracts in this run';

  const pick = (code: number) => {
    const totals = totalsFor(code);
    const name = nameOf(code);
    if (level.kind === 'country') {
      setNames({ region: name });
      setLevel({ kind: 'region', region: code });
      onFilter({ region: REGION_LABEL.get(code) ?? '', province: '', city: '' });
    } else if (level.kind === 'region') {
      setNames((current) => ({ ...current, province: name }));
      setLevel({ kind: 'province', region: level.region, province: code });
      onFilter({ region: '', province: [...(totals?.provinces ?? [])].join('|'), city: '' });
    } else {
      const province = matched?.provinces.get(level.province);
      onFilter({
        region: '',
        province: [...(province?.provinces ?? [])].join('|'),
        city: [...(totals?.cities ?? [])].join('|'),
      });
      setSelectedCity(code);
    }
    setHovered(null);
  };
  const [selectedCity, setSelectedCity] = useState<number | null>(null);

  const goTo = (target: Level) => {
    setLevel(target);
    setSelectedCity(null);
    if (target.kind === 'country') {
      setNames({});
      onFilter({ region: '', province: '', city: '' });
    } else if (target.kind === 'region') {
      setNames((current) => ({ region: current.region }));
      onFilter({ region: REGION_LABEL.get(target.region) ?? '', province: '', city: '' });
    }
  };

  const focus = hovered ?? selectedCity;
  const focusTotals =
    focus !== null
      ? totalsFor(focus)
      : level.kind === 'country'
        ? undefined
        : level.kind === 'region'
          ? regions?.get(level.region)
          : matched?.provinces.get(level.province);
  const focusName =
    focus !== null
      ? nameOf(focus)
      : level.kind === 'region'
        ? names.region
        : level.kind === 'province'
          ? names.province
          : 'Philippines';

  const undrawn: Undrawn[] =
    level.kind === 'province'
      ? [...(matched?.undrawn.get(level.province)?.values() ?? [])].sort(
          (a, b) => metricOf(b, metric) - metricOf(a, metric),
        )
      : [];
  const ranked = (drawn?.shapes ?? [])
    .map((shape) => ({ ...shape, totals: totalsFor(shape.code) }))
    .sort((a, b) => metricOf(b.totals, metric) - metricOf(a.totals, metric))
    .slice(0, 8);

  return (
    <section className="card place-map" ref={card} aria-labelledby="map-title">
      <div className="place-map-head">
        <div>
          <h2 id="map-title">Flagged contracts by place</h2>
          <p className="card-note">
            Where the procuring entity is based; PhilGEPS does not publish project sites. Select a
            place to zoom in and filter the list.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Shade the map by">
          <button
            type="button"
            aria-pressed={metric === 'value'}
            onClick={() => setMetric('value')}
          >
            Value
          </button>
          <button
            type="button"
            aria-pressed={metric === 'count'}
            onClick={() => setMetric('count')}
          >
            Count
          </button>
        </div>
      </div>

      <nav className="map-crumbs" aria-label="Map level">
        <button
          type="button"
          onClick={() => goTo({ kind: 'country' })}
          disabled={level.kind === 'country'}
        >
          Philippines
        </button>
        {level.kind !== 'country' && (
          <span className="map-crumb">
            <span aria-hidden="true">›</span>
            <button
              type="button"
              onClick={() => goTo({ kind: 'region', region: level.region })}
              disabled={level.kind === 'region'}
            >
              {names.region ?? 'Region'}
            </button>
          </span>
        )}
        {level.kind === 'province' && (
          <span className="map-crumb">
            <span aria-hidden="true">›</span>
            <button type="button" disabled>
              {names.province ?? 'Province'}
            </button>
          </span>
        )}
      </nav>

      <div className="place-map-body">
        <div className="map-frame" aria-busy={!drawn}>
          {failed ? (
            <p className="card-note">The map could not be loaded.</p>
          ) : drawn ? (
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${drawn.height}`}
              className="map-svg"
              role="group"
              aria-label="Map of flagged contracts"
            >
              <Shapes
                shapes={drawn.shapes}
                shade={shade}
                selected={selectedCity}
                onPick={pick}
                onHover={setHovered}
                label={(code, name) => `${name}: ${describe(totalsFor(code))}`}
              />
            </svg>
          ) : (
            <div className="skeleton map-skeleton" />
          )}
          <p className="map-legend" aria-hidden="true">
            <span>Fewer</span>
            {Array.from({ length: SHADES + 1 }, (_, i) => (
              <span key={i} className={`map-key shade-${i}`} />
            ))}
            <span>More {metric === 'value' ? 'pesos flagged' : 'flagged'}</span>
          </p>
        </div>

        <div className="map-side">
          <div className="map-focus" aria-live="polite">
            <p className="map-focus-name">{focusName}</p>
            <p className="card-note">
              {!figuresReady
                ? 'Loading figures…'
                : focus !== null || level.kind !== 'country'
                  ? describe(focusTotals)
                  : 'Select a region to begin.'}
            </p>
          </div>

          {figuresReady && (
            <table className="map-table">
              <caption className="visually-hidden">Places with the most flagged contracts</caption>
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col" className="col-num">
                    Flagged
                  </th>
                  <th scope="col" className="col-num">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((place) => (
                  <tr key={place.code}>
                    <th scope="row">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => pick(place.code)}
                      >
                        {place.name}
                      </button>
                    </th>
                    <td className="col-num">{formatCount(place.totals?.flagged ?? 0)}</td>
                    <td className="col-num">
                      {formatPesoCompact(place.totals?.flaggedValue ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {undrawn.length > 0 && (
            <div className="map-undrawn">
              <p className="card-note">
                Not drawn on the map (highly urbanized cities and unmatched names):
              </p>
              <ul>
                {undrawn.slice(0, 6).map((place) => (
                  <li key={place.name}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        onFilter({
                          region: '',
                          province: [
                            ...(matched?.provinces.get((level as { province: number }).province)
                              ?.provinces ?? []),
                          ].join('|'),
                          city: place.name,
                        })
                      }
                    >
                      {place.name}
                    </button>{' '}
                    <span className="card-note">
                      {formatCount(place.flagged)} flagged · {formatPesoCompact(place.flaggedValue)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="map-credit">
        Boundaries: PSGC (Dec 2023) via faeldon/philippines-json-maps (MIT). The Negros Island
        Region (2024) is drawn as its former regions.
      </p>
    </section>
  );
}
