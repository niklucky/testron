import { describe, expect, it } from 'vitest';

import { downloadUrl } from '../../src/lib/downloads';
import { platformFromHints, platforms } from '../../src/lib/platform';

const chromeMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const safariMac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const chromeWindows =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const firefoxLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const androidChrome =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const iphoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('platformFromHints', () => {
  it('uses the architecture hint to separate the two Mac builds', () => {
    expect(platformFromHints({ userAgent: chromeMac, architecture: 'arm' })).toBe('mac-arm');
    expect(platformFromHints({ userAgent: chromeMac, architecture: 'x86' })).toBe('mac-intel');
  });

  it('assumes Apple silicon when a Mac reveals no architecture', () => {
    expect(platformFromHints({ userAgent: safariMac })).toBe('mac-arm');
  });

  it('ignores the "Intel Mac OS X" in every Mac user agent', () => {
    expect(platformFromHints({ userAgent: safariMac, platform: 'MacIntel' })).toBe('mac-arm');
  });

  it('recognises Windows and Linux', () => {
    expect(platformFromHints({ userAgent: chromeWindows, platform: 'Windows' })).toBe('windows');
    expect(platformFromHints({ userAgent: firefoxLinux, platform: 'Linux x86_64' })).toBe('linux');
  });

  it('offers no build on phones, which cannot run the desktop application', () => {
    expect(platformFromHints({ userAgent: androidChrome, platform: 'Android' })).toBeUndefined();
    expect(platformFromHints({ userAgent: iphoneSafari })).toBeUndefined();
  });

  it('offers no build for a user agent it does not know', () => {
    expect(platformFromHints({ userAgent: 'PlayStation 5' })).toBeUndefined();
  });
});

describe('downloadUrl', () => {
  it('points every platform at the newest release asset', () => {
    expect(downloadUrl('mac-arm')).toBe(
      'https://github.com/niklucky/testron/releases/latest/download/Testron-macos-arm64.zip',
    );
    expect(downloadUrl('windows')).toBe(
      'https://github.com/niklucky/testron/releases/latest/download/Testron-windows-x64.zip',
    );
  });

  it('names a distinct asset per platform', () => {
    const assets = new Set(platforms.map((entry) => entry.asset));
    expect(assets.size).toBe(platforms.length);
  });
});
