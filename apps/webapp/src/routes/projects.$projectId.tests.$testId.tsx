import { createFileRoute } from '@tanstack/react-router';
import { WebTestView } from '../components/features/test-view/WebTestView';
import { useWorkspace } from '../lib/workspace';

export const Route = createFileRoute('/projects/$projectId/tests/$testId')({
  component: TestRoute,
});
function TestRoute() {
  const { projectId, testId } = Route.useParams();
  const { data } = useWorkspace();
  return data ? <WebTestView workspace={data} projectId={projectId} testId={testId} /> : null;
}
