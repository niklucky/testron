import { platform, type PlatformId } from './platform';

export const repository = 'niklucky/testron';
export const repositoryUrl = `https://github.com/${repository}`;
export const releasesUrl = `${repositoryUrl}/releases`;

/** Where the web application lives. Both auth buttons land on its sign-in screen. */
export const appUrl = 'https://app.testron.dev';
export const signInUrl = `${appUrl}/login`;
export const signUpUrl = `${appUrl}/login?mode=register`;

/**
 * Release assets carry stable names, so `latest/download/<asset>` always
 * resolves to the newest build without the site knowing the version.
 */
export const downloadUrl = (id: PlatformId): string =>
  `${releasesUrl}/latest/download/${platform(id).asset}`;

export type Release = {
  version: string;
  publishedAt: string | undefined;
};

/**
 * The published version, shown under the download button. It is decoration: the
 * links work whether or not this request does, so every failure is silent.
 */
export const fetchLatestRelease = async (signal?: AbortSignal): Promise<Release | undefined> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return undefined;
    const { tag_name: tag, published_at: published } = body as {
      tag_name?: unknown;
      published_at?: unknown;
    };
    if (typeof tag !== 'string' || tag.length === 0) return undefined;
    return { version: tag, publishedAt: typeof published === 'string' ? published : undefined };
  } catch {
    return undefined;
  }
};

export const formatReleaseDate = (published: string | undefined): string | undefined => {
  if (!published) return undefined;
  const date = new Date(published);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
