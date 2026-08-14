import { z } from 'zod';

import { targetSchema } from '../locators/schema';

const metadataSchema = z.object({ recordedAt: z.iso.datetime() });

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
    kind: z.literal('fill'),
    target: targetSchema,
    value: z.string(),
    metadata: metadataSchema,
  }),
]);

export const stepsSchema = z.array(stepSchema);
export type Step = z.infer<typeof stepSchema>;
