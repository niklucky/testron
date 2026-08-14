import { ipcRenderer } from 'electron';

import { rankLocators, type Locator } from '../domain/locators/schema';
import type { RecorderCandidate } from '../domain/recording/schema';
import { RECORDER_CHANNEL, RECORDER_CONFIG_CHANNEL } from '../main/security';

let testIdAttribute = 'data-testid';
let captureMode: 'record' | 'verify' = 'record';
let assertion:
  | 'visible'
  | 'hidden'
  | 'textContains'
  | 'textEquals'
  | 'value'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'unchecked' = 'visible';

ipcRenderer.on(RECORDER_CONFIG_CHANNEL, (_event, payload: unknown) => {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'testIdAttribute' in payload &&
    typeof payload.testIdAttribute === 'string' &&
    payload.testIdAttribute.length > 0
  )
    testIdAttribute = payload.testIdAttribute;
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'captureMode' in payload &&
    (payload.captureMode === 'record' || payload.captureMode === 'verify')
  )
    captureMode = payload.captureMode;
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'assertion' in payload &&
    typeof payload.assertion === 'string'
  )
    assertion = payload.assertion as typeof assertion;
});

const clean = (value: string | null | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 200) : undefined;
};

const cssEscape = (value: string): string => CSS.escape(value);

const associatedLabel = (element: HTMLElement): string | undefined => {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    const labels = [...(element.labels ?? [])].map((label) => label.textContent).join(' ');
    return clean(labels);
  }
  return undefined;
};

const accessibleName = (element: HTMLElement): string | undefined =>
  clean(element.getAttribute('aria-label')) ??
  clean(element.getAttribute('title')) ??
  associatedLabel(element) ??
  clean(element.textContent);

const roleFor = (element: HTMLElement): string | undefined => {
  const explicit = clean(element.getAttribute('role'));
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (element instanceof HTMLInputElement) {
    if (['text', 'email', 'password', 'search', 'tel', 'url'].includes(element.type))
      return 'textbox';
    if (element.type === 'submit' || element.type === 'button') return 'button';
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
  }
  return undefined;
};

const cssFallback = (element: HTMLElement): string => {
  if (element.id) return `#${cssEscape(element.id)}`;
  const segments: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body && segments.length < 4) {
    let segment = current.tagName.toLowerCase();
    const parentElement: HTMLElement | null = current.parentElement;
    if (parentElement) {
      const siblings = [...parentElement.children].filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    segments.unshift(segment);
    current = parentElement;
  }
  return segments.join(' > ');
};

const locatorsFor = (element: HTMLElement): Locator[] => {
  const locators: Locator[] = [];
  const testId = clean(element.getAttribute(testIdAttribute));
  if (testId) locators.push({ strategy: 'testId', attribute: testIdAttribute, value: testId });

  const role = roleFor(element);
  const name = accessibleName(element);
  if (role && name) locators.push({ strategy: 'role', role, name });

  const label = associatedLabel(element);
  if (label) locators.push({ strategy: 'label', text: label });

  const placeholder = clean(element.getAttribute('placeholder'));
  if (placeholder) locators.push({ strategy: 'placeholder', text: placeholder });

  if (!role) {
    const text = clean(element.textContent);
    if (text) locators.push({ strategy: 'text', text });
  }

  locators.push({ strategy: 'css', selector: cssFallback(element), fragile: true });
  return rankLocators(locators);
};

const countMatches = (locator: Locator): number => {
  try {
    switch (locator.strategy) {
      case 'testId':
        return document.querySelectorAll(
          `[${CSS.escape(locator.attribute)}="${CSS.escape(locator.value)}"]`,
        ).length;
      case 'placeholder':
        return [...document.querySelectorAll<HTMLElement>('[placeholder]')].filter(
          (element) => clean(element.getAttribute('placeholder')) === locator.text,
        ).length;
      case 'label':
        return [...document.querySelectorAll('label')].filter(
          (element) => clean(element.textContent) === locator.text,
        ).length;
      case 'role':
        return [...document.querySelectorAll<HTMLElement>('*')].filter(
          (element) =>
            roleFor(element) === locator.role && accessibleName(element) === locator.name,
        ).length;
      case 'text':
        return [...document.querySelectorAll<HTMLElement>('body *')].filter(
          (element) => clean(element.textContent) === locator.text && element.children.length === 0,
        ).length;
      case 'css':
        return document.querySelectorAll(locator.selector).length;
    }
  } catch {
    return 0;
  }
};

const observationFor = (element: HTMLElement) => {
  const locators = locatorsFor(element);
  const primaryMatches = countMatches(locators[0]);
  const warnings = [
    ...(primaryMatches === 0 ? ['Primary locator no longer matches an element.'] : []),
    ...(primaryMatches > 1 ? [`Primary locator is ambiguous (${primaryMatches} matches).`] : []),
    ...(locators[0].strategy === 'css' ? ['Primary locator is a fragile CSS fallback.'] : []),
  ];
  const secretToken = clean(element.getAttribute('name')) ?? element.id ?? 'password';
  return {
    locators,
    fingerprint: JSON.stringify(locators[0]),
    sensitive: element instanceof HTMLInputElement && element.type === 'password',
    secretName: `TESTRON_${
      secretToken
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase() || 'PASSWORD'
    }`,
    warnings,
  };
};

const send = (candidate: RecorderCandidate): void => ipcRenderer.send(RECORDER_CHANNEL, candidate);

window.addEventListener(
  'click',
  (event) => {
    const origin = event.target;
    if (!(origin instanceof HTMLElement)) return;
    const element =
      captureMode === 'verify'
        ? origin.closest<HTMLElement>('body *')
        : origin.closest<HTMLElement>(
            'button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"]',
          );
    if (!element) return;
    if (captureMode === 'verify') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const value =
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : '';
      send({
        kind: 'assertion',
        target: observationFor(element),
        assertion,
        observedText: clean(element.textContent) ?? '',
        observedValue: value,
        url: window.location.href,
      });
      return;
    }
    send({ kind: 'click', target: observationFor(element), url: window.location.href });
  },
  true,
);

window.addEventListener(
  'input',
  (event) => {
    if (captureMode === 'verify') return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const sensitive = element instanceof HTMLInputElement && element.type === 'password';
    send({
      kind: 'input',
      target: observationFor(element),
      value: sensitive ? '' : element.value,
      url: window.location.href,
    });
  },
  true,
);

window.addEventListener(
  'focusout',
  (event) => {
    if (captureMode === 'verify') return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    send({
      kind: 'input-commit',
      fingerprint: observationFor(element).fingerprint,
      url: window.location.href,
    });
  },
  true,
);

window.addEventListener(
  'change',
  (event) => {
    if (captureMode === 'verify') return;
    const element = event.target;
    if (element instanceof HTMLSelectElement) {
      send({
        kind: 'select',
        target: observationFor(element),
        value: element.value,
        url: window.location.href,
      });
      return;
    }
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      send({
        kind: 'check',
        target: observationFor(element),
        checked: element.checked,
        url: window.location.href,
      });
      return;
    }
    if (element instanceof HTMLInputElement && ['radio', 'file'].includes(element.type))
      send({
        kind: 'unsupported',
        interaction: element.type,
        message: `${element.type} recording is not supported yet.`,
        url: window.location.href,
      });
  },
  true,
);

window.addEventListener(
  'keydown',
  (event) => {
    if (captureMode === 'verify') return;
    if (!['Enter', 'Escape', 'Tab'].includes(event.key) || event.repeat) return;
    const element = event.target;
    if (!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLButtonElement
    ))
      return;
    send({
      kind: 'press',
      target: observationFor(element),
      key: event.key,
      url: window.location.href,
    });
  },
  true,
);
