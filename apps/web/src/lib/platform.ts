/**
 * Which build a visitor should be offered.
 *
 * Detection is a suggestion, never a gate: every build stays one click away, so
 * a wrong guess costs the visitor a second rather than a download they cannot
 * run.
 */
export type PlatformId = 'mac-arm' | 'mac-intel' | 'windows' | 'linux';

export type PlatformInfo = {
  id: PlatformId;
  /** Used in the primary call to action: "Download for …". */
  label: string;
  /** The short form used on the secondary buttons. */
  short: string;
  /** Release asset name; see `.github/workflows/release.yml`. */
  asset: string;
};

export const platforms: readonly PlatformInfo[] = [
  {
    id: 'mac-arm',
    label: 'macOS (Apple silicon)',
    short: 'Apple silicon',
    asset: 'Testron-macos-arm64.zip',
  },
  { id: 'mac-intel', label: 'macOS (Intel)', short: 'Intel Mac', asset: 'Testron-macos-x64.zip' },
  { id: 'windows', label: 'Windows', short: 'Windows', asset: 'Testron-windows-x64.zip' },
  { id: 'linux', label: 'Linux', short: 'Linux', asset: 'Testron-linux-x64.zip' },
];

export const platform = (id: PlatformId): PlatformInfo =>
  platforms.find((entry) => entry.id === id) ?? platforms[0];

/**
 * What the browser is willing to tell us. `architecture` comes from the
 * user-agent client hints and is Chromium-only; everywhere else we fall back to
 * the GPU string, and failing that to Apple silicon — every Mac sold since 2020.
 */
export type PlatformHints = {
  userAgent: string;
  /** `navigator.userAgentData.platform`, or `navigator.platform`. */
  platform?: string;
  /** `'arm'`, `'x86'`, … from `getHighEntropyValues(['architecture'])`. */
  architecture?: string;
};

export const platformFromHints = ({
  userAgent,
  platform: platformHint,
  architecture,
}: PlatformHints): PlatformId | undefined => {
  const subject = `${platformHint ?? ''} ${userAgent}`.toLowerCase();

  /* Phones and tablets get no call to action — there is no build to run. */
  if (/android/.test(subject) || (/iphone|ipod/.test(subject) && !/mac os x 10/.test(subject))) {
    return undefined;
  }
  if (/win/.test(subject)) return 'windows';
  if (/mac|darwin|ipad/.test(subject)) {
    if (architecture && /arm|aarch/.test(architecture)) return 'mac-arm';
    if (architecture && /x86|amd64|x64/.test(architecture)) return 'mac-intel';
    return 'mac-arm';
  }
  if (/linux|x11|cros|bsd/.test(subject)) return 'linux';
  return undefined;
};

/**
 * Safari reports every Mac as "Intel Mac OS X" and refuses client hints, so the
 * renderer string is the only honest signal left: Apple silicon draws through
 * "Apple GPU" / "Apple M…", Intel Macs through a discrete or integrated part.
 */
const architectureFromRenderer = (): string | undefined => {
  try {
    const context = document.createElement('canvas').getContext('webgl');
    const debug = context?.getExtension('WEBGL_debug_renderer_info');
    if (!context || !debug) return undefined;
    const renderer = String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? '');
    if (/apple\s*(gpu|m\d)/i.test(renderer)) return 'arm';
    if (/intel|amd|radeon|nvidia|geforce/i.test(renderer)) return 'x86';
    return undefined;
  } catch {
    return undefined;
  }
};

type UserAgentData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};

export const detectPlatform = async (): Promise<PlatformId | undefined> => {
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;

  let architecture: string | undefined;
  try {
    architecture = (await data?.getHighEntropyValues?.(['architecture']))?.architecture;
  } catch {
    architecture = undefined;
  }

  const hints: PlatformHints = {
    userAgent: navigator.userAgent,
    platform: data?.platform ?? navigator.platform,
    architecture: architecture ?? architectureFromRenderer(),
  };
  return platformFromHints(hints);
};
