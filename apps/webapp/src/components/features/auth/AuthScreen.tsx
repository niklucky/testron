import { authenticateBrowser } from '../../../lib/browser-api';

import { AuthLanding } from './AuthLanding';

export const AuthScreen = () => (
  <AuthLanding
    authenticate={authenticateBrowser}
    server={{
      configured: true,
      authentication: 'signedOut',
      workspace: 'loading',
      status: 'idle',
    }}
  />
);
