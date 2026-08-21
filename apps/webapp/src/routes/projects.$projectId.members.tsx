import { createFileRoute } from '@tanstack/react-router';
import { WebDashboard } from '../components/features/dashboard/WebDashboard';
import { useWorkspace } from '../lib/workspace';
export const Route = createFileRoute('/projects/$projectId/members')({
  component: MembersRoute,
});
function MembersRoute() {
  const { projectId } = Route.useParams();
  const { data } = useWorkspace();
  return data ? (
    <WebDashboard workspace={data} projectId={projectId} initialView="members" />
  ) : null;
}
