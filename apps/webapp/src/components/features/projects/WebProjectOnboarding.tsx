import type { WebWorkspaceSnapshot } from '@testron/protocol';
import { useLayoutEffect } from 'react';

import { connectBrowserApi, libraryFromWorkspace } from '../../../lib/browser-api';
import { ProjectOnboarding } from './ProjectOnboarding';

export const WebProjectOnboarding = ({ workspace }: { workspace: WebWorkspaceSnapshot }) => {
  useLayoutEffect(() => connectBrowserApi(workspace, ''), [workspace]);
  return <ProjectOnboarding library={libraryFromWorkspace(workspace)} />;
};
