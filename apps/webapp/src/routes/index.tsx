import { Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { WebWorkspaceSnapshot } from '@testron/protocol';
import { WebProjectOnboarding } from '../components/features/projects/WebProjectOnboarding';
import {
  acceptedInvitationProjectId,
  newAccountInvitationProjectIds,
} from '../components/features/projects/access';
import { isUnauthorizedError, useWorkspace } from '../lib/workspace';

export const Route = createFileRoute('/')({ component: IndexRoute });
function IndexRoute() {
  const workspace = useWorkspace();
  if (workspace.isPending) return <main className="center-screen">Loading Testron…</main>;
  if (workspace.isError)
    return isUnauthorizedError(workspace.error) ? (
      <Navigate to="/login" />
    ) : (
      <main className="center-screen">Could not load the workspace. Please retry.</main>
    );
  return <LoadedIndexRoute workspace={workspace.data} />;
}

function LoadedIndexRoute({ workspace }: { workspace: WebWorkspaceSnapshot }) {
  const [initialInvitationProjectIds] = useState(() => newAccountInvitationProjectIds(workspace));
  const projectId = workspace.projects[0]?.id;
  const skipProjectId = acceptedInvitationProjectId(
    workspace.projects,
    initialInvitationProjectIds,
  );

  return projectId && initialInvitationProjectIds.size === 0 ? (
    <Navigate to="/projects/$projectId" params={{ projectId }} />
  ) : (
    <WebProjectOnboarding workspace={workspace} skipProjectId={skipProjectId} />
  );
}
