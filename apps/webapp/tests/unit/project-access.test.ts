import { describe, expect, it } from 'vitest';

import type { LibrarySnapshot } from '../../src/lib/library';
import {
  acceptedInvitationProjectId,
  newAccountInvitationProjectIds,
  projectSurface,
  viewerLabel,
} from '../../src/components/features/projects/access';

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

  it('opens onboarding to show a pending invitation before project access exists', () => {
    const snapshot = library({
      configured: true,
      authentication: 'signedIn',
      workspace: 'loaded',
      status: 'synced',
    });
    snapshot.pendingInvitations = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        projectId: '00000000-0000-4000-8000-000000000011',
        projectName: 'Website',
        email: 'member@example.test',
        inviteeName: 'Member',
        invitedBy: {
          id: '00000000-0000-4000-8000-000000000012',
          email: 'owner@example.test',
          name: 'Owner',
        },
        status: 'invited',
        createdAt: '2026-08-20T00:00:00.000Z',
        respondedAt: null,
      },
    ];
    expect(projectSurface(snapshot)).toBe('onboarding');
  });

  it('tracks initial invitations until an accepted project can be skipped to', () => {
    const snapshot = library({
      configured: true,
      authentication: 'signedIn',
      workspace: 'loaded',
      status: 'synced',
    });
    snapshot.pendingInvitations = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        projectId: '00000000-0000-4000-8000-000000000011',
        projectName: 'Website',
        email: 'member@example.test',
        inviteeName: 'Member',
        invitedBy: {
          id: '00000000-0000-4000-8000-000000000012',
          email: 'owner@example.test',
          name: 'Owner',
        },
        status: 'invited',
        createdAt: '2026-08-20T00:00:00.000Z',
        respondedAt: null,
      },
    ];

    const initialInvitations = newAccountInvitationProjectIds(snapshot);
    expect(acceptedInvitationProjectId(snapshot.projects, initialInvitations)).toBeUndefined();

    snapshot.projects = [{ id: '00000000-0000-4000-8000-000000000011', name: 'Website' }];
    snapshot.pendingInvitations = [];
    expect(acceptedInvitationProjectId(snapshot.projects, initialInvitations)).toBe(
      '00000000-0000-4000-8000-000000000011',
    );
  });

  it('does not start invitation onboarding for an account that already has a project', () => {
    const snapshot = library(
      {
        configured: true,
        authentication: 'signedIn',
        workspace: 'loaded',
        status: 'synced',
      },
      [{ id: '00000000-0000-4000-8000-000000000001', name: 'Existing' }],
    );
    snapshot.pendingInvitations = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        projectId: '00000000-0000-4000-8000-000000000011',
        projectName: 'Website',
        email: 'member@example.test',
        inviteeName: 'Member',
        invitedBy: {
          id: '00000000-0000-4000-8000-000000000012',
          email: 'owner@example.test',
          name: 'Owner',
        },
        status: 'invited',
        createdAt: '2026-08-20T00:00:00.000Z',
        respondedAt: null,
      },
    ];

    expect(newAccountInvitationProjectIds(snapshot).size).toBe(0);
  });
});
