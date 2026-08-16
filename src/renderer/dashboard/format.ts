/** Coarse relative age. Precision below a minute is noise in a triage queue. */
export const age = (minutes: number) =>
  minutes < 60
    ? `${Math.max(1, Math.round(minutes))}m`
    : minutes < 1440
      ? `${Math.round(minutes / 60)}h`
      : `${Math.round(minutes / 1440)}d`;

/** Durations stay in milliseconds until they stop fitting in three digits. */
export const ms = (value: number) =>
  value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
