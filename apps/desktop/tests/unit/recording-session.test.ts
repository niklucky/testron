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

describe('source editing regressions', () => {
  const source = "test('small', async ({ page }) => { await page.goto('https://example.com'); });";
  it('publishes a source acknowledgement after a valid edit', () => {
    const changed = vi.fn();
    const session = new RecordingSession(changed);
    session.updateSource(source);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ source }));
  });
  it('never patches stale offsets in an invalid source draft', () => {
    const session = new RecordingSession(vi.fn());
    session.updateSource(source);
    const invalid = '// shifted offsets\n' + source.slice(0, -1) + '{';
    session.updateSource(invalid);
    session.deleteStep(0);
    session.duplicateStep(0);
    session.addUrlAssertion('/done');
    expect(session.snapshot().source).toBe(invalid);
    expect(session.snapshot().steps[0]?.kind).toBe('navigate');
  });
  it('keeps an empty draft on reload and clears undo history for a new recording', () => {
    const session = new RecordingSession(vi.fn());
    session.updateSource(source);
    session.load('empty', [], '');
    expect(session.snapshot().source).toBe('');
    session.updateSource(source);
    session.start(false);
    expect(session.snapshot().canUndo).toBe(false);
  });
  it('preserves new locator alternatives, warnings, and recording timestamps', () => {
    const session = new RecordingSession(vi.fn());
    session.updateSource(source);
    const metadata = { recordedAt: '2026-08-17T02:00:00.000Z' };
    session.replaceSteps([
      {
        version: 1,
        kind: 'fill',
        value: 'hello',
        metadata,
        target: {
          primary: { strategy: 'id', value: 'name' },
          alternatives: [{ strategy: 'label', text: 'Name' }],
          warnings: ['custom warning'],
        },
      },
    ]);
    expect(session.snapshot().steps[0]).toMatchObject({
      metadata,
      target: { alternatives: [{ strategy: 'label', text: 'Name' }], warnings: ['custom warning'] },
    });
  });
});

it('keeps secret bindings and locator alternatives across undo and redo', () => {
  const session = new RecordingSession(vi.fn());
  const step = {
    version: 1 as const,
    kind: 'fill' as const,
    value: '',
    secret: { environmentVariable: 'PASSWORD' },
    metadata: { recordedAt: '2026-08-17T02:00:00.000Z' },
    target: {
      primary: { strategy: 'id' as const, value: 'password' },
      alternatives: [{ strategy: 'label' as const, text: 'Password' }],
    },
  };
  session.replaceSteps([step]);
  session.deleteStep(0);
  session.undo();
  expect(session.snapshot().steps[0]).toMatchObject(step);
  session.redo();
  expect(session.snapshot().steps).toEqual([]);
});
