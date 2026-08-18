import { ipcRenderer } from 'electron';

import { rankLocators, type Locator } from '@testron/domain/locators/schema';
import type { RecorderCandidate } from '@testron/domain/recording/schema';
import { RECORDER_CHANNEL, RECORDER_CONFIG_CHANNEL } from '../main/security';
import type { VerifyAssertion } from './verify-assertion';

let testIdAttribute = 'data-testid';
let captureMode: 'record' | 'verify' = 'record';
let recordingActive = false;
let repicking = false;
let profileVariables: Array<{ name: string; value: string }> = [];
let assertion: VerifyAssertion = 'visible';

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
    'recording' in payload &&
    typeof payload.recording === 'boolean'
  ) {
    recordingActive = payload.recording;
    if (!recordingActive) hideInspector();
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'repicking' in payload &&
    typeof payload.repicking === 'boolean'
  ) {
    repicking = payload.repicking;
    if (!repicking && !recordingActive) hideInspector();
    else schedulePointerHitTest();
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'assertion' in payload &&
    typeof payload.assertion === 'string'
  )
    assertion = payload.assertion as VerifyAssertion;
  if (typeof payload === 'object' && payload !== null && 'profileVariables' in payload) {
    const variables = payload.profileVariables;
    profileVariables = Array.isArray(variables)
      ? variables.filter(
          (variable): variable is { name: string; value: string } =>
            typeof variable === 'object' &&
            variable !== null &&
            'name' in variable &&
            typeof variable.name === 'string' &&
            'value' in variable &&
            typeof variable.value === 'string',
        )
      : [];
  }
});

const clean = (value: string | null | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 200) : undefined;
};

const cssEscape = (value: string): string => CSS.escape(value);

const INSPECTOR_ATTRIBUTE = 'data-testron-inspector';
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="textbox"]',
].join(', ');
const preferredLocators = new WeakMap<Element, Locator>();
const selectedVariables = new WeakMap<Element, string>();
const automaticallyFilled = new WeakSet<Element>();
let inspectedElement: Element | undefined;
let inspector: HTMLDivElement | undefined;
let lastPointer: { x: number; y: number } | undefined;
let inspectorFrame: number | undefined;

const isInspectorElement = (element: Element): boolean =>
  Boolean(element.closest(`[${INSPECTOR_ATTRIBUTE}]`));

const associatedLabel = (element: Element): string | undefined => {
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

const accessibleName = (element: Element): string | undefined =>
  clean(element.getAttribute('aria-label')) ??
  clean(element.getAttribute('title')) ??
  associatedLabel(element) ??
  clean(element.textContent);

const roleFor = (element: Element): string | undefined => {
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

const cssFallback = (element: Element): string => {
  if (element.id) return `#${cssEscape(element.id)}`;
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && segments.length < 4) {
    let segment = current.tagName.toLowerCase();
    const parentElement: Element | null = current.parentElement;
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

const locatorsFor = (element: Element): Locator[] => {
  const locators: Locator[] = [];
  const testId = clean(element.getAttribute(testIdAttribute));
  if (testId) locators.push({ strategy: 'testId', attribute: testIdAttribute, value: testId });

  const id = clean(element.id);
  if (id) locators.push({ strategy: 'id', value: id });

  const nameAttribute = clean(element.getAttribute('name'));
  if (nameAttribute) locators.push({ strategy: 'name', value: nameAttribute });

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
  const ranked = rankLocators(locators);
  const preferred = preferredLocators.get(element);
  if (!preferred) return ranked;
  return [
    preferred,
    ...ranked.filter((locator) => JSON.stringify(locator) !== JSON.stringify(preferred)),
  ];
};

const countMatches = (locator: Locator): number => {
  try {
    switch (locator.strategy) {
      case 'testId':
        return document.querySelectorAll(
          `[${CSS.escape(locator.attribute)}="${CSS.escape(locator.value)}"]`,
        ).length;
      case 'id':
        return document.querySelectorAll(`[id="${CSS.escape(locator.value)}"]`).length;
      case 'name':
        return document.querySelectorAll(`[name="${CSS.escape(locator.value)}"]`).length;
      case 'placeholder':
        return [...document.querySelectorAll<Element>('[placeholder]')].filter(
          (element) => clean(element.getAttribute('placeholder')) === locator.text,
        ).length;
      case 'label':
        return [...document.querySelectorAll('label')].filter(
          (element) => clean(element.textContent) === locator.text,
        ).length;
      case 'role':
        return [...document.querySelectorAll<Element>('*')].filter(
          (element) =>
            roleFor(element) === locator.role && accessibleName(element) === locator.name,
        ).length;
      case 'text':
        return [...document.querySelectorAll<Element>('body *')].filter(
          (element) => clean(element.textContent) === locator.text && element.children.length === 0,
        ).length;
      case 'css':
        return document.querySelectorAll(locator.selector).length;
    }
  } catch {
    return 0;
  }
};

const observationFor = (element: Element) => {
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
    ...(selectedVariables.get(element) ? { variableName: selectedVariables.get(element) } : {}),
    warnings,
  };
};

const collectionElementFor = (element: Element): Element | undefined =>
  element.closest('tbody > tr') ?? element.closest('[role="row"]') ?? undefined;

const collectionLocatorFor = (element: Element): Locator | undefined => {
  const row = element.closest('tbody > tr');
  if (row?.parentElement)
    return {
      strategy: 'css',
      selector: `${cssFallback(row.parentElement)} > tr`,
      fragile: true,
    };

  const ariaRow = element.closest('[role="row"]');
  if (ariaRow) {
    const group = ariaRow.closest('[role="rowgroup"]');
    return {
      strategy: 'css',
      selector: group ? `${cssFallback(group)} > [role="row"]` : '[role="row"]',
      fragile: true,
    };
  }
  return undefined;
};

const observationForCount = (element: Element) => {
  const row = collectionElementFor(element) ?? element;
  const collection = collectionLocatorFor(row);
  if (!collection) return observationFor(row);
  return {
    locators: [collection],
    fingerprint: JSON.stringify(collection),
    sensitive: false,
    warnings: [],
  };
};

const send = (candidate: RecorderCandidate): void => ipcRenderer.send(RECORDER_CHANNEL, candidate);
const sendControl = (control: unknown): void => ipcRenderer.send(RECORDER_CHANNEL, control);

const assertionOptions: Array<{ value: VerifyAssertion; label: string }> = [
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'textContains', label: 'Text contains' },
  { value: 'textEquals', label: 'Text equals' },
  { value: 'value', label: 'Input value' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'checked', label: 'Checked' },
  { value: 'unchecked', label: 'Unchecked' },
  { value: 'countExactly', label: 'Count exactly' },
  { value: 'countAtLeast', label: 'Count at least' },
];

const inspectorChoices = (element: Element): Array<{ label: string; locator: Locator }> => {
  const choices: Array<{ label: string; locator: Locator }> = [];
  const testId = clean(element.getAttribute(testIdAttribute));
  if (testId)
    choices.push({
      label: `${testIdAttribute}=${testId}`,
      locator: { strategy: 'testId', attribute: testIdAttribute, value: testId },
    });
  const id = clean(element.id);
  if (id) choices.push({ label: `id=${id}`, locator: { strategy: 'id', value: id } });
  const name = clean(element.getAttribute('name'));
  if (name) choices.push({ label: `name=${name}`, locator: { strategy: 'name', value: name } });
  return choices;
};

const variableCandidates = (element: Element): string[] => {
  const autocomplete = clean(element.getAttribute('autocomplete'));
  const names = [
    clean(element.getAttribute(testIdAttribute)),
    clean(element.getAttribute('name')),
    clean(element.id),
    autocomplete === 'current-password' || autocomplete === 'new-password'
      ? 'password'
      : autocomplete === 'username'
        ? 'username'
        : undefined,
  ].filter((name): name is string => Boolean(name));
  return [...new Set(names)];
};

const exactVariableFor = (element: Element): { name: string; value: string } | undefined => {
  for (const candidate of variableCandidates(element)) {
    const matches = profileVariables.filter((variable) => variable.name === candidate);
    if (matches.length === 1) return matches[0];
  }
  return undefined;
};

const fillFromVariable = (
  element: HTMLInputElement | HTMLTextAreaElement,
  variable: { name: string; value: string },
  commit: boolean,
): void => {
  selectedVariables.set(element, variable.name);
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, variable.value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  if (commit)
    send({
      kind: 'input-commit',
      fingerprint: observationFor(element).fingerprint,
      url: window.location.href,
    });
};

const hideInspector = (): void => {
  if (inspectorFrame !== undefined) cancelAnimationFrame(inspectorFrame);
  inspectorFrame = undefined;
  inspectedElement = undefined;
  inspector?.remove();
  inspector = undefined;
};

const renderInspector = (): void => {
  const element = inspectedElement;
  if ((!recordingActive && !repicking) || !element?.isConnected) {
    hideInspector();
    return;
  }

  inspector?.remove();
  const root = document.createElement('div');
  root.setAttribute(INSPECTOR_ATTRIBUTE, '');
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:12px/16px ui-monospace,SFMono-Regular,Menlo,monospace;color:#f7faf9';

  const rect = element.getBoundingClientRect();
  const outline = document.createElement('div');
  outline.style.cssText = `position:fixed;left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;border:2px solid #3987e5;border-radius:3px;box-sizing:border-box;background:rgb(57 135 229 / 8%);pointer-events:none`;
  root.append(outline);

  const picker = document.createElement('div');
  picker.style.cssText = `position:fixed;left:${Math.max(4, Math.min(window.innerWidth - 260, Math.round(rect.left)))}px;top:${Math.max(4, Math.round(rect.top) - 30)}px;display:flex;max-width:calc(100vw - 8px);gap:4px;align-items:center;padding:4px;border:1px solid rgb(255 255 255 / 18%);border-radius:5px;background:#14181b;box-shadow:0 4px 16px rgb(0 0 0 / 35%);pointer-events:auto`;
  picker.setAttribute('aria-label', 'Choose locator');

  const tag = document.createElement('span');
  tag.textContent = element.tagName.toLowerCase();
  tag.style.cssText = 'padding:1px 4px;color:#9aa4a0';
  picker.append(tag);

  if (repicking) {
    const mode = document.createElement('span');
    mode.textContent = 'Repick element';
    mode.style.cssText =
      'padding:2px 6px;border-radius:4px;background:#69511b;color:#ffe19a;font-family:system-ui,sans-serif;font-weight:600';
    picker.append(mode);
  } else if (captureMode === 'verify') {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Assertion near selected element');
    select.style.cssText =
      'height:24px;max-width:150px;padding:1px 22px 1px 6px;border:1px solid #3987e5;border-radius:4px;background:#1a1f23;color:#e3e8e6;cursor:pointer;font:12px system-ui,sans-serif';
    for (const option of assertionOptions) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      item.selected = option.value === assertion;
      select.append(item);
    }
    select.addEventListener(
      'pointerdown',
      (event) => {
        event.stopImmediatePropagation();
      },
      true,
    );
    select.addEventListener('change', () => {
      assertion = select.value as VerifyAssertion;
      sendControl({ kind: 'set-assertion', assertion });
      inspectedElement =
        assertion === 'countExactly' || assertion === 'countAtLeast'
          ? (collectionElementFor(element) ?? element)
          : element;
      renderInspector();
    });
    picker.append(select);
  }

  if (assertion === 'countExactly' || assertion === 'countAtLeast') {
    const target = observationForCount(element);
    const matches = countMatches(target.locators[0]);
    const count = document.createElement('span');
    count.textContent = `${matches} match${matches === 1 ? '' : 'es'}`;
    count.style.cssText = 'padding:1px 4px;color:#8fc5ff';
    picker.append(count);
  }

  const chosen = preferredLocators.get(element);
  for (const choice of inspectorChoices(element)) {
    const button = document.createElement('button');
    const selected = JSON.stringify(chosen) === JSON.stringify(choice.locator);
    button.type = 'button';
    button.textContent = `${selected ? '✓ ' : ''}${choice.label}`;
    button.style.cssText = `min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border:1px solid ${selected ? '#3987e5' : '#394147'};border-radius:4px;background:${selected ? 'rgb(57 135 229 / 22%)' : '#1a1f23'};color:#e3e8e6;cursor:pointer;font:inherit`;
    const blockPageInteraction = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    button.addEventListener('pointerdown', blockPageInteraction, true);
    button.addEventListener(
      'click',
      (event) => {
        blockPageInteraction(event);
        preferredLocators.set(element, choice.locator);
        renderInspector();
      },
      true,
    );
    picker.append(button);
  }

  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    profileVariables.length > 0
  ) {
    const divider = document.createElement('span');
    divider.textContent = '·';
    divider.style.cssText = 'padding:0 2px;color:#68727a';
    picker.append(divider);
    for (const variable of profileVariables) {
      const button = document.createElement('button');
      const selected = selectedVariables.get(element) === variable.name;
      button.type = 'button';
      button.textContent = `${selected ? '✓ ' : ''}{{${variable.name}}}`;
      button.title = `Fill with profile variable ${variable.name}`;
      button.style.cssText = `padding:2px 6px;border:1px solid ${selected ? '#3987e5' : '#394147'};border-radius:4px;background:${selected ? 'rgb(57 135 229 / 22%)' : '#1a1f23'};color:#e3e8e6;cursor:pointer;font:inherit`;
      const block = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      button.addEventListener('pointerdown', block, true);
      button.addEventListener(
        'click',
        (event) => {
          block(event);
          fillFromVariable(element, variable, true);
          renderInspector();
          element.focus();
        },
        true,
      );
      picker.append(button);
    }
  }

  root.append(picker);
  document.documentElement.append(root);
  inspector = root;
};

const isPageShell = (element: Element): boolean => {
  if (element === document.documentElement || element === document.body) return true;
  if (element.id !== 'root') return false;
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height >= window.innerWidth * window.innerHeight * 0.8;
};

const inspect = (origin: Element, reposition = false): void => {
  if ((!recordingActive && !repicking) || isInspectorElement(origin)) return;
  // Promote icon/span children to the control they belong to, but keep every
  // other element exact. Attribute-bearing ancestors such as React's #root
  // must never swallow the card, chart, SVG node, or text actually under the
  // pointer.
  const element =
    assertion === 'countExactly' || assertion === 'countAtLeast'
      ? (collectionElementFor(origin) ?? origin)
      : (origin.closest(INTERACTIVE_SELECTOR) ?? origin);
  if (isPageShell(element)) {
    hideInspector();
    return;
  }
  if (element === inspectedElement) {
    if (reposition) renderInspector();
    return;
  }
  inspectedElement = element;
  renderInspector();
};

const inspectAtLastPointer = (): void => {
  inspectorFrame = undefined;
  if (!lastPointer || (!recordingActive && !repicking)) return;
  const origin = document.elementFromPoint(lastPointer.x, lastPointer.y);
  if (origin && !isInspectorElement(origin)) inspect(origin, true);
  else renderInspector();
};

const schedulePointerHitTest = (): void => {
  if (inspectorFrame !== undefined) cancelAnimationFrame(inspectorFrame);
  inspectorFrame = requestAnimationFrame(inspectAtLastPointer);
};

window.addEventListener(
  'pointermove',
  (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    const origin = event.target;
    if (origin instanceof Element) inspect(origin);
  },
  true,
);
window.addEventListener('scroll', schedulePointerHitTest, true);
window.addEventListener('resize', schedulePointerHitTest);
window.addEventListener(
  'pointerout',
  (event) => {
    if (event.relatedTarget === null) hideInspector();
  },
  true,
);
window.addEventListener('blur', hideInspector);

window.addEventListener(
  'click',
  (event) => {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    if (isInspectorElement(origin)) return;
    if (repicking) {
      const element = origin.closest(INTERACTIVE_SELECTOR) ?? origin;
      if (isPageShell(element)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sendControl({ kind: 'repick-target', target: observationFor(element) });
      return;
    }
    const element =
      captureMode === 'verify'
        ? origin.closest('body *')
        : origin.closest(
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
      const target =
        assertion === 'countExactly' || assertion === 'countAtLeast'
          ? observationForCount(element)
          : observationFor(element);
      send({
        kind: 'assertion',
        target,
        assertion,
        observedText: clean(element.textContent) ?? '',
        observedValue: value,
        observedCount: countMatches(target.locators[0]),
        url: window.location.href,
      });
      return;
    }
    send({ kind: 'click', target: observationFor(element), url: window.location.href });
  },
  true,
);

window.addEventListener(
  'focusin',
  (event) => {
    if (!recordingActive || captureMode === 'verify') return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (automaticallyFilled.has(element) || selectedVariables.has(element)) return;
    automaticallyFilled.add(element);
    const variable = exactVariableFor(element);
    if (variable) fillFromVariable(element, variable, false);
    else inspect(element);
  },
  true,
);

window.addEventListener(
  'input',
  (event) => {
    if (captureMode === 'verify') return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (event.isTrusted && selectedVariables.has(element)) selectedVariables.delete(element);
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
