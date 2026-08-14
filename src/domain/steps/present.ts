import type { Locator } from '../locators/schema';
import type { Step } from './schema';

const locatorName = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return `[${locator.attribute}="${locator.value}"]`;
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
      return `Fill ${locatorName(step.target.primary)} with “${step.value}”`;
  }
};
