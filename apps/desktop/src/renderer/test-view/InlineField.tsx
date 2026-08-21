import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../design';

/**
 * Editing in place.
 *
 * A field on this board is text until you click it, and an input while you
 * mean it — no edit mode, no form, no save button. Enter and blur commit;
 * Escape puts back what was there. The two states share their metrics so
 * nothing moves under the pointer when it swaps.
 */
export const InlineText = ({
  value,
  onChange,
  placeholder = 'Empty',
  mono = false,
  multiline = false,
  className = '',
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  multiline?: boolean;
  className?: string;
  label: string;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const shared = `w-full rounded border border-accent bg-plane px-1 py-px outline-none ${
    mono ? 'ui-mono' : ''
  } ${className}`;

  if (editing) {
    const props = {
      ref,
      value: draft,
      'aria-label': label,
      onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') cancel();
        if (event.key === 'Enter' && (!multiline || event.metaKey)) {
          event.preventDefault();
          commit();
        }
      },
    };
    return multiline ? (
      <textarea {...props} rows={3} className={`${shared} resize-none`} />
    ) : (
      <input {...props} className={shared} />
    );
  }

  return (
    <button
      type="button"
      aria-label={t('click_to_edit', { value1: label })}
      onClick={() => setEditing(true)}
      className={`w-full rounded border border-transparent px-1 py-px text-left hover:border-line hover:bg-raised ${
        mono ? 'ui-mono' : ''
      } ${value ? '' : 'text-ink-3'} ${className}`}
    >
      {value || placeholder}
    </button>
  );
};

/** The same idea for a closed set: a select that looks like text until used. */
export const InlineSelect = <T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) => (
  <span className={`relative inline-flex items-center ${className}`}>
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="cursor-default appearance-none rounded border border-transparent bg-transparent py-px pl-1 pr-4 text-ink outline-none hover:border-line hover:bg-raised"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
    <Icon name="caret" size={11} className="pointer-events-none absolute right-0.5 text-ink-3" />
  </span>
);

/** A togglable chip — environments a test may run in, tags it carries. */
export const Chip = ({
  on,
  onClick,
  onRemove,
  children,
}: {
  on?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-px ${
        on ? 'border-accent bg-accent-wash text-accent' : 'border-line text-ink-3 hover:text-ink'
      }`}
    >
      <button type="button" onClick={onClick} aria-pressed={on}>
        {children}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={t('remove')}
          className="text-ink-3 hover:text-ink"
          onClick={onRemove}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </span>
  );
};
