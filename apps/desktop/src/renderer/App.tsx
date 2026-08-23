import { useEffect, useState } from 'react';

import { PanelHost } from './record/PanelHost';
import { RecordScreen } from './record/RecordScreen';
import { RecoveryScreen } from './local/RecoveryScreen';

/**
 * Hash routing, because the renderer is loaded from a file:// URL in the
 * packaged app and there is no server to answer a path.
 *
 * Product routes live in the remote webapp. This bundle contains only the
 * local execution and recovery surfaces that must work without the webapp.
 */
export const App = () => {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleRoute = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  // Panel views are hidden internal renderers. They receive their own narrow
  // record-state channel rather than the main window's application snapshot.
  if (route === '#/panel/steps') return <PanelHost panel="steps" />;
  if (route === '#/panel/code') return <PanelHost panel="code" />;
  if (route === '#/recovery') return <RecoveryScreen />;

  const product = route === '#/record' ? <RecordScreen /> : <RecoveryScreen />;

  return product;
};
