import { useTranslation } from '@warpunit/slang-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { LibrarySnapshot } from '../../../lib/library';
import { Avatar, Badge, Button, EmptyState, Icon, Panel, PanelHeader } from '../../ui/design';
import { canCancelInvitation, canManageMembers } from './access';

const initials = (name: string) => {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};

export const Members = ({ library }: { library: LibrarySnapshot }) => {
  const { t } = useTranslation();
  const project =
    library.projects.find((candidate) => candidate.id === library.selectedProjectId) ??
    library.projects[0];
  const viewer = library.viewer;
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string>();
  const lookup =
    library.inviteeLookup?.email === email.trim().toLowerCase() ? library.inviteeLookup : undefined;
  const pending = library.server?.status === 'syncing';
  const owner = canManageMembers(project, viewer?.id);
  const members = useMemo(
    () => (library.members ?? []).filter((member) => member.projectId === project?.id),
    [library.members, project?.id],
  );
  const invitations = useMemo(
    () => (library.invitations ?? []).filter((invitation) => invitation.projectId === project?.id),
    [library.invitations, project?.id],
  );

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@') || normalized === submittedEmail) return;
    const timer = window.setTimeout(() => {
      setSubmittedEmail(normalized);
      window.testron?.command({ type: 'lookup-invitee', email: normalized });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [email, submittedEmail]);

  const invite = (event: FormEvent) => {
    event.preventDefault();
    if (!project || !email.trim()) return;
    window.testron?.command({
      type: 'create-invitation',
      projectId: project.id,
      email: email.trim().toLowerCase(),
    });
    setEmail('');
    setSubmittedEmail(undefined);
  };

  if (!library.server?.configured)
    return (
      <div className="min-h-0 overflow-y-auto p-5">
        <EmptyState>{t('member_management_requires_a_configured_testron_server')}</EmptyState>
      </div>
    );

  if (!project)
    return (
      <div className="min-h-0 overflow-y-auto p-5">
        <EmptyState>
          {t('no_project_selected_accept_a_pending_invitation_or_create_a_proj')}
        </EmptyState>
      </div>
    );

  return (
    <div className="min-h-0 overflow-y-auto p-5">
      <div className="mx-auto max-w-[1040px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{t('members')}</h1>
          <p className="mt-1 text-base text-ink-3">
            {t('manage_access_to')} {project.name}.
          </p>
        </div>

        <Panel className="mt-5">
          <PanelHeader
            title={t('invite_a_member')}
            subtitle={t('invitations_remain_pending_until_accepted')}
          />
          <form className="flex items-start gap-3 border-t border-line p-4" onSubmit={invite}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('email_address')}</span>
              <input
                type="email"
                required
                value={email}
                disabled={pending}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (event.target.value.trim().toLowerCase() !== submittedEmail)
                    setSubmittedEmail(undefined);
                }}
                placeholder={t('teammate_example_com')}
                className="h-10 w-full rounded-md border border-line bg-plane px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
              {email.trim() && (
                <span className="mt-1.5 block text-sm text-ink-3">
                  {lookup
                    ? lookup.name
                      ? `Account: ${lookup.name}`
                      : t('no_account_yet_they_can_register_before_accepting')
                    : t('looking_up_account')}
                </span>
              )}
            </label>
            <Button type="submit" variant="primary" icon="plus" disabled={pending || !email.trim()}>
              {t('invite')}
            </Button>
          </form>
          {library.server?.status === 'error' && library.server.message && (
            <div
              role="alert"
              className="mx-4 mb-4 flex gap-2 rounded-md bg-critical-wash p-3 text-sm text-critical"
            >
              <Icon name="alert" size={14} />
              {library.server.message}
            </div>
          )}
        </Panel>

        <Panel className="mt-5">
          <PanelHeader
            title={t('project_members')}
            subtitle={t('people', { value1: members.length })}
          />
          <div className="divide-y divide-line border-t border-line">
            {members.map((member) => {
              const label = member.user.name ?? member.user.email;
              return (
                <div key={member.user.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar initials={initials(label)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{label}</p>
                    <p className="truncate text-sm text-ink-3">{member.user.email}</p>
                  </div>
                  <Badge>{member.role}</Badge>
                  <Badge tone={member.status === 'blocked' ? 'critical' : 'good'}>
                    {member.status}
                  </Badge>
                  {owner && member.role !== 'owner' && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        window.testron?.command({
                          type: 'set-member-blocked',
                          projectId: project.id,
                          userId: member.user.id,
                          blocked: member.status !== 'blocked',
                        })
                      }
                    >
                      {member.status === 'blocked' ? t('unblock') : t('block')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="mt-5">
          <PanelHeader
            title={t('invitations')}
            subtitle={t('total_2', { value1: invitations.length })}
          />
          {invitations.length === 0 ? (
            <div className="border-t border-line p-5 text-sm text-ink-3">
              {t('no_invitations_yet')}
            </div>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {invitations.map((invitation) => {
                const canCancel = canCancelInvitation(invitation, library.viewer?.id, owner);
                return (
                  <div key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">
                        {invitation.inviteeName ?? invitation.email}
                      </p>
                      <p className="truncate text-sm text-ink-3">
                        {invitation.email} {t('invited_by')}{' '}
                        {invitation.invitedBy.name ?? invitation.invitedBy.email}
                      </p>
                    </div>
                    <Badge tone={invitation.status === 'accepted' ? 'good' : undefined}>
                      {invitation.status}
                    </Badge>
                    {canCancel && (
                      <Button
                        disabled={pending}
                        onClick={() =>
                          window.testron?.command({
                            type: 'cancel-invitation',
                            invitationId: invitation.id,
                          })
                        }
                      >
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};
