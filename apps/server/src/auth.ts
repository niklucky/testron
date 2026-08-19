import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';

import {
  desktopLoginPollInputSchema,
  desktopLoginPollOutputSchema,
  desktopLoginStartInputSchema,
  desktopLoginStartOutputSchema,
  type DesktopLoginPollOutput,
  type DesktopLoginStartOutput,
} from '@testron/protocol';
import type { Database } from './database/database.js';
import { desktopLoginFlows, sessions, users } from './database/schema.js';

const passwordSchema = z.string().min(12).max(200);
export const approveDesktopLoginSchema = z
  .object({
    userCode: z.string().length(8),
    email: z.email().transform((email) => email.toLowerCase()),
    password: passwordSchema,
  })
  .strict();

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const passwordHash = (password: string, salt: string): string =>
  scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export class AuthenticationService {
  constructor(
    private readonly db: Database,
    private publicBaseUrl: string,
  ) {}

  setPublicBaseUrl(value: string): void {
    this.publicBaseUrl = value;
  }

  async provisionUser(emailValue: string, passwordValue: string): Promise<AuthenticatedUser> {
    const email = z.email().parse(emailValue).toLowerCase();
    const password = passwordSchema.parse(passwordValue);
    const [existing] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) return { id: existing.id, email: existing.email };
    const salt = randomBytes(16).toString('hex');
    const [user] = await this.db
      .insert(users)
      .values({ email, passwordSalt: salt, passwordHash: passwordHash(password, salt) })
      .returning({ id: users.id, email: users.email });
    if (!user) throw new Error('Could not provision the user.');
    return user;
  }

  async startDesktopLogin(value: unknown): Promise<DesktopLoginStartOutput> {
    const { email } = desktopLoginStartInputSchema.parse(value);
    const deviceCode = randomBytes(32).toString('base64url');
    const userCode = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await this.db.insert(desktopLoginFlows).values({
      userCode,
      deviceCodeHash: hash(deviceCode),
      requestedEmail: email.toLowerCase(),
      expiresAt,
    });
    return desktopLoginStartOutputSchema.parse({
      deviceCode,
      userCode,
      verificationUri: `${this.publicBaseUrl}/auth/desktop?code=${userCode}`,
      expiresInSeconds: 600,
      intervalSeconds: 2,
    });
  }

  async approveDesktopLogin(value: unknown): Promise<void> {
    const input = approveDesktopLoginSchema.parse(value);
    const [flow] = await this.db
      .select()
      .from(desktopLoginFlows)
      .where(eq(desktopLoginFlows.userCode, input.userCode))
      .limit(1);
    if (
      !flow ||
      flow.status !== 'pending' ||
      flow.requestedEmail !== input.email ||
      Date.parse(flow.expiresAt) <= Date.now()
    )
      throw new Error('This desktop login request is invalid or expired.');
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user) throw new Error('The email or password is incorrect.');
    const actual = Buffer.from(passwordHash(input.password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error('The email or password is incorrect.');
    await this.db
      .update(desktopLoginFlows)
      .set({ status: 'approved', userId: user.id })
      .where(and(eq(desktopLoginFlows.id, flow.id), eq(desktopLoginFlows.status, 'pending')));
  }

  async pollDesktopLogin(value: unknown): Promise<DesktopLoginPollOutput> {
    const { deviceCode } = desktopLoginPollInputSchema.parse(value);
    return this.db.transaction(async (tx) => {
      const [flow] = await tx
        .select()
        .from(desktopLoginFlows)
        .where(eq(desktopLoginFlows.deviceCodeHash, hash(deviceCode)))
        .for('update')
        .limit(1);
      if (!flow || Date.parse(flow.expiresAt) <= Date.now())
        return desktopLoginPollOutputSchema.parse({ status: 'expired' });
      if (flow.status !== 'approved' || !flow.userId)
        return desktopLoginPollOutputSchema.parse({ status: 'pending' });
      const accessToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
      await tx
        .insert(sessions)
        .values({ userId: flow.userId, tokenHash: hash(accessToken), expiresAt });
      await tx
        .update(desktopLoginFlows)
        .set({ status: 'consumed' })
        .where(eq(desktopLoginFlows.id, flow.id));
      return desktopLoginPollOutputSchema.parse({ status: 'authorized', accessToken, expiresAt });
    });
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticatedUser | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hash(authorization.slice(7))),
          gt(sessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);
    return user;
  }
}
