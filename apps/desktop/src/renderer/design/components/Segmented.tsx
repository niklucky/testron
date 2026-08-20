import { useTranslation } from '@warpunit/slang-react';

import { Icon, type IconName } from '../icons';

export type SegmentedItem<T extends string> = { id: T; label: string; icon?: IconName };

/**
 * A short, closed set of choices where the alternatives are worth showing.
 *
 *   solid  a hard switch that changes what the data means (7d / 14d / 30d)
 *   soft   a view swap inside a panel (actual / expected)
 *   pill   a filter over a list, sitting directly on the surface
 */
export const SegmentedControl = <T extends string>({
  items,
  value,
  onChange,
  variant = 'soft',
  label,
  className = '',
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'solid' | 'soft' | 'pill';
  label: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const pill = variant === 'pill';
  return (
    <div
      role="group"
      aria-label={t(label)}
      className={`flex items-center ${
        pill ? 'gap-1' : 'rounded-md border border-line bg-surface p-0.5'
      } ${className}`}
    >
      {items.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            className={`flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors ${
              pill ? 'h-6 rounded-full px-2.5 text-sm' : 'h-7 rounded px-3 text-sm'
            } ${
              on
                ? pill
                  ? 'bg-accent-wash text-accent'
                  : variant === 'solid'
                    ? 'bg-accent text-accent-ink'
                    : 'bg-raised text-ink'
                : 'text-ink-3 hover:text-ink'
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.icon && <Icon name={item.icon} size={13} />}
            {t(item.label)}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Tabs switch the *evidence* on screen while the subject stays the same.
 * Reach for SegmentedControl instead when the choice filters or reshapes data.
 */
export const Tabs = <T extends string>({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <div role="tablist" aria-label={t(label)} className={`flex items-center gap-1 ${className}`}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-base transition-colors ${
              on ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.icon && <Icon name={item.icon} size={14} />}
            {t(item.label)}
          </button>
        );
      })}
    </div>
  );
};
