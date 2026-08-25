import { describe, expect, it } from 'vitest';

import type { RevisionStep } from '@testron/protocol';
import type { Step } from '@testron/domain/steps/schema';
import { applyStepMutation, reconcileRevisionSteps } from '../../src/lib/browser-step-mutations';

const metadata = { recordedAt: '2026-08-25T18:00:00.000Z' };
const target = {
  primary: { strategy: 'testId' as const, attribute: 'data-testid', value: 'save' },
  alternatives: [],
};
const action: Step = { version: 1, kind: 'click', target, metadata };
const assertion: Step = {
  version: 1,
  kind: 'assertElement',
  target,
  assertion: { type: 'visible' },
  metadata,
};

describe('browser step mutations', () => {
  it('deletes actions and assertions by their canonical step index', () => {
    expect(applyStepMutation([action, assertion], { type: 'delete-step', index: 0 })).toEqual([
      assertion,
    ]);
    expect(applyStepMutation([action, assertion], { type: 'delete-step', index: 1 })).toEqual([
      action,
    ]);
    expect(applyStepMutation([action], { type: 'delete-step', index: 2 })).toBeUndefined();
  });

  it('preserves unchanged server step IDs across deletion and insertion', () => {
    const previous: RevisionStep[] = [
      { id: '00000000-0000-4000-8000-000000000001', payload: action },
      { id: '00000000-0000-4000-8000-000000000002', payload: assertion },
    ];
    expect(reconcileRevisionSteps(previous, [assertion], () => 'new-id')).toEqual([
      { id: previous[1]!.id, payload: assertion },
    ]);

    const inserted: Step = { ...action, metadata: { recordedAt: '2026-08-25T18:00:01.000Z' } };
    expect(reconcileRevisionSteps(previous, [inserted, action, assertion], () => 'new-id')).toEqual(
      [{ id: 'new-id', payload: inserted }, previous[0], previous[1]],
    );
  });
});
