import type { Locator, Target } from '@testron/domain/locators/schema';

import { presentLocator } from './live';

const unescapeQuoted = (value: string): string =>
  value
    .replace(/\\(['"\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');

const shorthandLocator = (input: string): Locator | undefined => {
  const separator = input.indexOf('=');
  if (separator < 1) return undefined;
  const strategy = input.slice(0, separator).trim();
  const value = input.slice(separator + 1).trim();
  if (!value) return undefined;
  switch (strategy) {
    case 'testId':
      return { strategy: 'testId', attribute: 'data-testid', value };
    case 'id':
    case 'name':
      return { strategy, value };
    case 'label':
    case 'placeholder':
    case 'text':
      return { strategy, text: value };
    case 'css':
      return { strategy: 'css', selector: value, fragile: true };
  }
};

/** Accept the Playwright-style locators shown in the UI, concise shorthands, or raw CSS. */
export const parseLocatorInput = (input: string): Locator | undefined => {
  const value = input.trim();
  if (!value) return undefined;

  const shorthand = shorthandLocator(value);
  if (shorthand) return shorthand;

  const simpleCall = value.match(
    /^getBy(TestId|Label|Placeholder|Text)\((['"])((?:\\.|.)*?)\2(?:,\s*\{\s*exact:\s*true\s*\})?\)$/,
  );
  if (simpleCall) {
    const text = unescapeQuoted(simpleCall[3]);
    switch (simpleCall[1]) {
      case 'TestId':
        return { strategy: 'testId', attribute: 'data-testid', value: text };
      case 'Label':
        return { strategy: 'label', text };
      case 'Placeholder':
        return { strategy: 'placeholder', text };
      case 'Text':
        return { strategy: 'text', text };
    }
  }

  const roleCall = value.match(
    /^getByRole\((['"])((?:\\.|.)*?)\1,\s*\{\s*name:\s*(['"])((?:\\.|.)*?)\3\s*\}\)$/,
  );
  if (roleCall)
    return {
      strategy: 'role',
      role: unescapeQuoted(roleCall[2]),
      name: unescapeQuoted(roleCall[4]),
    };

  const locatorCall = value.match(/^locator\((['"])((?:\\.|.)*)\1\)$/);
  const selector = locatorCall ? unescapeQuoted(locatorCall[2]) : value;
  const attribute = selector.match(/^\[(data-testid|id|name)=['"](.+)['"]\]$/);
  if (attribute) {
    if (attribute[1] === 'data-testid')
      return { strategy: 'testId', attribute: 'data-testid', value: attribute[2] };
    return { strategy: attribute[1] as 'id' | 'name', value: attribute[2] };
  }
  return { strategy: 'css', selector, fragile: true };
};

/** Promote a chosen or manually entered locator while retaining the old choices as fallbacks. */
export const replacePrimaryLocator = (target: Target, input: string): Target | undefined => {
  const candidates = [target.primary, ...target.alternatives];
  const primary =
    candidates.find((candidate) => presentLocator(candidate) === input.trim()) ??
    parseLocatorInput(input);
  if (!primary) return undefined;
  const key = JSON.stringify(primary);
  return {
    ...target,
    primary,
    alternatives: candidates.filter((candidate) => JSON.stringify(candidate) !== key),
  };
};
