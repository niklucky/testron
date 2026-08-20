import type { AppCommand } from '../../../lib/library';
import type { TestRecord } from './types';

type CommandTarget = { platform?: 'web' | 'desktop'; command: (command: AppCommand) => void };
type RouteTarget = { hash: string; pathname?: string };

/** Keep selection and routing as one operation for every dashboard test link. */
export const openDashboardTest = (
  test: Pick<TestRecord, 'id'>,
  api: CommandTarget | undefined,
  route: RouteTarget,
) => {
  api?.command({ type: 'select-test', testId: test.id });
  if (api?.platform === 'web' && route.pathname) {
    const projectId = route.pathname.split('/')[2];
    route.pathname = `/projects/${projectId}/tests/${test.id}`;
    return;
  }
  route.hash = '#/test';
};
