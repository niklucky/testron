import { describe, expect, it } from 'vitest';
import { generatePlaywright } from '../../src/codegen/playwright';
import { parsePlaywright, playwrightReplayError } from '../../src/codegen/parse-playwright';
import { numberComparisons } from '../../src/steps/numbers';
import { RecorderNormalizer } from '../../src/recording/normalizer';
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
