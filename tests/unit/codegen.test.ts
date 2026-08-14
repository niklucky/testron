import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generatePlaywright } from '../../src/domain/codegen/playwright';
import { loginSteps } from '../fixtures/login-steps';

describe('Playwright generation', () => {
  it('deterministically produces the replayed fixture spec', () => {
    const checkedInSpec = readFileSync(
      join(process.cwd(), 'tests/generated/login.spec.ts'),
      'utf8',
    );
    expect(generatePlaywright('recorded login flow', loginSteps)).toBe(checkedInSpec);
  });
});
