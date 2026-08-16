import type { Step } from '../../src/steps/schema';

const recordedAt = '2026-01-01T00:00:00.000Z';

export const loginSteps: Step[] = [
  { version: 1, kind: 'navigate', url: 'http://127.0.0.1:4174/', metadata: { recordedAt } },
  {
    version: 1,
    kind: 'fill',
    target: {
      primary: { strategy: 'testId', attribute: 'data-testid', value: 'email' },
      alternatives: [],
    },
    value: 'qa@example.test',
    metadata: { recordedAt },
  },
  {
    version: 1,
    kind: 'fill',
    target: {
      primary: { strategy: 'testId', attribute: 'data-testid', value: 'workspace' },
      alternatives: [],
    },
    value: 'quality-lab',
    metadata: { recordedAt },
  },
  {
    version: 1,
    kind: 'click',
    target: { primary: { strategy: 'role', role: 'button', name: 'Continue' }, alternatives: [] },
    metadata: { recordedAt },
  },
];
