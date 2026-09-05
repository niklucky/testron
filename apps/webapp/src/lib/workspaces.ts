/**
 * A workspace is the Testron server the app talks to. testron.dev is the
 * default, but the app is open source and anyone can point it at a server
 * they run — so the sign-in screen lets people pick one.
 *
 * On the web the workspace *is* the origin the webapp was served from:
 * switching means navigating to the other server's sign-in page. On the
 * desktop the shell owns the choice; the renderer only asks it to switch.
 */

export const DEFAULT_WORKSPACE_URL = 'https://app.testron.dev';

/** Hosts that all mean "Testron Cloud" — shown under one friendly name. */
const CLOUD_HOSTS = new Set(['app.testron.dev', 'testron.dev', 'www.testron.dev']);

const STORAGE_KEY = 'testron.workspaces';
const RECENT_LIMIT = 6;

export interface WorkspaceOption {
  /** Origin only — no path, query or hash. */
  url: string;
  /** What the picker shows as the name: the host, or the cloud's short name. */
  host: string;
  kind: 'cloud' | 'custom';
}

/**
 * Turn what someone typed into an origin, or `undefined` when it cannot be
 * one. Accepts a bare host ("qa.acme.internal:4400") and assumes https, keeps
 * http for people running a server on their own network.
 */
export const normalizeWorkspaceUrl = (input: string): string | undefined => {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!url.hostname || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

export const isCloudWorkspace = (url: string): boolean => {
  try {
    return CLOUD_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

export const workspaceOption = (url: string): WorkspaceOption => {
  const cloud = isCloudWorkspace(url);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw value; it still identifies the entry */
  }
  return { url, host: cloud ? 'testron.dev' : host, kind: cloud ? 'cloud' : 'custom' };
};

/**
 * The list the picker shows: the cloud first, then the current server if it
 * is something else, then everything remembered — each origin once.
 */
export const workspaceOptions = (
  current: string,
  recent: readonly string[],
  defaultUrl: string = DEFAULT_WORKSPACE_URL,
): WorkspaceOption[] => {
  const seen = new Set<string>();
  const options: WorkspaceOption[] = [];
  for (const candidate of [defaultUrl, current, ...recent]) {
    const url = normalizeWorkspaceUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    options.push(workspaceOption(url));
  }
  return options;
};

/** Most recent first, no duplicates, never the cloud (it is always listed). */
export const rememberWorkspace = (recent: readonly string[], url: string): string[] =>
  [url, ...recent.filter((item) => item !== url)]
    .filter((item) => !isCloudWorkspace(item))
    .slice(0, RECENT_LIMIT);

export const forgetWorkspace = (recent: readonly string[], url: string): string[] =>
  recent.filter((item) => item !== url);

export const loadRecentWorkspaces = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
};

export const saveRecentWorkspaces = (recent: readonly string[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    /* private mode or blocked storage: the list simply does not persist */
  }
};

const CARRY_PARAM = 'workspaces';

/**
 * Where the sign-in page of another server lives. Storage is per origin, so
 * the remembered servers ride along in the URL and the target page merges
 * them into its own list.
 */
export const workspaceSignInUrl = (url: string, carry: readonly string[] = []): string => {
  const target = new URL('/login', url);
  if (carry.length) target.searchParams.set(CARRY_PARAM, carry.join(','));
  return target.toString();
};

/** The servers another origin handed over in its sign-in link, if any. */
export const carriedWorkspaces = (search: string): string[] => {
  const raw = new URLSearchParams(search).get(CARRY_PARAM);
  if (!raw) return [];
  const seen = new Set<string>();
  return raw
    .split(',')
    .map((item) => normalizeWorkspaceUrl(item))
    .filter((item): item is string => item !== undefined && !isCloudWorkspace(item))
    .filter((item) => (seen.has(item) ? false : (seen.add(item), true)))
    .slice(0, RECENT_LIMIT);
};

/** Fold the carried list into what this origin already remembers. */
export const mergeWorkspaces = (recent: readonly string[], carried: readonly string[]): string[] =>
  [...recent, ...carried.filter((item) => !recent.includes(item))].slice(0, RECENT_LIMIT);
