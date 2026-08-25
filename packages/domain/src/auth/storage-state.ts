export interface AuthenticationStorageState {
  cookies: Array<{ value: string; expires?: number }>;
  origins: Array<{ localStorage?: Array<{ value: string }> }>;
}

const jwtExpiration = (value: string): number | undefined => {
  const parts = value.trim().split('.');
  if (parts.length !== 3) return undefined;
  const payloadPart = parts[1];
  if (!payloadPart) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof payload.exp === 'number' &&
      Number.isFinite(payload.exp)
    )
      return payload.exp * 1_000;
  } catch {
    // An unverified or malformed JWT is simply not useful for expiry discovery.
  }
  return undefined;
};

const expirationsInValue = (value: string, depth = 0): number[] => {
  const direct = jwtExpiration(value);
  if (direct !== undefined) return [direct];
  if (depth >= 2) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const strings: string[] = [];
    const visit = (entry: unknown): void => {
      if (typeof entry === 'string') strings.push(entry);
      else if (Array.isArray(entry)) entry.forEach(visit);
      else if (typeof entry === 'object' && entry !== null) Object.values(entry).forEach(visit);
    };
    visit(parsed);
    return strings.flatMap((entry) => expirationsInValue(entry, depth + 1));
  } catch {
    return [];
  }
};

export const deriveAuthenticationStateExpiration = (
  state: AuthenticationStorageState,
  createdAt: Date,
  maxAgeSeconds: number,
): Date => {
  const candidates = [createdAt.getTime() + maxAgeSeconds * 1_000];
  for (const cookie of state.cookies) {
    if (cookie.expires !== undefined && cookie.expires > 0) candidates.push(cookie.expires * 1_000);
    candidates.push(...expirationsInValue(cookie.value));
  }
  for (const origin of state.origins)
    for (const entry of origin.localStorage ?? [])
      candidates.push(...expirationsInValue(entry.value));
  return new Date(Math.min(...candidates));
};

export const authenticationStateIsStale = (
  expiresAt: Date,
  refreshBeforeExpirySeconds: number,
  now = new Date(),
): boolean => expiresAt.getTime() <= now.getTime() + refreshBeforeExpirySeconds * 1_000;
