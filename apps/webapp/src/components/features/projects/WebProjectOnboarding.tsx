import type { WebWorkspaceSnapshot } from '@testron/protocol';
import { useLayoutEffect } from 'react';

import { connectBrowserApi, libraryFromWorkspace } from '../../../lib/browser-api';
import { PendingInvitationModal } from '../members/PendingInvitationModal';
import { ProjectOnboarding } from './ProjectOnboarding';

export const WebProjectOnboarding = ({
  workspace,
  skipProjectId,
}: {
  workspace: WebWorkspaceSnapshot;
  skipProjectId?: string;
}) => {
  useLayoutEffect(() => connectBrowserApi(workspace, ''), [workspace]);
  const library = libraryFromWorkspace(workspace);
  const invitation = workspace.pendingInvitations[0];
  return (
    <>
      <ProjectOnboarding
        library={library}
        onSkip={
          skipProjectId ? () => (window.location.href = `/projects/${skipProjectId}`) : undefined
        }
      />
      {invitation && <PendingInvitationModal invitation={invitation} pending={false} />}
    </>
  );
};
