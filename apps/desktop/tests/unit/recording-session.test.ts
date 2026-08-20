import { describe, expect, it, vi } from 'vitest';

import { RecordingSession } from '../../src/main/recording/session';

describe('RecordingSession edit mode', () => {
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
