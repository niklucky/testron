export type AuthenticationRequest =
  | { mode: 'login'; email: string; password: string }
  | { mode: 'register'; name: string; email: string; password: string }
  | { mode: 'forgot'; email: string }
  | { mode: 'reset'; token: string; newPassword: string };

export type Authenticate = (request: AuthenticationRequest) => Promise<void>;

export const authenticationErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Authentication failed. Please try again.';
};
