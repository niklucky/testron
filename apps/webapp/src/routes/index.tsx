import { Navigate, createFileRoute } from '@tanstack/react-router';
import { WebProjectOnboarding } from '../components/features/projects/WebProjectOnboarding';
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
  const projectId = workspace.data.projects[0]?.id;
  return projectId ? (
    <Navigate to="/projects/$projectId" params={{ projectId }} />
  ) : (
    <WebProjectOnboarding workspace={workspace.data} />
  );
}
