import { describe, expect, it } from 'vitest';
import { generatePlaywright } from '../../src/codegen/playwright';
import { parsePlaywright, playwrightReplayError } from '../../src/codegen/parse-playwright';
import { numberComparisons } from '../../src/steps/numbers';
import { RecorderNormalizer } from '../../src/recording/normalizer';
import { recorderCandidateSchema } from '../../src/recording/schema';
import { stepSchema, type Step } from '../../src/steps/schema';

const target = { primary: { strategy: 'id' as const, value: 'score' }, alternatives: [] };
const metadata = { recordedAt: new Date(0).toISOString() };
describe('numeric assertions', () => {
  for (const [comparison, { operator, matcher }] of Object.entries(numberComparisons)) {
    it(`records and round trips ${comparison} including negative decimals`, () => {
      const steps: Step[] = [];
      const normalizer = new RecorderNormalizer((step) => steps.push(step));
      normalizer.accept({
        kind: 'assertion',
        assertion: comparison as keyof typeof numberComparisons,
        observedText: ' -42.5 ',
        observedValue: '',
        url: 'https://example.test',
        target: { locators: [target.primary], fingerprint: 'score', sensitive: false },
      });
      expect(steps[0]).toMatchObject({ assertion: { type: 'number', operator, expected: -42.5 } });
      const source = generatePlaywright('numeric', steps);
      expect(source).toContain(`.${matcher}(-42.5)`);
      const parsed = parsePlaywright(source);
      expect(parsed.error).toBeUndefined();
      expect(parsed.steps[0]?.step).toMatchObject({
        kind: 'assertElement',
        assertion: { type: 'number', operator, expected: -42.5 },
      });
      expect(playwrightReplayError(source)).toBeUndefined();
      expect(
        parsePlaywright(source.replace('Number.isFinite(value)', 'true')).steps[0]?.step.kind,
      ).toBe('code');
    });
  }
  it.each([NaN, Infinity, -Infinity])('rejects nonfinite expected value %s', (expected) => {
    expect(
      stepSchema.safeParse({
        version: 1,
        kind: 'assertElement',
        target,
        metadata,
        assertion: { type: 'number', operator: 'equals', expected },
      }).success,
    ).toBe(false);
  });
});

for (const comparison of Object.keys(numberComparisons) as (keyof typeof numberComparisons)[]) {
  const candidate = (observedText: string) => ({
    kind: 'assertion' as const,
    assertion: comparison,
    observedText,
    observedValue: '',
    url: 'https://example.test',
    target: { locators: [target.primary], fingerprint: 'score', sensitive: false },
  });
  it.each([
    '',
    ' ',
    '\t\n',
    'N/A',
    'NaN',
    'Infinity',
    '-Infinity',
    '1e999',
    '7.3M',
    '$7.3',
    '42 widgets',
  ])(`${comparison} rejects invalid observed text %j instead of recording zero`, (observedText) => {
    expect(recorderCandidateSchema.safeParse(candidate(observedText)).success).toBe(false);
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    normalizer.accept(candidate(observedText));
    expect(steps).toEqual([]);
  });
  it.each([
    ['0', 0],
    [' 0 ', 0],
    [' -42.5 ', -42.5],
    ['.5', 0.5],
    ['1e3', 1000],
  ] as const)(`${comparison} preserves valid observed text %j`, (observedText, expected) => {
    const parsed = recorderCandidateSchema.parse(candidate(observedText));
    const steps: Step[] = [];
    const normalizer = new RecorderNormalizer((step) => steps.push(step));
    if (parsed.kind !== 'assertion') throw new Error('Expected assertion');
    normalizer.accept(parsed);
    expect(steps[0]).toMatchObject({
      assertion: { type: 'number', operator: numberComparisons[comparison].operator, expected },
    });
  });
}
it('keeps empty and nonnumeric text available for string assertions', () => {
  for (const observedText of ['', 'N/A']) {
    expect(
      recorderCandidateSchema.safeParse({
        kind: 'assertion',
        assertion: 'textEquals',
        observedText,
        observedValue: '',
        url: 'https://example.test',
        target: { locators: [target.primary], fingerprint: 'score' },
      }).success,
    ).toBe(true);
  }
});
