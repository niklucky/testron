import { expect, it } from 'vitest';
import { sourcePathSchema } from '../src/sync';

it.each([
  '.Git/hooks/post-checkout',
  '.TESTRON/state.json',
  'nested/Node_Modules/index.js',
  '.ENV',
  'nested/.Env.production',
])('rejects reserved source paths regardless of case: %s', (source) => {
  expect(sourcePathSchema.safeParse(source).success).toBe(false);
});

it('preserves case in ordinary source paths', () => {
  expect(sourcePathSchema.parse('Tests/Auth.spec.ts')).toBe('Tests/Auth.spec.ts');
});
