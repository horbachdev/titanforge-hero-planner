import { ChevronDown, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeSearch } from '../../shared/data/repository';

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary line, e.g. item type and stats. Searchable. */
  detail?: string;
  group?: string;
  leading?: ReactNode;
  /** Extra search terms that are not displayed. */
  keywords?: string;
  disabled?: boolean;
}

interface ComboboxProps {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows a clear button and lets the user pick "nothing". */
  clearable?: boolean;
  disabled?: boolean;
  /** Text when the field is disabled because the value is fixed (e.g. built-in spirit). */
  lockedText?: string;
  hideLabel?: boolean;
  leading?: ReactNode;
  className?: string;
  emptyText?: string;
}

const MAX_VISIBLE = 80;

/**
 * Searchable select. Type to filter, arrows to move, Enter to pick, Esc to
 * close. Replaces native <select>s with hundreds of entries.
 */
export function Combobox({
  label,
  value,
  options,
  onChange,
  placeholder = 'Search…',
  clearable = false,
  disabled = false,
  lockedText,
  hideLabel = false,
  leading,
  className,
  emptyText = 'No matches'
}: ComboboxProps): JSX.Element {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) {
      return options;
    }
    return options
      .map((option) => {
        const label = normalizeSearch(option.label);
        const haystack = `${label} ${normalizeSearch(option.detail ?? '')} ${normalizeSearch(option.keywords ?? '')}`;
        const tokens = normalized.split(' ');
        const score = label.startsWith(normalized)
          ? 4
          : ` ${haystack}`.includes(` ${normalized}`)
            ? 3
            : haystack.includes(normalized)
              ? 2
              : tokens.every((token) => haystack.includes(token))
                ? 1
                : 0;
        return { option, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.option);
  }, [options, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  useEffect(() => {
    if (open) {
      const index = visible.findIndex((option) => option.value === value);
      setActive(index >= 0 && !query ? index : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  function choose(option: ComboOption | undefined): void {
    if (!option || option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    setQuery('');
  }

  function move(delta: number): void {
    if (visible.length === 0) {
      return;
    }
    let next = active;
    for (let step = 0; step < visible.length; step += 1) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next].disabled) {
        break;
      }
    }
    setActive(next);
  }

  const isLocked = disabled && Boolean(lockedText);
  let lastGroup: string | undefined;

  return (
    <div className={`field combobox ${open ? 'is-open' : ''} ${className ?? ''}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <div className={`combobox-control ${disabled ? 'is-disabled' : ''}`}>
        {(leading ?? selected?.leading) && !open && <span className="combobox-leading">{leading ?? selected?.leading}</span>}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && visible[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={isLocked ? lockedText : selected ? selected.label : placeholder}
          value={open ? query : isLocked ? (lockedText ?? '') : (selected?.label ?? '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) setOpen(true);
              else move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter') {
              if (open) {
                event.preventDefault();
                choose(visible[active]);
              }
            } else if (event.key === 'Escape') {
              if (open) {
                event.preventDefault();
                setOpen(false);
                setQuery('');
              }
            }
          }}
        />
        {clearable && value && !disabled && !open ? (
          <button
            type="button"
            className="combobox-clear"
            aria-label={`Clear ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={16} className="combobox-chevron" aria-hidden="true" />
        )}
      </div>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="combobox-list">
          {visible.length === 0 && <li className="combobox-empty">{emptyText}</li>}
          {visible.map((option, index) => {
            const header = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            return (
              <li key={option.value || '__none'} role="presentation">
                {header && <div className="combobox-group">{header}</div>}
                <div
                  id={`${id}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  className={`combobox-option ${index === active ? 'is-active' : ''} ${option.value === value ? 'is-selected' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                >
                  {option.leading && <span className="combobox-leading">{option.leading}</span>}
                  <span className="combobox-text">
                    <span className="combobox-label">{option.label}</span>
                    {option.detail && <span className="combobox-detail">{option.detail}</span>}
                  </span>
                </div>
              </li>
            );
          })}
          {filtered.length > MAX_VISIBLE && <li className="combobox-more">{filtered.length - MAX_VISIBLE} more — keep typing to narrow down</li>}
        </ul>
      )}
    </div>
  );
}
