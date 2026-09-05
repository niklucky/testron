import { z } from 'zod';

import { targetSchema } from '../locators/schema';

const metadataSchema = z.object({ recordedAt: z.iso.datetime() });

export const elementAssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['visible', 'hidden', 'enabled', 'disabled', 'checked', 'unchecked']) }),
  z.object({
    type: z.literal('count'),
    operator: z.enum(['equals', 'atLeast']),
    expected: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('text'),
    match: z.enum(['contains', 'equals']),
    expected: z.string(),
  }),
  z.object({ type: z.literal('value'), expected: z.string() }),
  z.object({ type: z.literal('attribute'), name: z.string().min(1), expected: z.string() }),
  z.object({ type: z.literal('class'), expected: z.string() }),
]);

export type ElementAssertion = z.infer<typeof elementAssertionSchema>;

export const stepSchema = z.discriminatedUnion('kind', [
  z.object({
    version: z.literal(1),
    kind: z.literal('navigate'),
    url: z.url(),
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('click'),
    target: targetSchema,
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('hover'),
    target: targetSchema,
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('fill'),
    target: targetSchema,
    value: z.string(),
    variable: z.object({ name: z.string().trim().min(1).max(100) }).optional(),
    secret: z.object({ environmentVariable: z.string().regex(/^[A-Z][A-Z0-9_]*$/) }).optional(),
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('selectOption'),
    target: targetSchema,
    value: z.string(),
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.enum(['check', 'uncheck']),
    target: targetSchema,
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('press'),
    target: targetSchema,
    key: z.string().min(1),
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('assertElement'),
    target: targetSchema,
    assertion: elementAssertionSchema,
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('assertUrlPath'),
    expected: z.string().startsWith('/'),
    metadata: metadataSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal('code'),
    code: z.string().min(1).max(2_000_000),
    reason: z.string().min(1),
    metadata: metadataSchema,
  }),
]);

export const stepsSchema = z.array(stepSchema);
export type Step = z.infer<typeof stepSchema>;

export const redactStepSecrets = (step: Step): Step =>
  step.kind === 'fill' && (step.secret || step.variable) && step.value !== ''
    ? { ...step, value: '' }
    : step;
