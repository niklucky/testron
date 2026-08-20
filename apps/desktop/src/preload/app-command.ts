import { z } from 'zod';

import { stepSchema, stepsSchema } from '@testron/domain/steps/schema';
import {
  authLoginInputSchema,
  authRegisterInputSchema,
  entityIdSchema,
  environmentNameSchema,
  httpUrlSchema,
  projectNameSchema,
  testIdAttributeSchema,
  testSuiteNameSchema,
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
  z.object({ type: z.literal('refresh-workspace') }),
  z.object({
    type: z.literal('update-account-profile'),
    name: z.string().trim().min(1).max(100),
  }),
  z.object({
    type: z.literal('change-account-password'),
    currentPassword: z.string().min(12).max(200),
    newPassword: z.string().min(12).max(200),
  }),
  z.object({ type: z.literal('lookup-invitee'), email: z.email() }),
  z.object({
    type: z.literal('create-invitation'),
    projectId: entityIdSchema,
    email: z.email(),
  }),
  z.object({
    type: z.literal('respond-invitation'),
    invitationId: entityIdSchema,
    response: z.enum(['accepted', 'rejected']),
  }),
  z.object({ type: z.literal('cancel-invitation'), invitationId: entityIdSchema }),
  z.object({
    type: z.literal('set-member-blocked'),
    projectId: entityIdSchema,
    userId: entityIdSchema,
    blocked: z.boolean(),
  }),
  z.object({ type: z.literal('create-project'), name: projectNameSchema }),
  z.object({
    type: z.literal('create-test-suite'),
    projectId: entityIdSchema,
    name: testSuiteNameSchema,
  }),
  z.object({
    type: z.literal('update-test-suite'),
    testSuiteId: entityIdSchema,
    baseRevision: z.number().int().positive(),
    name: testSuiteNameSchema,
  }),
  z.object({
    type: z.literal('delete-test-suite'),
    testSuiteId: entityIdSchema,
    baseRevision: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('update-project'),
    projectId: entityIdSchema,
    baseRevision: z.number().int().positive(),
    name: projectNameSchema,
    url: httpUrlSchema.nullable(),
  }),
  z.object({
    type: z.literal('create-environment'),
    projectId: entityIdSchema,
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
    testIdAttribute: testIdAttributeSchema,
  }),
  z.object({
    type: z.literal('update-environment'),
    environmentId: entityIdSchema,
    baseRevision: z.number().int().positive(),
    name: environmentNameSchema,
    baseUrl: httpUrlSchema,
  }),
  z.object({
    type: z.literal('create-test'),
    projectId: entityIdSchema,
    environmentId: entityIdSchema,
    title: testTitleSchema,
  }),
  z.object({ type: z.literal('select-project'), projectId: entityIdSchema }),
  z.object({ type: z.literal('select-test-suite'), testSuiteId: entityIdSchema }),
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
  z.object({ type: z.literal('select-profile'), profileId: entityIdSchema.optional() }),
  z.object({
    type: z.literal('update-profile'),
    profileId: entityIdSchema,
    baseRevision: z.number().int().positive(),
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
  z.object({ type: z.literal('select-test'), testId: entityIdSchema }),
  z.object({ type: z.literal('rename-test'), testId: entityIdSchema, title: testTitleSchema }),
  z.object({ type: z.literal('prepare-new-test'), title: testTitleSchema }),
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
  authLoginInputSchema.extend({ type: z.literal('login-server') }),
  authRegisterInputSchema.extend({ type: z.literal('register-server') }),
  z.object({ type: z.literal('logout-server') }),
  z.object({ type: z.literal('sync-now') }),
  z.object({ type: z.literal('set-record-layout'), layout: recordLayoutSchema }),
  z.object({ type: z.literal('publish-record-state'), state: recordPanelStateSchema }),
]);

export type AppCommand = z.infer<typeof appCommandSchema>;
