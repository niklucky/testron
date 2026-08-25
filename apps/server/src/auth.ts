import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';

import {
  authLoginInputSchema,
  authRequestPasswordResetInputSchema,
  authResetPasswordInputSchema,
  authRegisterInputSchema,
  authSessionOutputSchema,
  changeAccountPasswordRequestSchema,
  updateAccountProfileRequestSchema,
  type AuthSessionOutput,
} from '@testron/protocol';
import type { Database } from './database/database.js';
import { passwordResetTokens, sessions, users } from './database/schema.js';
import { disabledPasswordResetMailer, type PasswordResetMailer } from './email.js';

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const passwordHash = (password: string, salt: string): string =>
  scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
const passwordRecord = (password: string) => {
  const passwordSalt = randomBytes(16).toString('hex');
  return { passwordSalt, passwordHash: passwordHash(password, passwordSalt) };
};

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

export class AuthenticationError extends Error {
  constructor(
    readonly code: 'EMAIL_TAKEN' | 'INVALID_CREDENTIALS' | 'INVALID_RESET_TOKEN',
    message: string,
  ) {
    super(message);
  }
}

export class AuthenticationService {
  constructor(
    private readonly db: Database,
    private readonly passwordResetMailer: PasswordResetMailer = disabledPasswordResetMailer,
    private readonly publicBaseUrl = 'http://localhost',
  ) {}

  async provisionUser(emailValue: string, passwordValue: string): Promise<AuthenticatedUser> {
    const { email, password } = authLoginInputSchema.parse({
      email: emailValue,
      password: passwordValue,
    });
    const [existing] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return existing;
    const [created] = await this.db
      .insert(users)
      .values({ email, ...passwordRecord(password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, name: users.name });
    if (created) return created;
    const [concurrent] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!concurrent) throw new Error('Could not provision the user.');
    return concurrent;
  }

  async register(value: unknown): Promise<AuthSessionOutput> {
    const input = authRegisterInputSchema.parse(value);
    const [user] = await this.db
      .insert(users)
      .values({ email: input.email, name: input.name, ...passwordRecord(input.password) })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!user)
      throw new AuthenticationError('EMAIL_TAKEN', 'An account with this email already exists.');
    return this.createSession(user.id);
  }

  async login(value: unknown): Promise<AuthSessionOutput> {
    const input = authLoginInputSchema.parse(value);
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user) throw this.invalidCredentials();
    const actual = Buffer.from(passwordHash(input.password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw this.invalidCredentials();
    return this.createSession(user.id);
  }

  async requestPasswordReset(value: unknown): Promise<{ accepted: true }> {
    const { email } = authRequestPasswordResetInputSchema.parse(value);
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) return { accepted: true };

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hash(token);
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await this.db.transaction(async (transaction) => {
      await transaction.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await transaction
        .insert(passwordResetTokens)
        .values({ userId: user.id, tokenHash, expiresAt });
    });
    const resetUrl = new URL('/reset-password', this.publicBaseUrl);
    resetUrl.searchParams.set('token', token);
    await this.passwordResetMailer.sendPasswordReset({
      email,
      resetUrl: resetUrl.href,
      tokenId: tokenHash,
    });
    return { accepted: true };
  }

  async resetPassword(value: unknown): Promise<{ changed: true }> {
    const input = authResetPasswordInputSchema.parse(value);
    await this.db.transaction(async (transaction) => {
      const [resetToken] = await transaction
        .delete(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hash(input.token)),
            gt(passwordResetTokens.expiresAt, new Date().toISOString()),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });
      if (!resetToken)
        throw new AuthenticationError(
          'INVALID_RESET_TOKEN',
          'This password reset link is invalid or has expired.',
        );
      await transaction
        .update(users)
        .set(passwordRecord(input.newPassword))
        .where(eq(users.id, resetToken.userId));
      await transaction.delete(sessions).where(eq(sessions.userId, resetToken.userId));
      await transaction
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, resetToken.userId));
    });
    return { changed: true };
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticatedUser | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
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

  async revoke(accessToken: string | undefined): Promise<void> {
    if (!accessToken) return;
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hash(accessToken)));
  }

  async updateProfile(user: AuthenticatedUser, value: unknown): Promise<AuthenticatedUser> {
    const input = updateAccountProfileRequestSchema.parse(value);
    const [updated] = await this.db
      .update(users)
      .set({ name: input.name })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, email: users.email, name: users.name });
    if (!updated) throw this.invalidCredentials();
    return updated;
  }

  async changePassword(
    user: AuthenticatedUser,
    value: unknown,
  ): Promise<{ changed: true; sessionPolicy: 'preserve' }> {
    const input = changeAccountPasswordRequestSchema.parse(value);
    const [record] = await this.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!record || !this.passwordMatches(input.currentPassword, record))
      throw this.invalidCredentials();
    await this.db.update(users).set(passwordRecord(input.newPassword)).where(eq(users.id, user.id));
    return { changed: true, sessionPolicy: 'preserve' };
  }

  private invalidCredentials(): AuthenticationError {
    return new AuthenticationError('INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }

  private passwordMatches(
    password: string,
    user: Pick<typeof users.$inferSelect, 'passwordSalt' | 'passwordHash'>,
  ): boolean {
    const actual = Buffer.from(passwordHash(password, user.passwordSalt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private async createSession(userId: string): Promise<AuthSessionOutput> {
    const accessToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    await this.db.insert(sessions).values({ userId, tokenHash: hash(accessToken), expiresAt });
    return authSessionOutputSchema.parse({ accessToken, expiresAt });
  }
}
