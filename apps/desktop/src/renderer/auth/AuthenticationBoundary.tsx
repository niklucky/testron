import { useEffect, useState, type ReactNode } from 'react';

import type { AppSnapshot } from '../../preload/api';
import { authenticationSurface } from './access';
import { AuthLanding, AuthenticationLoading } from './AuthLanding';
import { projectSurface } from '../projects/access';
import { ProjectOnboarding } from '../projects/ProjectOnboarding';

export const AuthenticationBoundary = ({ children }: { children: ReactNode }) => {
  const [snapshot, setSnapshot] = useState<AppSnapshot>();

  useEffect(() => {
    const unsubscribe = window.testron?.onSnapshot(setSnapshot);
    window.testron?.command({ type: 'request-snapshot' });
    return unsubscribe;
  }, []);

  const server = snapshot?.library.server ?? {
    configured: false,
    authentication: 'signedOut' as const,
    workspace: 'loading' as const,
    status: 'idle' as const,
    message: 'A remote server URL is required before you can sign in.',
  };
  const surface = authenticationSurface(Boolean(snapshot), server);
  if (surface === 'loading') return <AuthenticationLoading />;
  if (surface === 'landing') return <AuthLanding server={server} />;
  if (!snapshot) return <AuthenticationLoading />;
  const projects = projectSurface(snapshot.library);
  if (projects === 'loading') return <AuthenticationLoading />;
  if (projects === 'onboarding') return <ProjectOnboarding library={snapshot.library} />;
  return children;
};
