import { z } from 'zod';

import { stepSchema, stepsSchema } from '@testron/domain/steps/schema';
import {
  entityIdSchema,
  environmentNameSchema,
  httpUrlSchema,
  projectNameSchema,
  testIdAttributeSchema,
  testTitleSchema,
} from '@testron/protocol';
import { recordLayoutSchema, recordPanelStateSchema } from './record';
import { verifyAssertionSchema } from './verify-assertion';

export { verifyAssertionSchema } from './verify-assertion';
export type { VerifyAssertion } from './verify-assertion';

/**
 * Desktop IPC is a separate compatibility boundary from the server protocol.
 * Its resource fields reuse protocol invariants, while its command envelope
 * remains desktop-owned.
 */
export const appCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-shell-route'), route: z.enum(['dashboard', 'recorder']) }),
  z.object({ type: z.literal('start-recording'), append: z.boolean().optional() }),
  z.object({ type: z.literal('stop-recording') }),
  z.object({ type: z.literal('pause-recording') }),
  z.object({ type: z.literal('resume-recording') }),
  z.object({ type: z.literal('undo-step') }),
  z.object({ type: z.literal('redo-step') }),
  z.object({ type: z.literal('finish-recording') }),
  z.object({ type: z.literal('delete-step'), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('move-step'),
    index: z.number().int().nonnegative(),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.object({ type: z.literal('duplicate-step'), index: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('update-step'),
    index: z.number().int().nonnegative(),
    step: stepSchema,
  }),
  z.object({ type: z.literal('replace-steps'), steps: stepsSchema }),
  z.object({
    type: z.literal('use-alternative-locator'),
    index: z.number().int().nonnegative(),
    alternativeIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('set-repick-step'),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('set-capture-mode'),
    mode: z.enum(['record', 'verify']),
    assertion: verifyAssertionSchema,
  }),
  z.object({ type: z.literal('add-url-path-assertion'), expected: z.string().startsWith('/') }),
  z.object({ type: z.literal('navigate'), url: httpUrlSchema }),
  z.object({
    type: z.literal('browser-navigation'),
    action: z.enum(['back', 'forward', 'reload', 'stop']),
  }),
  z.object({ type: z.literal('request-snapshot') }),
  z.object({ type: z.literal('create-project'), name: projectNameSchema }),
  z.object({
    type: z.literal('create-environment'),
    projectId: entityIdSchema,
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
    testIdAttribute: testIdAttributeSchema,
  }),
  z.object({
    type: z.literal('create-test'),
    projectId: entityIdSchema,
    environmentId: entityIdSchema,
    title: testTitleSchema,
  }),
  z.object({ type: z.literal('select-project'), projectId: entityIdSchema }),
  z.object({ type: z.literal('select-environment'), environmentId: entityIdSchema }),
  z.object({
    type: z.literal('create-profile'),
    environmentId: entityIdSchema,
    name: z.string().trim().min(1).max(100),
    authenticationType: z.literal('credentials'),
    variables: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          value: z.string().min(1).max(10_000),
          sensitive: z.boolean(),
        }),
      )
      .min(1)
      .max(50)
      .refine(
        (variables) =>
          new Set(variables.map((variable) => variable.name)).size === variables.length,
      ),
  }),
  z.object({ type: z.literal('select-profile'), profileId: entityIdSchema }),
  z.object({ type: z.literal('select-test'), testId: entityIdSchema }),
  z.object({ type: z.literal('rename-test'), testId: entityIdSchema, title: testTitleSchema }),
  z.object({ type: z.literal('prepare-new-test') }),
  z.object({ type: z.literal('save-recording'), title: testTitleSchema, baseUrl: httpUrlSchema }),
  z.object({ type: z.literal('copy-source') }),
  z.object({ type: z.literal('export-source') }),
  z.object({
    type: z.literal('run-test'),
    environmentVariables: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string()),
    timeoutMs: z.number().int().min(1_000).max(600_000),
    reuseAuthState: z.boolean(),
  }),
  z.object({ type: z.literal('cancel-run') }),
  z.object({ type: z.literal('clear-auth-state') }),
  z.object({ type: z.literal('set-record-layout'), layout: recordLayoutSchema }),
  z.object({ type: z.literal('publish-record-state'), state: recordPanelStateSchema }),
]);

export type AppCommand = z.infer<typeof appCommandSchema>;
