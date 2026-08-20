import type { WebWorkspaceSnapshot } from '@testron/protocol';
import { useLayoutEffect } from 'react';

import { connectBrowserApi } from '../../../lib/browser-api';
import { Dashboard } from './Dashboard';
import type { View } from './types';

export const WebDashboard = ({
  workspace,
  projectId,
  initialView,
  initialSettingsOpen,
}: {
  workspace: WebWorkspaceSnapshot;
  projectId: string;
  initialView?: View;
  initialSettingsOpen?: boolean;
}) => {
  useLayoutEffect(() => connectBrowserApi(workspace, projectId), [workspace, projectId]);
  return <Dashboard initialView={initialView} initialSettingsOpen={initialSettingsOpen} />;
};
