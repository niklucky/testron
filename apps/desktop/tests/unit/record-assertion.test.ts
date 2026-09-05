import { describe, expect, it } from 'vitest';

import type { Step } from '@testron/domain/steps/schema';
import { convertStepToAssertion } from '../../src/renderer/record/assertion';

const metadata = { recordedAt: '2026-08-17T10:00:00.000Z' };
const target = {
  primary: { strategy: 'id' as const, value: 'company' },
  alternatives: [{ strategy: 'name' as const, value: 'company' }],
};

describe('recorded action conversion', () => {
  it('turns navigation into a URL-path assertion', () => {
    const step: Step = {
      version: 1,
      kind: 'navigate',
      url: 'https://example.test/dashboard?company=one',
      metadata,
    };
    expect(convertStepToAssertion(step, '')).toEqual({
      version: 1,
      kind: 'assertUrlPath',
      expected: '/dashboard',
      metadata,
    });
  });

  it('uses values and checked state when the action provides them', () => {
    const fill: Step = { version: 1, kind: 'fill', target, value: 'Moscow', metadata };
    const check: Step = { version: 1, kind: 'check', target, metadata };
    expect(convertStepToAssertion(fill, '')).toMatchObject({
      kind: 'assertElement',
      target,
      assertion: { type: 'value', expected: 'Moscow' },
    });
    expect(convertStepToAssertion(check, '')).toMatchObject({
      kind: 'assertElement',
      assertion: { type: 'checked' },
    });
  });

  it('never turns a secret into an expected assertion value', () => {
    const secret: Step = {
      version: 1,
      kind: 'fill',
      target,
      value: '',
      secret: { environmentVariable: 'TESTRON_PASSWORD' },
      metadata,
    };
    expect(convertStepToAssertion(secret, '')).toMatchObject({
      kind: 'assertElement',
      assertion: { type: 'visible' },
    });
  });

  it('turns a hover action into a visibility assertion for the same target', () => {
    const hover: Step = { version: 1, kind: 'hover', target, metadata };
    expect(convertStepToAssertion(hover, '')).toMatchObject({
      kind: 'assertElement',
      target,
      assertion: { type: 'visible' },
    });
  });
});

import { editElementAssertion } from '../../src/renderer/record/assertion';

it('edits text comparison and expected substring together', () => {
  expect(
    editElementAssertion(
      { type: 'text', match: 'equals', expected: 'Welcome Ada' },
      { assertion: 'textContains', expected: 'Ada' },
    ),
  ).toEqual({ type: 'text', match: 'contains', expected: 'Ada' });
  expect(editElementAssertion({ type: 'value', expected: 'Ada' }, { expected: '' })).toEqual({
    type: 'value',
    expected: '',
  });
});
it('edits numeric thresholds and rejects invalid numeric drafts', () => {
  const current = { type: 'number', operator: 'equals', expected: 69 } as const;
  expect(editElementAssertion(current, { assertion: 'numberAtLeast', expected: '42' })).toEqual({
    type: 'number',
    operator: 'atLeast',
    expected: 42,
  });
  expect(editElementAssertion(current, { expected: '-0.5' })).toMatchObject({ expected: -0.5 });
  for (const expected of ['', ' ', '42 widgets', 'NaN', 'Infinity'])
    expect(editElementAssertion(current, { expected })).toBeUndefined();
  expect(
    editElementAssertion({ type: 'count', operator: 'equals', expected: 1 }, { expected: '1.5' }),
  ).toBeUndefined();
});
