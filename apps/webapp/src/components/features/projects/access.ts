import type { LibrarySnapshot } from '../../../lib/library';

export type ProjectSurface = 'loading' | 'onboarding' | 'product';

export const viewerLabel = (viewer: LibrarySnapshot['viewer']): string =>
  viewer?.name ?? viewer?.email ?? 'Account';

/** Remote workspaces must load at least once before an empty account is known to be empty. */
export const projectSurface = (library: LibrarySnapshot): ProjectSurface => {
  const server = library.server;
  if (!server?.configured) return 'product';
  if (library.projects.length > 0) return 'product';
  if ((library.pendingInvitations?.length ?? 0) > 0) return 'product';
  if (server.workspace === 'loading') return 'loading';
  return 'onboarding';
};
