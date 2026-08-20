import type { AppCommand } from '../../preload/api';
import type { TestRecord } from './types';

type CommandTarget = { command: (command: AppCommand) => void };
type RouteTarget = { hash: string };

/** Keep selection and routing as one operation for every dashboard test link. */
export const openDashboardTest = (
  test: Pick<TestRecord, 'id'>,
  api: CommandTarget | undefined,
  route: RouteTarget,
) => {
  api?.command({ type: 'select-test', testId: test.id });
  route.hash = '#/test';
};
