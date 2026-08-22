import type { ReactNode } from 'react';

/**
 * One icon set, one stroke weight, one 24px grid. Icons are drawn with
 * `currentColor` so they inherit whatever the surrounding text is doing —
 * never give an icon its own colour unless it *is* the status mark.
 */
const iconPaths = {
  chevron: <path d="m9.5 18 6-6-6-6" />,
  caret: <path d="m6 9.5 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  check: <path d="m5 12.8 4.6 4.6L19 6.6" />,
  alert: (
    <>
      <path d="M12 4.4 21 20H3Z" />
      <path d="M12 10.4v4.2M12 17.6v.2" />
    </>
  ),
  rerun: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.4 3.6V9h-5.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19.5 6v6c0 4.2-3.1 7.2-7.5 8.8C7.6 19.2 4.5 16.2 4.5 12V6Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3.7 2.3-5.5 5.5-5.5s5 1.8 5.5 5.5" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15.5 14.2c3.1-.7 5 .9 5.4 3.8" />
    </>
  ),
  bug: (
    <>
      <rect x="8" y="7.5" width="8" height="12" rx="4" />
      <path d="M8 11H4.5M16 11H20M8 16H4.5M16 16H20M9.5 7.5 8 5M14.5 7.5 16 5" />
    </>
  ),
  suite: (
    <>
      <path d="M9.5 3v6.2L4.8 17a2.8 2.8 0 0 0 2.4 4.2h9.6a2.8 2.8 0 0 0 2.4-4.2l-4.7-7.8V3" />
      <path d="M8 3h8M7.2 14.5h9.6" />
    </>
  ),
  test: (
    <>
      <path d="M6 3h7.5L18 7.4V21H6z" />
      <path d="M13 3v5h5" />
      <path d="m9 14.6 1.9 1.9L15 12.4" />
    </>
  ),
  steps: (
    <>
      <path d="M4 6h4v4H4zM10 12h4v4h-4zM16 18h4v3h-4z" />
      <path d="M8 8h2v4M14 14h2v4" />
    </>
  ),
  list: (
    <>
      <circle cx="4.5" cy="6.5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="17.5" r="1" />
      <path d="M8 6.5h12M8 12h12M8 17.5h12" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7.5 10 2.5 2.2-2.5 2.3M12.5 15h4" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3.2L8 6h8l1.3 2.5h3.2v10.5H3.5Z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5h6v3H9z" />
      <path d="M15 6h3v14.5H6V6h3" />
      <path d="M9 11.5h6M9 15.5h4" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M3.6 3.6V9H9" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  triage: (
    <>
      <path d="M4 6h16M4 12h11M4 18h6" />
      <circle cx="19" cy="17" r="3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 12a7 7 0 0 0-.1-1.1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L14.5 3.3h-4L10.2 6a8 8 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.1l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.9 1.1l.3 2.6h4l.3-2.6a8 8 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1.1Z" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M8.5 5.6 18 12l-9.5 6.4Z" />,
  record: <circle cx="12" cy="12" r="5.4" fill="currentColor" stroke="none" />,
  pause: <path d="M9.5 5.5v13M14.5 5.5v13" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  arrowLeft: <path d="M19 12H5.6M11.2 6.4 5.6 12l5.6 5.6" />,
  arrowRight: <path d="M5 12h13.4M12.8 6.4 18.4 12l-5.6 5.6" />,
  undo: (
    <>
      <path d="M4 9h9.8a5.5 5.5 0 0 1 0 11H8.2" />
      <path d="M7.8 4.6 3.4 9l4.4 4.4" />
    </>
  ),
  redo: (
    <>
      <path d="M20 9h-9.8a5.5 5.5 0 0 0 0 11h5.6" />
      <path d="m16.2 4.6 4.4 4.4-4.4 4.4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.4" />
      <path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  code: (
    <>
      <path d="m8.6 8.4-4.2 3.6 4.2 3.6M15.4 8.4l4.2 3.6-4.2 3.6" />
      <path d="m13.8 5.4-3.6 13.2" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.4" />
      <path d="M15 9V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v6.5A2.5 2.5 0 0 0 6 15h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.6 7h14.8M9.6 7V4.8h4.8V7" />
      <path d="m6.8 7 1 12.7h8.4L17.2 7" />
      <path d="M10.4 10.6v6M13.6 10.6v6" />
    </>
  ),
  close: <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />,
  panelLeft: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.6 4.5v15" />
    </>
  ),
  panelRight: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M14.4 4.5v15" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  pencil: (
    <>
      <path d="M4.5 19.5h3.2L19 8.2a2.3 2.3 0 0 0-3.2-3.2L4.5 16.3Z" />
      <path d="m14.6 6.2 3.2 3.2" />
    </>
  ),
  arrowUp: <path d="M12 19V5.6M6.4 11.2 12 5.6l5.6 5.6" />,
  arrowDown: <path d="M12 5v13.4M17.6 12.8 12 18.4l-5.6-5.6" />,
  focus: (
    <>
      <path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  density: <path d="M4 6h16M4 12h16M4 18h16" />,
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20.5 13.2A8.6 8.6 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7Z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2.2" />
      <path d="M8.5 21h7M12 17.5V21" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-1.8s-.7-1.3-.7-2 .6-1.2 1.4-1.2h1.8A4.6 4.6 0 0 0 21 10.8C21 6.7 16.9 3.5 12 3.5Z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof iconPaths;

export const iconNames = Object.keys(iconPaths) as IconName[];

export const Icon = ({
  name,
  size = 16,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {iconPaths[name]}
  </svg>
);
