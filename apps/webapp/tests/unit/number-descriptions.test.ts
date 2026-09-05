import { expect, it } from 'vitest';
import { en, ru } from '@testron/i18n';
import { sentence } from '../../src/components/features/record/codegen';
import type { RecordedStep } from '../../src/components/features/record/types';

const comparisons = [
  ['numberEquals', '='],
  ['numberGreaterThan', '>'],
  ['numberAtLeast', '>='],
  ['numberLessThan', '<'],
  ['numberAtMost', '<='],
] as const;
for (const [assertion, symbol] of comparisons) {
  it(`localizes ${assertion} and preserves the English fallback and zero default`, () => {
    const step: RecordedStep = {
      id: 'score',
      kind: 'assert',
      label: 'score',
      locator: "locator('#score')",
      alternatives: [],
      at: 0,
      assertion,
      value: '-42.5',
    };
    const translate = (key: string, values?: Record<string, string | number>) => {
      expect(key).toBe('step_expect_target_number');
      return ru[key as keyof typeof ru].replace(/{{(\w+)}}/g, (_, name: string) =>
        String(values?.[name]),
      );
    };
    expect(sentence(step, translate)).toBe(`Проверить, что число в «score» ${symbol} -42.5`);
    expect(sentence({ ...step, value: undefined }, translate)).toBe(
      `Проверить, что число в «score» ${symbol} 0`,
    );
    const english = (key: string, values?: Record<string, string | number>) =>
      en[key as keyof typeof en].replace(/{{(\w+)}}/g, (_, name: string) => String(values?.[name]));
    expect(sentence(step, english)).toBe(sentence(step));
    expect(sentence({ ...step, value: undefined })).toBe(`Expect “score” number ${symbol} 0`);
  });
}
