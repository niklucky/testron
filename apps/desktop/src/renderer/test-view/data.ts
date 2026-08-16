import { script } from '../record/data';
import type { TestBoard } from './types';

/**
 * The test the recorder screen produces, one step later in its life: same
 * steps, now with the things a recording cannot know — what has to be true
 * before it runs, and what happened the last three times it did.
 *
 * Everything here is a shell. Steps and the generated spec already have a home
 * in the domain; prerequisites and run history do not yet (see the notes in
 * TestView.tsx).
 */
export const board: TestBoard = {
  detail: {
    project: 'Commerce app',
    suite: 'Checkout',
    name: 'Guest checkout · card payment',
    file: 'tests/checkout/guest-card.spec.ts',
    environments: ['Staging', 'Preview'],
    tags: ['checkout', 'payments', 'smoke'],
    createdAt: '12 Aug 2026',
    updatedAt: '16 Aug 2026',
    createdBy: 'Nikita S.',
  },

  prerequisites: [
    {
      id: 'p1',
      kind: 'data',
      title: 'Basket with two items',
      detail: 'Seeded through the fixtures API before the run starts.',
      value: 'fixtures/basket-two-items.json',
    },
    {
      id: 'p2',
      kind: 'flag',
      title: 'Express delivery enabled',
      detail: 'Without it the delivery select has one option and step 4 fails.',
      value: 'checkout.express = on',
    },
  ],

  // The recorded take, minus the two steps that are assertions — those are
  // the fourth column.
  steps: script.filter((step) => !step.kind.startsWith('assert')),

  assertions: [
    {
      id: 'a1',
      afterStep: 4,
      label: 'Order total',
      locator: "getByTestId('order-total')",
      kind: 'textEquals',
      expected: '£148.00',
    },
    {
      id: 'a2',
      afterStep: 7,
      label: 'Order confirmed',
      locator: "getByRole('heading', { name: 'Order confirmed' })",
      kind: 'visible',
      expected: '',
    },
    {
      id: 'a3',
      afterStep: 7,
      label: 'Confirmation URL',
      locator: '',
      kind: 'urlPath',
      expected: '/checkout/confirmed',
    },
  ],

  runs: [
    {
      id: 'r1',
      verdict: 'failed',
      environment: 'Staging',
      seconds: 14.2,
      minutesAgo: 26,
      by: 'CI · main',
      trigger: 'ci',
      failedStepId: 's8',
      completed: 6,
    },
    {
      id: 'r2',
      verdict: 'passed',
      environment: 'Preview',
      seconds: 11.8,
      minutesAgo: 190,
      by: 'Nikita S.',
      trigger: 'manual',
      completed: 7,
    },
    {
      id: 'r3',
      verdict: 'passed',
      environment: 'Staging',
      seconds: 12.4,
      minutesAgo: 1_450,
      by: 'Nightly',
      trigger: 'schedule',
      completed: 7,
    },
  ],
};
