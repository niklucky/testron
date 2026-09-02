import type { RecordedStep } from '../record/types';

/**
 * The test as a board reads it.
 *
 * Steps come straight from the recorder's vocabulary — the cards in the third
 * column *are* the recorded steps — so a test opened here and a take being
 * recorded are the same object at two moments in its life.
 */

export type Prerequisite = string;

export type AssertionKind =
  | 'visible'
  | 'hidden'
  | 'textEquals'
  | 'textContains'
  | 'value'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'unchecked'
  | 'countExactly'
  | 'countAtLeast'
  | 'attribute'
  | 'class'
  | 'urlPath';

export type Assertion = {
  id: string;
  /**
   * The step this assertion follows. Assertions live in their own column here,
   * but in the spec they are steps in a sequence — the anchor is what keeps
   * the two readings from disagreeing.
   */
  afterStep: number;
  label: string;
  locator: string;
  kind: AssertionKind;
  attributeName?: string;
  expected: string;
};

export type RunVerdict = 'passed' | 'failed' | 'running' | 'cancelled';

export type Run = {
  id: string;
  verdict: RunVerdict;
  environment: string;
  seconds: number;
  minutesAgo: number;
  by: string;
  trigger: 'manual' | 'ci' | 'schedule';
  /** Set when the run failed: which step card to point at. */
  failedStepId?: string;
  /** The real runner or failing-step message shown without opening developer tools. */
  error?: string;
  /** How far it got, for the progress ribbon. */
  completed: number;
};

export type TestDetail = {
  project: string;
  suite: string;
  name: string;
  file: string;
  /** Environments this test is allowed to run in. */
  environments: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type TestBoard = {
  detail: TestDetail;
  prerequisites: Prerequisite[];
  steps: RecordedStep[];
  assertions: Assertion[];
  runs: Run[];
};

/** Every environment the project defines, for the picker in column one. */
export const allEnvironments = ['Local', 'Staging', 'Preview', 'Production'];

export const assertionLabels: Record<AssertionKind, string> = {
  visible: 'is visible',
  hidden: 'is hidden',
  textEquals: 'text equals',
  textContains: 'text contains',
  value: 'has value',
  enabled: 'is enabled',
  disabled: 'is disabled',
  checked: 'is checked',
  unchecked: 'is unchecked',
  countExactly: 'count is exactly',
  countAtLeast: 'count is at least',
  attribute: 'has attribute',
  class: 'has class',
  urlPath: 'URL path equals',
};

/** The assertions that need something typed next to them. */
export const assertionNeedsValue = (kind: AssertionKind) =>
  kind === 'textEquals' ||
  kind === 'textContains' ||
  kind === 'value' ||
  kind === 'countExactly' ||
  kind === 'countAtLeast' ||
  kind === 'attribute' ||
  kind === 'class' ||
  kind === 'urlPath';
