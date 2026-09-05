export const numberComparisons = {
  numberEquals: {
    operator: 'equals',
    label: 'Number =',
    matcher: 'toBe',
  },
  numberGreaterThan: {
    operator: 'greaterThan',
    label: 'Number >',
    matcher: 'toBeGreaterThan',
  },
  numberAtLeast: {
    operator: 'atLeast',
    label: 'Number >=',
    matcher: 'toBeGreaterThanOrEqual',
  },
  numberLessThan: {
    operator: 'lessThan',
    label: 'Number <',
    matcher: 'toBeLessThan',
  },
  numberAtMost: {
    operator: 'atMost',
    label: 'Number <=',
    matcher: 'toBeLessThanOrEqual',
  },
} as const;
export type NumberComparison = keyof typeof numberComparisons;
export const isNumberComparison = (value: string | undefined): value is NumberComparison =>
  value !== undefined && Object.hasOwn(numberComparisons, value);
export const numberMatchers = {
  equals: 'toBe',
  greaterThan: 'toBeGreaterThan',
  atLeast: 'toBeGreaterThanOrEqual',
  lessThan: 'toBeLessThan',
  atMost: 'toBeLessThanOrEqual',
} as const;
export const numberSymbols = {
  equals: '=',
  greaterThan: '>',
  atLeast: '>=',
  lessThan: '<',
  atMost: '<=',
} as const;
export const numericAssertionSource = (
  locator: string,
  operator: keyof typeof numberMatchers,
  expected: number,
): string =>
  `await expect.poll(async () => { const value = Number((await ${locator}.textContent())?.trim() || NaN); return Number.isFinite(value) ? value : NaN; }).${numberMatchers[operator]}(${expected});`;
