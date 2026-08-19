import { useEffect, useState } from 'react';

import { Dashboard } from './dashboard/Dashboard';
import { AuthenticationBoundary } from './auth/AuthenticationBoundary';
import { Dashboard as GlassStudy } from './design/experiments/Dashboard';
import { Dashboard2 as CodexStudy } from './design/experiments/Dashboard2';
import { Dashboard3 as WorkspaceStudy } from './design/experiments/Dashboard3';
import { DashboardIndex } from './design/experiments/DashboardIndex';
import { PanelHost } from './record/PanelHost';
import { RecordScreen } from './record/RecordScreen';
import { RunView } from './run-view/RunView';
import { Showcase } from './design/Showcase';
import { TestView } from './test-view/TestView';
import { RecorderApp } from './recorder/RecorderApp';

/**
 * Hash routing, because the renderer is loaded from a file:// URL in the
 * packaged app and there is no server to answer a path.
 *
 * `#/` is the product. Everything under `#/experiments` is a frozen UI study
 * kept around for reference — see design/experiments.
 */
export const App = () => {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleRoute = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  if (route === '#/design') return <Showcase />;
  if (route === '#/experiments') return <DashboardIndex />;
  if (route === '#/experiments/glass') return <GlassStudy />;
  if (route === '#/experiments/codex') return <CodexStudy />;
  if (route === '#/experiments/workspace') return <WorkspaceStudy />;
  // Panel views are hidden internal renderers. They receive their own narrow
  // record-state channel rather than the main window's application snapshot.
  if (route === '#/panel/steps') return <PanelHost panel="steps" />;
  if (route === '#/panel/code') return <PanelHost panel="code" />;

  const product =
    route === '#/record' ? (
      <RecordScreen />
    ) : route === '#/test' ? (
      <TestView />
    ) : route === '#/run' ? (
      <RunView />
    ) : route === '#/recorder' ? (
      <RecorderApp />
    ) : (
      <Dashboard />
    );

  return <AuthenticationBoundary>{product}</AuthenticationBoundary>;
};
