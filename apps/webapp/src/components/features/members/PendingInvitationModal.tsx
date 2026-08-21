import { useTranslation } from '@warpunit/slang-react';
import { createPortal } from 'react-dom';

import type { ProjectInvitation } from '@testron/protocol';
import { Button, Icon } from '../../ui/design';

export const PendingInvitationModal = ({
  invitation,
  pending,
  error,
}: {
  invitation: ProjectInvitation;
  pending: boolean;
  error?: string;
}) => {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 p-6 [-webkit-app-region:no-drag]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-invitation-title"
        className="w-full max-w-[460px] rounded-xl border border-line bg-surface p-6 shadow-[0_28px_90px_rgba(0,0,0,0.4)]"
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-wash text-accent">
          <Icon name="members" size={22} />
        </div>
        <h2 id="pending-invitation-title" className="mt-4 text-2xl font-semibold">
          {t('join')} {invitation.projectName}?
        </h2>
        <p className="mt-2 text-base leading-6 text-ink-2">
          {invitation.invitedBy.name ?? invitation.invitedBy.email} {t('invited')}{' '}
          {invitation.email} to collaborate on this project.
        </p>
        {error && (
          <div role="alert" className="mt-4 rounded-md bg-critical-wash p-3 text-sm text-critical">
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              window.testron?.command({
                type: 'respond-invitation',
                invitationId: invitation.id,
                response: 'rejected',
              })
            }
          >
            {pending ? t('working') : t('reject')}
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              window.testron?.command({
                type: 'respond-invitation',
                invitationId: invitation.id,
                response: 'accepted',
              })
            }
          >
            {t('accept_invitation')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
};
