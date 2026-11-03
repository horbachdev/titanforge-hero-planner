import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';

/** Number input that lets you type freely and only clamps when you're done. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  className
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: ReactNode;
  className?: string;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(String(value));
    }
  }, [value]);

  function commit(raw: string): void {
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value;
    setDraft(String(next));
    if (next !== value) {
      onChange(next);
    }
  }

  function bump(delta: number): void {
    const next = Math.min(max, Math.max(min, value + delta));
    setDraft(String(next));
    if (next !== value) {
      onChange(next);
    }
  }

  return (
    <div className={`field number-field ${className ?? ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="number-control">
        <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => bump(-step)}>
          <Minus size={14} />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={draft}
          onFocus={(event) => {
            focused.current = true;
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            focused.current = false;
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit((event.target as HTMLInputElement).value);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              bump(step);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              bump(-step);
            }
          }}
        />
        <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => bump(step)}>
          <Plus size={14} />
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  className
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  const id = useId();
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="text-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  size = 'md'
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string; className?: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
  size?: 'sm' | 'md';
}): JSX.Element {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </span>
      <div className={`segmented segmented-${size}`} role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            title={option.title}
            disabled={option.disabled}
            className={`${option.value === value ? 'is-active' : ''} ${option.className ?? ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
  description
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: ReactNode;
}): JSX.Element {
  return (
    <label className={`switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}): JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelector<HTMLElement>('input, button, [tabindex]');
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function ToastHost(): JSX.Element {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone ?? 'info'}`}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm btn-ghost toast-action"
              onClick={() => {
                toast.action?.run();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
