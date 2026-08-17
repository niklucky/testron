import { z } from 'zod';

export const locatorSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('testId'),
    attribute: z.string().min(1),
    value: z.string().min(1),
  }),
  z.object({ strategy: z.literal('id'), value: z.string().min(1) }),
  z.object({ strategy: z.literal('name'), value: z.string().min(1) }),
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
  warnings: z.array(z.string().min(1)).optional(),
});

export type Target = z.infer<typeof targetSchema>;

const strategyRank: Record<Locator['strategy'], number> = {
  testId: 0,
  id: 1,
  name: 2,
  role: 3,
  label: 4,
  placeholder: 5,
  text: 6,
  css: 7,
};

/** Stable, shared ordering used by the recorder and step editor. */
export const rankLocators = (locators: readonly Locator[]): Locator[] => {
  const seen = new Set<string>();
  return locators
    .map((locator, index) => ({ locator, index, key: JSON.stringify(locator) }))
    .filter(({ key }) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        strategyRank[left.locator.strategy] - strategyRank[right.locator.strategy] ||
        left.index - right.index,
    )
    .map(({ locator }) => locator);
};
