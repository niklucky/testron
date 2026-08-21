import '../../../lib/browser-api';

import { AuthLanding } from './AuthLanding';

export const AuthScreen = () => (
  <AuthLanding
    server={{
      configured: true,
      authentication: 'signedOut',
      workspace: 'loading',
      status: 'idle',
    }}
  />
);
