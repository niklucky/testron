import type { Locator } from '../locators/schema';
import type { Step } from './schema';

const locatorName = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return `[${locator.attribute}="${locator.value}"]`;
    case 'id':
      return `[id="${locator.value}"]`;
    case 'name':
      return `[name="${locator.value}"]`;
    case 'role':
      return `${locator.role} “${locator.name}”`;
    case 'label':
      return `field labeled “${locator.text}”`;
    case 'placeholder':
      return `field with placeholder “${locator.text}”`;
    case 'text':
      return `text “${locator.text}”`;
    case 'css':
      return `${locator.selector} (fragile)`;
  }
};

export const presentStep = (step: Step): string => {
  switch (step.kind) {
    case 'navigate':
      return `Navigate to ${step.url}`;
    case 'click':
      return `Click ${locatorName(step.target.primary)}`;
    case 'fill':
      return step.variable
        ? `Fill ${locatorName(step.target.primary)} with {{${step.variable.name}}}`
        : step.secret
          ? `Fill ${locatorName(step.target.primary)} with secret $${step.secret.environmentVariable}`
          : `Fill ${locatorName(step.target.primary)} with “${step.value}”`;
    case 'selectOption':
      return `Select “${step.value}” in ${locatorName(step.target.primary)}`;
    case 'check':
      return `Check ${locatorName(step.target.primary)}`;
    case 'uncheck':
      return `Uncheck ${locatorName(step.target.primary)}`;
    case 'press':
      return `Press ${step.key} in ${locatorName(step.target.primary)}`;
    case 'assertElement': {
      const target = locatorName(step.target.primary);
      switch (step.assertion.type) {
        case 'text':
          return `Verify ${target} text ${step.assertion.match} “${step.assertion.expected}”`;
        case 'value':
          return `Verify ${target} has value “${step.assertion.expected}”`;
        case 'count':
          return `Verify ${target} has ${step.assertion.operator === 'equals' ? 'exactly' : 'at least'} ${step.assertion.expected} matches`;
        default:
          return `Verify ${target} is ${step.assertion.type}`;
      }
    }
    case 'assertUrlPath':
      return `Verify URL path equals “${step.expected}”`;
  }
};
