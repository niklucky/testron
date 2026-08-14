import { ipcRenderer } from 'electron';

import type { Locator } from '../domain/locators/schema';
import type { RecorderCandidate } from '../domain/recording/schema';
import { RECORDER_CHANNEL } from '../main/security';

const clean = (value: string | null | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 200) : undefined;
};

const cssEscape = (value: string): string => CSS.escape(value);

const associatedLabel = (element: HTMLElement): string | undefined => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
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
  const testId = clean(element.getAttribute('data-testid'));
  if (testId) locators.push({ strategy: 'testId', attribute: 'data-testid', value: testId });

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
  return locators;
};

const observationFor = (element: HTMLElement) => {
  const locators = locatorsFor(element);
  return {
    locators,
    fingerprint: JSON.stringify(locators[0]),
    sensitive: element instanceof HTMLInputElement && element.type === 'password',
  };
};

const send = (candidate: RecorderCandidate): void => ipcRenderer.send(RECORDER_CHANNEL, candidate);

window.addEventListener(
  'click',
  (event) => {
    const origin = event.target;
    if (!(origin instanceof HTMLElement)) return;
    const element = origin.closest<HTMLElement>(
      'button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"]',
    );
    if (!element) return;
    send({ kind: 'click', target: observationFor(element), url: window.location.href });
  },
  true,
);

window.addEventListener(
  'input',
  (event) => {
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
    const element = event.target;
    const interaction =
      element instanceof HTMLSelectElement
        ? 'select option'
        : element instanceof HTMLInputElement &&
            ['checkbox', 'radio', 'file'].includes(element.type)
          ? element.type
          : undefined;
    if (!interaction) return;
    send({
      kind: 'unsupported',
      interaction,
      message: `${interaction} recording is not supported in Phase 0.`,
      url: window.location.href,
    });
  },
  true,
);
