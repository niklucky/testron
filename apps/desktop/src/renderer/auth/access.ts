import type { LibrarySnapshot } from '../../main/persistence/repository';

export type AuthenticationSurface = 'loading' | 'landing' | 'product';

/**
 * A signed-in local-development process and a signed-in remote session may
 * enter the product. Every ordinary signed-out process stays on the landing.
 */
export const authenticationSurface = (
  loaded: boolean,
  server: LibrarySnapshot['server'],
): AuthenticationSurface => {
  if (!loaded) return 'loading';
  return server?.authentication === 'signedIn' ? 'product' : 'landing';
};
