import { Plus, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { normalizeSearch } from '../../shared/data/repository';

export interface ListEntry {
  id: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  searchText?: string;
}

/** Left-hand list of the user's own builds/teams with search and a create button. */
export function ListPane({
  label,
  entries,
  selectedId,
  onSelect,
  onCreate,
  createLabel
}: {
  label: string;
  entries: ListEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  createLabel: string;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const normalized = normalizeSearch(query);
  const visible = normalized
    ? entries.filter((entry) => normalizeSearch(`${entry.title} ${entry.subtitle ?? ''} ${entry.searchText ?? ''}`).includes(normalized))
    : entries;

  return (
    <aside className="list-pane" aria-label={label}>
      <button type="button" className="btn btn-primary btn-block" onClick={onCreate}>
        <Plus size={16} />
        {createLabel}
      </button>
      {entries.length > 6 && (
        <label className="list-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search {label}</span>
          <input value={query} placeholder={`Search ${label.toLowerCase()}…`} onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}
      <ul className="list-entries">
        {visible.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={`list-entry ${entry.id === selectedId ? 'is-selected' : ''}`}
              aria-current={entry.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(entry.id)}
            >
              {entry.leading}
              <span className="list-entry-text">
                <strong>{entry.title}</strong>
                {entry.subtitle && <small>{entry.subtitle}</small>}
              </span>
              {entry.trailing && <span className="list-entry-trailing">{entry.trailing}</span>}
            </button>
          </li>
        ))}
        {visible.length === 0 && entries.length > 0 && <li className="muted list-none">Nothing matches “{query}”.</li>}
      </ul>
    </aside>
  );
}
