import { z } from 'zod';

export const verifyAssertionSchema = z.enum([
  'visible',
  'hidden',
  'textContains',
  'textEquals',
  'numberEquals',
  'numberGreaterThan',
  'numberAtLeast',
  'numberLessThan',
  'numberAtMost',

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
