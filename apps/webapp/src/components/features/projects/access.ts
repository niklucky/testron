import type { LibrarySnapshot } from '../../../lib/library';

export type ProjectSurface = 'loading' | 'onboarding' | 'product';

export const viewerLabel = (viewer: LibrarySnapshot['viewer']): string =>
  viewer?.name ?? viewer?.email ?? 'Account';

export const newAccountInvitationProjectIds = (
  library: Pick<LibrarySnapshot, 'projects' | 'pendingInvitations'>,
): ReadonlySet<string> =>
  new Set(
    library.projects.length === 0
      ? library.pendingInvitations?.map((invitation) => invitation.projectId)
      : [],
  );

export const acceptedInvitationProjectId = (
  projects: LibrarySnapshot['projects'],
  invitationProjectIds: ReadonlySet<string>,
): string | undefined => projects.find((project) => invitationProjectIds.has(project.id))?.id;

/** Remote workspaces must load at least once before an empty account is known to be empty. */
export const projectSurface = (library: LibrarySnapshot): ProjectSurface => {
  const server = library.server;
  if (!server?.configured) return 'product';
  if (library.projects.length > 0) return 'product';
  if ((library.pendingInvitations?.length ?? 0) > 0) return 'onboarding';
  if (server.workspace === 'loading') return 'loading';
  return 'onboarding';
};
