import { z } from 'zod';

export const locatorSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('testId'),
    attribute: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({ strategy: z.literal('role'), role: z.string().min(1), name: z.string().min(1) }),
  z.object({ strategy: z.literal('label'), text: z.string().min(1) }),
  z.object({ strategy: z.literal('placeholder'), text: z.string().min(1) }),
  z.object({ strategy: z.literal('text'), text: z.string().min(1) }),
  z.object({ strategy: z.literal('css'), selector: z.string().min(1), fragile: z.literal(true) }),
]);

export type Locator = z.infer<typeof locatorSchema>;

export const targetSchema = z.object({
  primary: locatorSchema,
  alternatives: z.array(locatorSchema).default([]),
});

export type Target = z.infer<typeof targetSchema>;
