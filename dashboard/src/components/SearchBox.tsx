import { useEffect, useId, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi, withRun } from '../api';
import { formatCount } from '../format';
import { profileLink } from '../links';
import { Icon, type IconName } from './Icon';

interface Suggestions {
  contracts: { id: number; title: string; rank: number; flagged: boolean }[];
  entities: { key: string; name: string; contracts: number; flagged: number }[];
  awardees: { key: string; name: string; contracts: number; flagged: number }[];
  places: { name: string; kind: 'province' | 'city'; contracts: number; flagged: number }[];
}

interface Option {
  id: string;
  group: string;
  icon: IconName;
  label: string;
  note: string;
  choose: () => void;
}

/**
 * The contract search, with suggestions as you type: contracts, procuring
 * entities, awardees and places, each with how many flagged contracts it has.
 * Typing still filters the list as before; a suggestion is a shortcut.
 */
export function SearchBox({
  text,
  setText,
  searchBox,
  phone,
  runId,
  onPlace,
}: {
  text: string;
  setText: (text: string) => void;
  searchBox: RefObject<HTMLInputElement | null>;
  phone: boolean;
  runId: number | null;
  onPlace: (place: { name: string; kind: 'province' | 'city' }) => void;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(text);

  // Ask for suggestions after a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(text.trim()), 180);
    return () => clearTimeout(timer);
  }, [text]);

  const found = useApi<Suggestions>(
    open && typed.length >= 2
      ? withRun(`/api/suggest?${new URLSearchParams({ q: typed })}`, runId)
      : null,
  );
  const data = found.data;
  const flaggedNote = (flagged: number, contracts: number) =>
    `${formatCount(flagged)} flagged of ${formatCount(contracts)}`;

  const options: Option[] = data
    ? [
        ...data.contracts.map((item) => ({
          id: `c${item.id}`,
          group: 'Contracts',
          icon: 'flag' as IconName,
          label: item.title,
          note: `Rank ${formatCount(item.rank)}${item.flagged ? ' · flagged' : ''}`,
          choose: () => navigate({ pathname: `/contracts/${item.id}`, search }),
        })),
        ...data.entities.map((item) => ({
          id: `e${item.key}`,
          group: 'Procuring entities',
          icon: 'building' as IconName,
          label: item.name,
          note: flaggedNote(item.flagged, item.contracts),
          choose: () => navigate(profileLink('entity', item.key)),
        })),
        ...data.awardees.map((item) => ({
          id: `a${item.key}`,
          group: 'Awardees',
          icon: 'repeated_winner' as IconName,
          label: item.name,
          note: flaggedNote(item.flagged, item.contracts),
          choose: () => navigate(profileLink('awardee', item.key)),
        })),
        ...data.places.map((item) => ({
          id: `p${item.kind}${item.name}`,
          group: 'Places',
          icon: 'map' as IconName,
          label: item.name,
          note: `${item.kind === 'city' ? 'City or municipality' : 'Province'} · ${flaggedNote(item.flagged, item.contracts)}`,
          choose: () => onPlace(item),
        })),
      ]
    : [];

  const showing = open && typed.length >= 2 && text.trim().length >= 2;
  const choose = (option: Option) => {
    setOpen(false);
    setActive(-1);
    option.choose();
  };

  return (
    <div className="field field-search search-box">
      <label htmlFor={`${listId}-input`} className="visually-hidden">
        Search contracts
      </label>
      <Icon name="search" />
      <input
        id={`${listId}-input`}
        ref={searchBox}
        type="search"
        role="combobox"
        aria-expanded={showing && options.length > 0}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={phone ? 'Search contracts' : 'Search project, place or name'}
        title="Search by project title, city or province, procuring entity, awardee, or reference number"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && options.length) {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (index + 1) % options.length);
          } else if (event.key === 'ArrowUp' && options.length) {
            event.preventDefault();
            setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
          } else if (event.key === 'Enter' && showing && options[active]) {
            event.preventDefault();
            choose(options[active]!);
          } else if (event.key === 'Escape' && showing) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <kbd aria-hidden="true">/</kbd>

      {showing && (
        <div className="suggest" id={`${listId}-list`} role="listbox" aria-label="Suggestions">
          {!data ? (
            <p className="suggest-note">
              <span className="spinner" aria-hidden="true" /> Looking
            </p>
          ) : options.length === 0 ? (
            <p className="suggest-note">No suggestions. Press Enter to search the list.</p>
          ) : (
            options.map((option, index) => (
              <div key={option.id}>
                {(index === 0 || options[index - 1]!.group !== option.group) && (
                  <p className="suggest-group" aria-hidden="true">
                    {option.group}
                  </p>
                )}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`suggest-option ${index === active ? 'is-active' : ''}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onPointerEnter={() => setActive(index)}
                >
                  <Icon name={option.icon} size={16} />
                  <span className="suggest-label">{option.label}</span>
                  <span className="suggest-meta">{option.note}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
