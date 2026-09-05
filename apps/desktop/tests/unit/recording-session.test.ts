import { describe, expect, it, vi } from 'vitest';

import { RecordingSession } from '../../src/main/recording/session';

describe('RecordingSession edit mode', () => {
  it('treats edited Playwright source as the source of truth', () => {
    const persisted = vi.fn();
    const session = new RecordingSession(vi.fn(), persisted);
    const source = `import { test } from '@playwright/test';

test('Edited test', async ({ page }) => {
  await page.getByRole('button', { name: 'Continue' }).click();
});
`;

    session.updateSource(source);

    expect(session.snapshot()).toMatchObject({
      title: 'Edited test',
      source,
      steps: [{ kind: 'click', target: { primary: { strategy: 'role', name: 'Continue' } } }],
    });
    expect(persisted).toHaveBeenLastCalledWith(session.snapshot().steps, source, 'Edited test');
  });

  it('keeps unsupported control flow as exact code in the manual steps', () => {
    const session = new RecordingSession(vi.fn(), vi.fn());
    session.updateSource(`import { test } from '@playwright/test';

test('Conditional', async ({ page }) => {
  if (await page.getByText('Cookies').isVisible()) {
    await page.getByText('Cookies').click();
  }
});
`);

    expect(session.snapshot().steps).toMatchObject([
      {
        kind: 'code',
        code: "if (await page.getByText('Cookies').isVisible()) {\n    await page.getByText('Cookies').click();\n  }",
      },
    ]);
  });

  it('keeps existing steps when continuing a saved recording', () => {
    const changed = vi.fn();
    const persisted = vi.fn();
    const session = new RecordingSession(changed, persisted);
    session.load('Existing test', [
      {
        version: 1,
        kind: 'click',
        target: {
          primary: { strategy: 'role', role: 'button', name: 'Dashboard' },
          alternatives: [],
        },
        metadata: { recordedAt: '2026-08-17T02:00:00.000Z' },
      },
    ]);

    session.start(true);

    expect(session.snapshot().title).toBe('Existing test');
    expect(session.snapshot().status).toBe('recording');
    expect(session.snapshot().steps).toHaveLength(1);
    expect(session.snapshot().steps[0]).toMatchObject({ kind: 'click' });
  });

  it('replaces only the target of a saved step', () => {
    const session = new RecordingSession(vi.fn(), vi.fn());
    session.load('Existing test', [
      {
        version: 1,
        kind: 'fill',
        target: {
          primary: { strategy: 'css', selector: 'div > input', fragile: true },
          alternatives: [],
        },
        value: 'Administrator',
        metadata: { recordedAt: '2026-08-17T02:00:00.000Z' },
      },
    ]);

    session.repickTarget(0, {
      primary: { strategy: 'name', value: 'username' },
      alternatives: [{ strategy: 'id', value: 'login' }],
    });

    expect(session.snapshot().steps[0]).toMatchObject({
      kind: 'fill',
      value: 'Administrator',
      target: { primary: { strategy: 'name', value: 'username' } },
    });
  });
});
