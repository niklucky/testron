import { createFileRoute } from '@tanstack/react-router';
import { RunView } from '../components/features/run-view/RunView';
export const Route = createFileRoute('/projects/$projectId/runs')({
  component: RunsRoute,
});
function RunsRoute() {
  return <RunView />;
}
