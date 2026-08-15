import { useEffect, useState } from 'react';

import { Dashboard } from './dashboard/Dashboard';
import { Dashboard as GlassStudy } from './design/experiments/Dashboard';
import { Dashboard2 as CodexStudy } from './design/experiments/Dashboard2';
import { Dashboard3 as WorkspaceStudy } from './design/experiments/Dashboard3';
import { DashboardIndex } from './design/experiments/DashboardIndex';
import { Showcase } from './design/Showcase';
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

  if (route === '#/recorder') return <RecorderApp />;
  if (route === '#/design') return <Showcase />;
  if (route === '#/experiments') return <DashboardIndex />;
  if (route === '#/experiments/glass') return <GlassStudy />;
  if (route === '#/experiments/codex') return <CodexStudy />;
  if (route === '#/experiments/workspace') return <WorkspaceStudy />;
  return <Dashboard />;
};
