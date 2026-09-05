import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_URL,
  forgetWorkspace,
  normalizeWorkspaceUrl,
  rememberWorkspace,
  workspaceOption,
  workspaceOptions,
  workspaceSignInUrl,
} from '../../src/lib/workspaces';

describe('workspace addresses', () => {
  it('normalizes what people type into an origin', () => {
    expect(normalizeWorkspaceUrl('qa.acme.internal:4400')).toBe('https://qa.acme.internal:4400');
    expect(normalizeWorkspaceUrl('  https://testron.example.com/login?x=1  ')).toBe(
      'https://testron.example.com',
    );
    expect(normalizeWorkspaceUrl('http://127.0.0.1:4400/')).toBe('http://127.0.0.1:4400');
  });

  it('rejects addresses that cannot be a server', () => {
    expect(normalizeWorkspaceUrl('')).toBeUndefined();
    expect(normalizeWorkspaceUrl('   ')).toBeUndefined();
    expect(normalizeWorkspaceUrl('ftp://files.example.com')).toBeUndefined();
    expect(normalizeWorkspaceUrl('https://user:secret@example.com')).toBeUndefined();
    expect(normalizeWorkspaceUrl('not a url at all')).toBeUndefined();
  });

  it('names the cloud by its short host and everything else by its real host', () => {
    expect(workspaceOption('https://app.testron.dev')).toEqual({
      url: 'https://app.testron.dev',
      host: 'testron.dev',
      kind: 'cloud',
    });
    expect(workspaceOption('https://qa.acme.internal:4400')).toEqual({
      url: 'https://qa.acme.internal:4400',
      host: 'qa.acme.internal:4400',
      kind: 'custom',
    });
  });

  it('lists the cloud first, then the current server, then remembered ones, once each', () => {
    const options = workspaceOptions(
      'https://qa.acme.internal',
      [
        'https://qa.acme.internal',
        'https://staging.acme.internal',
        'ftp://files.test',
        'not a url',
      ],
      DEFAULT_WORKSPACE_URL,
    );
    expect(options.map((option) => option.url)).toEqual([
      'https://app.testron.dev',
      'https://qa.acme.internal',
      'https://staging.acme.internal',
    ]);
  });

  it('remembers custom servers most recent first and never the cloud', () => {
    const remembered = rememberWorkspace(['https://a.test', 'https://b.test'], 'https://b.test');
    expect(remembered).toEqual(['https://b.test', 'https://a.test']);
    expect(rememberWorkspace(remembered, 'https://app.testron.dev')).toEqual(remembered);
    expect(forgetWorkspace(remembered, 'https://a.test')).toEqual(['https://b.test']);
  });

  it('points at the other server’s sign-in page', () => {
    expect(workspaceSignInUrl('https://qa.acme.internal:4400')).toBe(
      'https://qa.acme.internal:4400/login',
    );
  });
});
