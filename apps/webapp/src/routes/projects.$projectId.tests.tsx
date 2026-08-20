import { createFileRoute } from '@tanstack/react-router';
import { WebDashboard } from '../components/features/dashboard/WebDashboard';
import { useWorkspace } from '../lib/workspace';
export const Route = createFileRoute('/projects/$projectId/tests')({
  component: TestsRoute,
});
function TestsRoute() {
  const { projectId } = Route.useParams();
  const { data } = useWorkspace();
  return data ? <WebDashboard workspace={data} projectId={projectId} /> : null;
}
