import { useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ListQuery, Overview } from '../../api';
import { Icon } from '../../components/Icon';
import { SearchBox } from '../../components/SearchBox';
import { INDICATOR_ORDER, INDICATORS } from '../../indicators';
import { PERIODS, SORT_LABELS, sheetFilterCount, type Chip } from './query';

/** Search, the region, entity type, reason and sort fields, and the active-filter chips. */
export function FilterBar({
  query,
  filters,
  phone,
  text,
  setText,
  searchBox,
  chips,
  update,
  clearAll,
  runId,
}: {
  /** The scoring run shown, for search suggestions. */
  runId: number | null;
  query: ListQuery;
  filters: Overview['filters'];
  phone: boolean;
  /** The search box's text, which reaches the URL after a pause. */
  text: string;
  setText: (text: string) => void;
  searchBox: RefObject<HTMLInputElement | null>;
  chips: Chip[];
  update: (changes: Record<string, string>) => void;
  clearAll: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const placeFilters = (node: ReactNode) => (phone ? createPortal(node, document.body) : node);
  const filterCount = sheetFilterCount(query);

  return (
    <>
      <div className="filters">
        <SearchBox
          text={text}
          setText={setText}
          searchBox={searchBox}
          phone={phone}
          runId={runId}
          onPlace={(place) => {
            setText('');
            update({
              q: '',
              region: '',
              province: place.kind === 'province' ? place.name : '',
              city: place.kind === 'city' ? place.name : '',
            });
          }}
        />
        <button
          type="button"
          className="button button-outline filters-toggle phone-only"
          onClick={() => setFiltersOpen(true)}
          aria-expanded={filtersOpen}
          aria-controls="filter-fields"
        >
          <Icon name="sliders" />
          Filters{filterCount ? ` · ${filterCount}` : ''}
        </button>
        {/* On phones the other filters open as a sheet over the page. It is rendered at the
            top level, because inside the list card it could not rise above the bottom
            tab bar; on wider screens the same fields sit inline in this bar. */}
        {placeFilters(
          <>
            {filtersOpen && (
              <div
                className="sheet-scrim phone-only"
                onClick={() => setFiltersOpen(false)}
                aria-hidden="true"
              />
            )}
            <div
              id="filter-fields"
              className={`filter-fields ${filtersOpen ? 'is-open' : ''}`}
              onKeyDown={(event) => event.key === 'Escape' && setFiltersOpen(false)}
            >
              <div className="sheet-head phone-only">
                <h3>Filters</h3>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setFiltersOpen(false)}
                >
                  Done
                </button>
              </div>
              <label className="field">
                <span className="visually-hidden">Region</span>
                <select
                  value={query.region}
                  onChange={(event) => update({ region: event.target.value })}
                >
                  <option value="">All regions</option>
                  {filters.regions.map((region) => (
                    <option key={region}>{region}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="visually-hidden">Type of procuring entity</span>
                <select
                  value={query.entityType}
                  onChange={(event) => update({ entityType: event.target.value })}
                >
                  <option value="">All entity types</option>
                  {filters.entityTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="visually-hidden">Main reason</span>
                <select
                  value={query.reason}
                  onChange={(event) => update({ reason: event.target.value })}
                >
                  <option value="">Any main reason</option>
                  {INDICATOR_ORDER.map((indicator) => (
                    <option key={indicator} value={indicator}>
                      {INDICATORS[indicator].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="visually-hidden">Award date</span>
                <select
                  value={`${query.awardFrom ?? ''}|${query.awardTo ?? ''}`}
                  onChange={(event) => {
                    const [awardFrom = '', awardTo = ''] = event.target.value.split('|');
                    update({ awardFrom, awardTo });
                  }}
                >
                  <option value="|">Any award date</option>
                  {PERIODS.map((period) => (
                    <option key={period.label} value={`${period.from}|${period.to}`}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="field field-check"
                title="Flagged in this scoring run but not in the one before"
              >
                <input
                  type="checkbox"
                  checked={Boolean(query.newOnly)}
                  onChange={(event) => update({ new: event.target.checked ? '1' : '' })}
                />
                <span>New flags only</span>
              </label>
              <label className="field field-sort">
                <span className="visually-hidden">Sort order</span>
                <select
                  value={query.sort === 'rank' ? '' : query.sort}
                  onChange={(event) => update({ sort: event.target.value })}
                >
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value === 'rank' ? '' : value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>,
        )}
      </div>

      {chips.length > 0 && (
        <ul className="chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.label}>
              <button
                type="button"
                className="chip chip-removable"
                onClick={() => {
                  if ('q' in chip.clear) setText('');
                  update(chip.clear);
                }}
              >
                {chip.label}
                <Icon name="close" size={12} />
                <span className="visually-hidden">Remove filter</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="button button-quiet" onClick={clearAll}>
              Clear filters
            </button>
          </li>
        </ul>
      )}
    </>
  );
}
