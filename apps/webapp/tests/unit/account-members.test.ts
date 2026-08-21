import { describe, expect, it } from 'vitest';

import type { ProjectInvitation } from '@testron/protocol';
import { passwordChangeError } from '../../src/components/features/account/validation';
import {
  canCancelInvitation,
  canManageMembers,
} from '../../src/components/features/members/access';

const invitation: ProjectInvitation = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  projectName: 'Website',
  email: 'member@example.test',
  inviteeName: 'Member',
  invitedBy: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'inviter@example.test',
    name: 'Inviter',
  },
  status: 'invited',
  createdAt: '2026-08-20T00:00:00.000Z',
  respondedAt: null,
};

describe('account and member renderer rules', () => {
  it('validates password confirmation and password reuse', () => {
    expect(passwordChangeError('old password value', 'new password value', 'different value')).toBe(
      'The new password confirmation does not match.',
    );
    expect(
      passwordChangeError('same password value', 'same password value', 'same password value'),
    ).toBe('The new password must be different from the current password.');
    expect(
      passwordChangeError('old password value', 'new password value', 'new password value'),
    ).toBeUndefined();
  });

  it('allows only project owners to manage blocking', () => {
    const project = { id: invitation.projectId, ownerId: 'owner', name: 'Website' };
    expect(canManageMembers(project, 'owner')).toBe(true);
    expect(canManageMembers(project, 'member')).toBe(false);
  });

  it('allows project owners and the original inviter to cancel a pending invitation', () => {
    expect(canCancelInvitation(invitation, 'owner', true)).toBe(true);
    expect(canCancelInvitation(invitation, invitation.invitedBy.id, false)).toBe(true);
    expect(canCancelInvitation(invitation, 'another-member', false)).toBe(false);
    expect(canCancelInvitation({ ...invitation, status: 'accepted' }, 'owner', true)).toBe(false);
  });
});
