import { Icon } from './design';

export const CiOnlyIndicator = () => (
  <span
    tabIndex={0}
    aria-label="CI only"
    className="group/ci relative inline-flex shrink-0 items-center text-ink-3"
  >
    <Icon name="lock" size={13} />
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-plane px-2 py-1 text-ink-2 shadow-lg group-hover/ci:block group-focus/ci:block"
    >
      CI only
    </span>
  </span>
);
