import type { ProjectInvitation } from '@testron/protocol';
import type { ProjectRecord } from '../../main/persistence/repository';

export const canManageMembers = (
  project: ProjectRecord | undefined,
  viewerId: string | undefined,
) => Boolean(project?.ownerId && viewerId && project.ownerId === viewerId);

export const canCancelInvitation = (
  invitation: ProjectInvitation,
  viewerId: string | undefined,
  projectOwner: boolean,
) =>
  invitation.status === 'invited' &&
  Boolean(viewerId && (projectOwner || invitation.invitedBy.id === viewerId));
