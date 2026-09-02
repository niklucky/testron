import { z } from 'zod';

export const verifyAssertionSchema = z.enum([
  'visible',
  'hidden',
  'textContains',
  'textEquals',
  'value',
  'enabled',
  'disabled',
  'checked',
  'unchecked',
  'countExactly',
  'countAtLeast',
  'attribute',
  'class',
]);

export type VerifyAssertion = z.infer<typeof verifyAssertionSchema>;
