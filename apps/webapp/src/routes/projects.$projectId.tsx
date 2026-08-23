import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router';
import { isUnauthorizedError, useWorkspace } from '../lib/workspace';

export const Route = createFileRoute('/projects/$projectId')({ component: ProjectLayout });
function ProjectLayout() {
  const { projectId } = Route.useParams();
  const workspace = useWorkspace();
  if (workspace.isPending) return <main className="center-screen">Loading workspace…</main>;
  if (workspace.isError)
    return isUnauthorizedError(workspace.error) ? (
      <Navigate to="/login" />
    ) : (
      <main className="center-screen">Could not load the workspace. Please retry.</main>
    );
  if (!workspace.data.projects.some((project) => project.id === projectId))
    return <Navigate to="/" />;
  return <Outlet />;
}
