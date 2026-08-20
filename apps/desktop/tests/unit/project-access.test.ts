import { describe, expect, it } from 'vitest';

import type { LibrarySnapshot } from '../../src/main/persistence/repository';
import { projectSurface, viewerLabel } from '../../src/renderer/projects/access';

const library = (
  server: NonNullable<LibrarySnapshot['server']>,
  projects: LibrarySnapshot['projects'] = [],
): LibrarySnapshot => ({
  projects,
  environments: [],
  profiles: [],
  profileVariables: [],
  testSuites: [],
  tests: [],
  server,
});

describe('project workspace boundary', () => {
  it('prefers the viewer name and falls back to email', () => {
    expect(viewerLabel({ id: 'user', email: 'owner@example.test', name: 'Nikita' })).toBe('Nikita');
    expect(viewerLabel({ id: 'user', email: 'owner@example.test', name: null })).toBe(
      'owner@example.test',
    );
  });

  it('keeps explicit local development mode in the product', () => {
    expect(
      projectSurface(
        library({
          configured: false,
          authentication: 'signedIn',
          workspace: 'loaded',
          status: 'idle',
        }),
      ),
    ).toBe('product');
  });

  it('waits while the first remote workspace is loading', () => {
    expect(
      projectSurface(
        library({
          configured: true,
          authentication: 'signedIn',
          workspace: 'loading',
          status: 'syncing',
        }),
      ),
    ).toBe('loading');
  });

  it('onboards an empty loaded or unavailable remote workspace', () => {
    expect(
      projectSurface(
        library({
          configured: true,
          authentication: 'signedIn',
          workspace: 'loaded',
          status: 'synced',
        }),
      ),
    ).toBe('onboarding');
    expect(
      projectSurface(
        library({
          configured: true,
          authentication: 'signedIn',
          workspace: 'unavailable',
          status: 'offline',
        }),
      ),
    ).toBe('onboarding');
    expect(
      projectSurface(
        library({
          configured: true,
          authentication: 'signedIn',
          workspace: 'unavailable',
          status: 'syncing',
        }),
      ),
    ).toBe('onboarding');
  });

  it('opens the product when the server workspace has a project', () => {
    expect(
      projectSurface(
        library(
          {
            configured: true,
            authentication: 'signedIn',
            workspace: 'loaded',
            status: 'synced',
          },
          [{ id: '00000000-0000-4000-8000-000000000001', name: 'Website' }],
        ),
      ),
    ).toBe('product');
  });
});
