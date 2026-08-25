import { describe, expect, it } from 'vitest';

import type { ProjectInvitation } from '@testron/protocol';
import { ResendInvitationMailer, ResendMailer } from '../src/email.js';

const invitation: ProjectInvitation = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  projectName: '<Checkout & payments>',
  email: 'member@example.test',
  inviteeName: 'Member',
  invitedBy: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'owner@example.test',
    name: 'Owner',
  },
  status: 'invited',
  createdAt: '2026-08-20T00:00:00.000Z',
  respondedAt: null,
};

describe('Resend invitation mailer', () => {
  it('sends the invitation with authenticated, idempotent Resend headers', async () => {
    let captured: { input: Parameters<typeof fetch>[0]; init?: RequestInit } | undefined;
    const request: typeof fetch = async (input, init) => {
      captured = { input, ...(init ? { init } : {}) };
      return new Response(JSON.stringify({ id: 'email-id' }));
    };
    const mailer = new ResendInvitationMailer({
      apiKey: 're_test_key',
      from: 'Testron <invites@example.test>',
      fetch: request,
    });

    await mailer.sendInvitation(invitation);

    expect(captured?.input).toBe('https://api.resend.com/emails');
    const init = captured?.init;
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer re_test_key',
      'idempotency-key': `testron-invitation/${invitation.id}`,
      'user-agent': 'testron-server/0.0.1',
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: 'Testron <invites@example.test>',
      to: [invitation.email],
    });
    expect(String(body.html)).toContain('&lt;Checkout &amp; payments&gt;');
    expect(String(body.text)).toContain('Open the Testron desktop app');
  });

  it('surfaces the safe Resend error message without exposing the API key', async () => {
    const mailer = new ResendInvitationMailer({
      apiKey: 're_super_secret',
      from: 'Testron <invites@example.test>',
      fetch: async () =>
        new Response(JSON.stringify({ message: 'The sender domain is not verified.' }), {
          status: 422,
        }),
    });

    await expect(mailer.sendInvitation(invitation)).rejects.toThrow(
      'Invitation email delivery failed: The sender domain is not verified.',
    );
    await expect(mailer.sendInvitation(invitation)).rejects.not.toThrow('re_super_secret');
  });
});

describe('Resend password reset mailer', () => {
  it('sends an expiring reset link without placing the token in headers or tags', async () => {
    let captured: { input: Parameters<typeof fetch>[0]; init?: RequestInit } | undefined;
    const mailer = new ResendMailer({
      apiKey: 're_test_key',
      from: 'Testron <accounts@example.test>',
      fetch: async (input, init) => {
        captured = { input, ...(init ? { init } : {}) };
        return new Response(JSON.stringify({ id: 'email-id' }));
      },
    });

    await mailer.sendPasswordReset({
      email: 'member@example.test',
      resetUrl: 'https://testron.example.test/reset-password?token=secret-token',
      tokenId: 'hashed-token-id',
    });

    expect(captured?.input).toBe('https://api.resend.com/emails');
    expect(captured?.init?.headers).toMatchObject({
      'idempotency-key': 'testron-password-reset/hashed-token-id',
    });
    const body = JSON.parse(String(captured?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      to: ['member@example.test'],
      subject: 'Reset your Testron password',
      tags: [{ name: 'category', value: 'password-reset' }],
    });
    expect(String(body.text)).toContain('token=secret-token');
    expect(JSON.stringify(captured?.init?.headers)).not.toContain('secret-token');
  });
});
