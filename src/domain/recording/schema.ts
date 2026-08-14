import { z } from 'zod';

import { locatorSchema } from '../locators/schema';

const targetObservationSchema = z.object({
  locators: z.array(locatorSchema).min(1),
  fingerprint: z.string().min(1),
  sensitive: z.boolean().default(false),
});

export const recorderCandidateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), target: targetObservationSchema, url: z.url() }),
  z.object({
    kind: z.literal('select'),
    target: targetObservationSchema,
    value: z.string(),
    url: z.url(),
  }),
  z.object({
    kind: z.literal('check'),
    target: targetObservationSchema,
    checked: z.boolean(),
    url: z.url(),
  }),
  z.object({
    kind: z.literal('press'),
    target: targetObservationSchema,
    key: z.string().min(1),
    url: z.url(),
  }),
  z.object({
    kind: z.literal('input'),
    target: targetObservationSchema,
    value: z.string(),
    url: z.url(),
  }),
  z.object({
    kind: z.literal('input-commit'),
    fingerprint: z.string().min(1),
    url: z.url(),
  }),
  z.object({
    kind: z.literal('unsupported'),
    interaction: z.string().min(1),
    message: z.string().min(1),
    url: z.url(),
  }),
]);

export type RecorderCandidate = z.infer<typeof recorderCandidateSchema>;
export type ActionCandidate = Exclude<RecorderCandidate, { kind: 'unsupported' }>;
