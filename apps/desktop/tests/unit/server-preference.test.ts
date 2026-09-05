import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  chooseServer,
  forgetServer,
  loadServerPreference,
  normalizeServerUrl,
  parseServerPreference,
  resolveServerEndpoints,
  saveServerPreference,
} from '../../src/main/server-preference';

const defaults = { serverUrl: 'https://testron.dev', webappUrl: 'https://app.testron.dev' };
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('server preference', () => {
  it('accepts only http(s) origins without credentials', () => {
    expect(normalizeServerUrl(' https://qa.acme.internal:4400/login ')).toBe(
      'https://qa.acme.internal:4400',
    );
    expect(normalizeServerUrl('http://127.0.0.1:4400')).toBe('http://127.0.0.1:4400');
    expect(normalizeServerUrl('ftp://qa.acme.internal')).toBeUndefined();
    expect(normalizeServerUrl('https://user:pw@qa.acme.internal')).toBeUndefined();
    expect(normalizeServerUrl(42)).toBeUndefined();
  });

  it('drops malformed entries while parsing', () => {
    expect(
      parseServerPreference({
        serverUrl: 'javascript:alert(1)',
        recentServerUrls: ['https://a.test/', 'https://a.test', 'nope', 7],
      }),
    ).toEqual({ recentServerUrls: ['https://a.test'] });
    expect(parseServerPreference('garbage')).toEqual({ recentServerUrls: [] });
  });

  it('uses the build default unless a different server was picked', () => {
    expect(resolveServerEndpoints({ recentServerUrls: [] }, defaults)).toEqual({
      ...defaults,
      isDefault: true,
    });
    expect(
      resolveServerEndpoints(
        { serverUrl: 'https://app.testron.dev', recentServerUrls: [] },
        defaults,
      ),
    ).toEqual({ ...defaults, isDefault: true });
    expect(
      resolveServerEndpoints(
        { serverUrl: 'https://qa.acme.internal', recentServerUrls: [] },
        defaults,
      ),
    ).toEqual({
      serverUrl: 'https://qa.acme.internal',
      webappUrl: 'https://qa.acme.internal',
      isDefault: false,
    });
  });

  it('remembers custom servers most recent first and clears the choice for the default', () => {
    const first = chooseServer({ recentServerUrls: [] }, 'https://a.test/x', defaults);
    expect(first).toEqual({ serverUrl: 'https://a.test', recentServerUrls: ['https://a.test'] });
    const second = chooseServer(first!, 'https://b.test', defaults);
    expect(second).toEqual({
      serverUrl: 'https://b.test',
      recentServerUrls: ['https://b.test', 'https://a.test'],
    });
    expect(chooseServer(second!, 'https://testron.dev', defaults)).toEqual({
      recentServerUrls: ['https://b.test', 'https://a.test'],
    });
    expect(chooseServer(second!, 'not a url', defaults)).toBeUndefined();
    expect(forgetServer(second!, 'https://b.test')).toEqual({
      recentServerUrls: ['https://a.test'],
    });
  });

  it('round-trips through the preference file with owner-only permissions', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'testron-server-preference-'));
    directories.push(directory);
    const file = path.join(directory, 'server.json');
    expect(loadServerPreference(file)).toEqual({ recentServerUrls: [] });
    saveServerPreference(file, {
      serverUrl: 'https://a.test',
      recentServerUrls: ['https://a.test'],
    });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      serverUrl: 'https://a.test',
      recentServerUrls: ['https://a.test'],
    });
    expect(loadServerPreference(file)).toEqual({
      serverUrl: 'https://a.test',
      recentServerUrls: ['https://a.test'],
    });
  });
});
