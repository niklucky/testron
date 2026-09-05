import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Which Testron server this desktop talks to. The build ships a default
 * (testron.dev for releases), but Testron is open source and people run their
 * own servers, so the choice is persisted next to the other app data and read
 * before any client is constructed.
 */
export interface ServerPreference {
  /** Origin of the server the person picked; absent means the build default. */
  serverUrl?: string;
  /** Custom servers used before, most recent first. */
  recentServerUrls: string[];
}

export interface ServerDefaults {
  serverUrl: string;
  webappUrl: string;
}

export interface ServerEndpoints extends ServerDefaults {
  /** True while the build default is in use. */
  isDefault: boolean;
}

const RECENT_LIMIT = 6;

/** Only http(s) origins without credentials qualify as a server address. */
export const normalizeServerUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!url.hostname || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
};

export const parseServerPreference = (value: unknown): ServerPreference => {
  if (typeof value !== 'object' || value === null) return { recentServerUrls: [] };
  const candidate = value as Partial<ServerPreference>;
  const serverUrl = normalizeServerUrl(candidate.serverUrl);
  const recentServerUrls = Array.isArray(candidate.recentServerUrls)
    ? candidate.recentServerUrls
        .map(normalizeServerUrl)
        .filter((url): url is string => url !== undefined)
        .filter((url, index, all) => all.indexOf(url) === index)
        .slice(0, RECENT_LIMIT)
    : [];
  return { ...(serverUrl ? { serverUrl } : {}), recentServerUrls };
};

export const loadServerPreference = (filePath: string): ServerPreference => {
  try {
    return parseServerPreference(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return { recentServerUrls: [] };
  }
};

export const saveServerPreference = (filePath: string, preference: ServerPreference): void => {
  writeFileSync(filePath, JSON.stringify(preference), { encoding: 'utf8', mode: 0o600 });
};

/**
 * A self-hosted server serves the webapp itself, so picking one moves both
 * addresses. The default keeps the build's split (API host + app host).
 */
export const resolveServerEndpoints = (
  preference: ServerPreference,
  defaults: ServerDefaults,
): ServerEndpoints => {
  const chosen = normalizeServerUrl(preference.serverUrl);
  if (!chosen || isDefaultServer(chosen, defaults)) return { ...defaults, isDefault: true };
  return { serverUrl: chosen, webappUrl: chosen, isDefault: false };
};

export const isDefaultServer = (url: string, defaults: ServerDefaults): boolean => {
  const origin = normalizeServerUrl(url);
  return (
    origin !== undefined &&
    (origin === normalizeServerUrl(defaults.serverUrl) ||
      origin === normalizeServerUrl(defaults.webappUrl))
  );
};

/** The preference after someone picks `url`; the default clears the choice. */
export const chooseServer = (
  preference: ServerPreference,
  url: string,
  defaults: ServerDefaults,
): ServerPreference | undefined => {
  const origin = normalizeServerUrl(url);
  if (!origin) return undefined;
  if (isDefaultServer(origin, defaults)) return { recentServerUrls: preference.recentServerUrls };
  return {
    serverUrl: origin,
    recentServerUrls: [origin, ...preference.recentServerUrls.filter((item) => item !== origin)]
      .filter((item) => !isDefaultServer(item, defaults))
      .slice(0, RECENT_LIMIT),
  };
};

export const forgetServer = (preference: ServerPreference, url: string): ServerPreference => {
  const origin = normalizeServerUrl(url);
  return {
    ...(preference.serverUrl && preference.serverUrl !== origin
      ? { serverUrl: preference.serverUrl }
      : {}),
    recentServerUrls: preference.recentServerUrls.filter((item) => item !== origin),
  };
};

/**
 * Where this server's session token lives. Each server gets its own folder so
 * a token issued by one server is never presented to another; the build
 * default keeps the original location, so existing sign-ins survive.
 */
export const credentialsDirectory = (dataDirectory: string, endpoints: ServerEndpoints): string => {
  const base = path.join(dataDirectory, 'credentials');
  if (endpoints.isDefault) return base;
  const origin = new URL(endpoints.serverUrl);
  const folder = `${origin.protocol.replace(':', '')}_${origin.host}`.replace(
    /[^a-z0-9._-]/gi,
    '_',
  );
  return path.join(base, 'servers', folder);
};
