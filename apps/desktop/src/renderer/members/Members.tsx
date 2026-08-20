import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { LibrarySnapshot } from '../../main/persistence/repository';
import { Avatar, Badge, Button, EmptyState, Icon, Panel, PanelHeader } from '../design';
import { canCancelInvitation, canManageMembers } from './access';

const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const Members = ({ library }: { library: LibrarySnapshot }) => {
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
        <EmptyState>Member management requires a configured Testron server.</EmptyState>
      </div>
    );

  if (!project)
    return (
      <div className="min-h-0 overflow-y-auto p-5">
        <EmptyState>
          No project selected. Accept a pending invitation or create a project to manage members.
        </EmptyState>
      </div>
    );

  return (
    <div className="min-h-0 overflow-y-auto p-5">
      <div className="mx-auto max-w-[1040px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Members</h1>
          <p className="mt-1 text-base text-ink-3">Manage access to {project.name}.</p>
        </div>

        <Panel className="mt-5">
          <PanelHeader
            title="Invite a member"
            subtitle="Invitations remain pending until accepted."
          />
          <form className="flex items-start gap-3 border-t border-line p-4" onSubmit={invite}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Email address</span>
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
                placeholder="teammate@example.com"
                className="h-10 w-full rounded-md border border-line bg-plane px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-accent"
              />
              {email.trim() && (
                <span className="mt-1.5 block text-sm text-ink-3">
                  {lookup
                    ? lookup.name
                      ? `Account: ${lookup.name}`
                      : 'No account yet — they can register before accepting.'
                    : 'Looking up account…'}
                </span>
              )}
            </label>
            <Button type="submit" variant="primary" icon="plus" disabled={pending || !email.trim()}>
              Invite
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
          <PanelHeader title="Project members" subtitle={`${members.length} people`} />
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
                      {member.status === 'blocked' ? 'Unblock' : 'Block'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="mt-5">
          <PanelHeader title="Invitations" subtitle={`${invitations.length} total`} />
          {invitations.length === 0 ? (
            <div className="border-t border-line p-5 text-sm text-ink-3">No invitations yet.</div>
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
                        {invitation.email} · invited by{' '}
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
                        Cancel
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
