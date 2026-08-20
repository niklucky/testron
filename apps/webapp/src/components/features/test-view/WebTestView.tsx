import type { WebWorkspaceSnapshot } from '@testron/protocol';
import { useLayoutEffect } from 'react';

import { connectBrowserApi } from '../../../lib/browser-api';
import { TestView } from './TestView';

export const WebTestView = ({
  workspace,
  projectId,
  testId,
}: {
  workspace: WebWorkspaceSnapshot;
  projectId: string;
  testId: string;
}) => {
  useLayoutEffect(
    () => connectBrowserApi(workspace, projectId, testId),
    [workspace, projectId, testId],
  );
  return <TestView />;
};
