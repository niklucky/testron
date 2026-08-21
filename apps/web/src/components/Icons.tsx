/** The three glyphs this page needs. The app's icon set is not published, and a
    landing page does not justify shipping it. */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const DownloadIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <path d="M8 2v8" />
    <path d="M4.5 7 8 10.5 11.5 7" />
    <path d="M2.5 12.5h11" />
  </svg>
);

export const ArrowIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <path d="M3.5 8h9" />
    <path d="M9 4.5 12.5 8 9 11.5" />
  </svg>
);

export const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <path d="m3 8.5 3.2 3.2L13 5" />
  </svg>
);
