import type { ProjectInvitation } from '@testron/protocol';

export interface InvitationMailer {
  sendInvitation(invitation: ProjectInvitation): Promise<void>;
}

export const disabledInvitationMailer: InvitationMailer = {
  sendInvitation: async () => undefined,
};

type Fetch = typeof fetch;

export class ResendInvitationMailer implements InvitationMailer {
  constructor(
    private readonly options: {
      apiKey: string;
      from: string;
      fetch?: Fetch;
    },
  ) {}

  async sendInvitation(invitation: ProjectInvitation): Promise<void> {
    const inviter = invitation.invitedBy.name ?? invitation.invitedBy.email;
    const subject = `You're invited to ${invitation.projectName} on Testron`;
    const text = [
      `${inviter} invited you to collaborate on ${invitation.projectName} in Testron.`,
      '',
      `Open the Testron desktop app and sign in as ${invitation.email}.`,
      'Your invitation will appear automatically with options to accept or reject it.',
    ].join('\n');
    const html = `
      <div style="font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#172126;line-height:1.55">
        <h1 style="font-size:24px;margin:0 0 16px">Join ${escapeHtml(invitation.projectName)} on Testron</h1>
        <p>${escapeHtml(inviter)} invited you to collaborate on <strong>${escapeHtml(invitation.projectName)}</strong>.</p>
        <p>Open the Testron desktop app and sign in as <strong>${escapeHtml(invitation.email)}</strong>.</p>
        <p>Your invitation will appear automatically with options to accept or reject it.</p>
      </div>
    `.trim();
    const response = await (this.options.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': `testron-invitation/${invitation.id}`,
        'user-agent': 'testron-server/0.0.1',
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [invitation.email],
        subject,
        text,
        html,
        tags: [
          { name: 'category', value: 'project-invitation' },
          { name: 'invitation_id', value: invitation.id },
        ],
      }),
    });
    if (response.ok) return;

    let detail = `Resend returned HTTP ${response.status}.`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') detail = body.message;
    } catch {
      // Preserve the status-based message when Resend did not return JSON.
    }
    throw new Error(`Invitation email delivery failed: ${detail}`);
  }
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!,
  );
