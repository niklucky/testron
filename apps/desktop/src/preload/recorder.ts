import { ipcRenderer } from 'electron';

import { rankLocators, type Locator } from '@testron/domain/locators/schema';
import type { RecorderCandidate } from '@testron/domain/recording/schema';
import {
  RECORDER_CHANNEL,
  RECORDER_CONFIG_CHANNEL,
  RECORDER_STORAGE_CHANNEL,
} from '../main/security';
import { INSPECTOR_MARGIN, inspectorPosition } from './inspector-position';
import type { VerifyAssertion } from './verify-assertion';

// This must be synchronous: application scripts can inspect authentication and
// redirect before an asynchronous IPC response or dom-ready callback arrives.
if (window === window.top && ['http:', 'https:'].includes(location.protocol)) {
  const state = ipcRenderer.sendSync(RECORDER_STORAGE_CHANNEL) as {
    remove: string[];
    entries: Array<{ name: string; value: string }>;
  } | null;
  if (state) {
    for (const name of state.remove) localStorage.removeItem(name);
    for (const { name, value } of state.entries) localStorage.setItem(name, value);
  }
}

let testIdAttribute = 'data-testid';
let captureMode: 'record' | 'hover' | 'verify' = 'record';
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
    (payload.captureMode === 'record' ||
      payload.captureMode === 'hover' ||
      payload.captureMode === 'verify')
  ) {
    if (captureMode !== payload.captureMode) {
      captureMode = payload.captureMode;
      hideInspector();
      locatorPicking = false;
      schedulePointerHitTest();
    }
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'recording' in payload &&
    typeof payload.recording === 'boolean'
  ) {
    recordingActive = payload.recording;
    if (!recordingActive) {
      hideInspector();
      locatorPicking = false;
    }
  }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'repicking' in payload &&
    typeof payload.repicking === 'boolean'
  ) {
    if (repicking !== payload.repicking) hideInspector();
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

const exact = (value: string | null | undefined): string | undefined => {
  return value === null || value === undefined || value.trim() === '' ? undefined : value;
};

const assertionAttributeFor = (element: Element): { name: string; value: string } | undefined => {
  const testId = exact(element.getAttribute(testIdAttribute));
  if (testId !== undefined) return { name: testIdAttribute, value: testId };

  for (const name of ['aria-label', 'name', 'id', 'role', 'type', 'title']) {
    const value = exact(element.getAttribute(name));
    if (value !== undefined) return { name, value };
  }

  const firstAttribute = Array.from(element.attributes).find(
    (attribute) => exact(attribute.value) !== undefined,
  );
  return firstAttribute
    ? { name: firstAttribute.name, value: exact(firstAttribute.value) ?? '' }
    : undefined;
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
const selectedTargets = new WeakMap<Element, Element>();
const selectedVariables = new WeakMap<Element, string>();
const automaticallyFilled = new WeakSet<Element>();
let inspectedElement: Element | undefined;
let pinnedElement: Element | undefined;
let pendingChoice: InspectorChoice | undefined;
let pickerPosition: { left: number; top: number } | undefined;
let locatorPicking = false;
let inspector: HTMLDivElement | undefined;
let lastPointer: { x: number; y: number } | undefined;
let inspectorFrame: number | undefined;
let inspectorSearchOpen = false;
let inspectorSearchQuery = '';
let inspectorSearchSnapshot: Array<{ element: Element; searchText: string }> | undefined;

const isSelecting = (): boolean =>
  repicking || (recordingActive && (captureMode !== 'record' || locatorPicking));

const isInspectorElement = (element: Element): boolean =>
  Boolean(element.closest(`[${INSPECTOR_ATTRIBUTE}]`));

const blockPageInteraction = (event: Event): void => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

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
  return {
    locators,
    fingerprint: JSON.stringify(locators[0]),
    sensitive: element instanceof HTMLInputElement && element.type === 'password',
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

const captureAssertion = (element: Element): void => {
  const value =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : '';
  const target =
    assertion === 'countExactly' || assertion === 'countAtLeast'
      ? observationForCount(element)
      : observationFor(element);
  const observedAttribute = assertionAttributeFor(element);
  if (assertion === 'attribute' && !observedAttribute) return;
  send({
    kind: 'assertion',
    target,
    assertion,
    observedText: clean(element.textContent) ?? '',
    observedValue: value,
    observedAttributeName: observedAttribute?.name,
    observedAttributeValue: observedAttribute?.value,
    observedClass: exact(element.getAttribute('class')) ?? '',
    observedCount: countMatches(target.locators[0]),
    url: window.location.href,
  });
};

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
  { value: 'attribute', label: 'Attribute' },
  { value: 'class', label: 'Class' },
];

type InspectorChoice = { element: Element; label: string; locator: Locator };
type InspectorTreeNode = {
  element: Element;
  depth: number;
  relation: 'parent' | 'current' | 'child';
};

const directInspectorChoices = (element: Element): InspectorChoice[] => {
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
  return choices.map((choice) => ({ ...choice, element }));
};

const locatorLabel = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return `${locator.attribute}=${locator.value}`;
    case 'id':
      return `id=${locator.value}`;
    case 'name':
      return `name=${locator.value}`;
    case 'role':
      return `role=${locator.role} · ${locator.name}`;
    case 'label':
      return `label=${locator.text}`;
    case 'placeholder':
      return `placeholder=${locator.text}`;
    case 'text':
      return `text=${locator.text}`;
    case 'css':
      return `css=${locator.selector}`;
  }
};

const choicesForTreeNode = (element: Element): InspectorChoice[] => {
  const direct = directInspectorChoices(element);
  if (direct.length > 0) return direct;
  const locator = locatorsFor(element)[0];
  return [{ element, label: locatorLabel(locator), locator }];
};

const elementLabel = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const id = clean(element.id);
  const testId = clean(element.getAttribute(testIdAttribute));
  const name = clean(element.getAttribute('name'));
  if (id) return `<${tag}#${id}>`;
  if (testId) return `<${tag} ${testIdAttribute}="${testId}">`;
  if (name) return `<${tag} name="${name}">`;
  return `<${tag}>`;
};

/** Show one parent, the current node, and its direct children as a compact DOM tree. */
const inspectorTreeNodes = (element: Element): InspectorTreeNode[] => {
  const parent = element.parentElement;
  const hasUsefulParent = parent && parent !== document.body && parent !== document.documentElement;
  const currentDepth = hasUsefulParent ? 1 : 0;
  return [
    ...(hasUsefulParent ? [{ element: parent, depth: 0, relation: 'parent' as const }] : []),
    { element, depth: currentDepth, relation: 'current' as const },
    ...[...element.children].map((child) => ({
      element: child,
      depth: currentDepth + 1,
      relation: 'child' as const,
    })),
  ];
};

/** Search only selectors that authors deliberately placed on the page. */
const pageInspectorChoices = (): InspectorChoice[] =>
  [...document.querySelectorAll<Element>('*')]
    .filter(
      (element) =>
        element !== document.body &&
        element !== document.documentElement &&
        !isInspectorElement(element),
    )
    .flatMap(directInspectorChoices);

/** Snapshot light-DOM search text once per tab opening, not per keystroke/render. */
const pageInspectorSearchSnapshot = (): Array<{ element: Element; searchText: string }> => {
  const labels = new Map<Element, string[]>();
  for (const choice of pageInspectorChoices()) {
    const entries = labels.get(choice.element) ?? [];
    entries.push(choice.label);
    labels.set(choice.element, entries);
  }
  return [...labels].map(([element, choices]) => ({
    element,
    searchText:
      `${elementLabel(element)} ${choices.join(' ')} ${accessibleName(element) ?? ''}`.toLowerCase(),
  }));
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
  pinnedElement = undefined;
  pendingChoice = undefined;
  pickerPosition = undefined;
  inspectorSearchOpen = false;
  inspectorSearchQuery = '';
  inspectorSearchSnapshot = undefined;
  inspector?.remove();
  inspector = undefined;
};

const cancelSelection = (): void => {
  hideInspector();
  locatorPicking = false;
  repicking = false;
  captureMode = 'record';
  sendControl({ kind: 'selector-cancelled' });
};

const positionRenderedInspector = (
  root: HTMLDivElement,
  picker: HTMLDivElement,
  element: Element,
): void => {
  const rect = element.getBoundingClientRect();
  const outline = root.querySelector<HTMLElement>('[data-testron-outline]');
  if (outline) {
    outline.style.left = `${Math.round(rect.left)}px`;
    outline.style.top = `${Math.round(rect.top)}px`;
    outline.style.width = `${Math.round(rect.width)}px`;
    outline.style.height = `${Math.round(rect.height)}px`;
  }
  const pickerRect = picker.getBoundingClientRect();
  const initialPosition =
    pickerPosition ??
    inspectorPosition(
      lastPointer ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      pickerRect,
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    );
  // Pin the panel itself, not merely its target. Only clamp it when its size or
  // the viewport changes; pointer movement must never make controls move away.
  const position = {
    left: Math.max(
      INSPECTOR_MARGIN,
      Math.min(initialPosition.left, window.innerWidth - pickerRect.width - INSPECTOR_MARGIN),
    ),
    top: Math.max(
      INSPECTOR_MARGIN,
      Math.min(initialPosition.top, window.innerHeight - pickerRect.height - INSPECTOR_MARGIN),
    ),
  };
  if (pinnedElement) pickerPosition = position;
  picker.style.left = `${position.left}px`;
  picker.style.top = `${position.top}px`;
};

/** Preserve the pinned controls, focus, and selection across scroll and resize. */
const repositionPinnedInspector = (): boolean => {
  const origin = inspectedElement;
  const root = inspector;
  const picker = root?.querySelector<HTMLDivElement>('[aria-label="Choose locator"]');
  if (!pinnedElement || !origin?.isConnected || !root || !picker) return false;
  const element = pendingChoice?.element ?? selectedTargets.get(origin) ?? origin;
  if (!element.isConnected) {
    hideInspector();
    return true;
  }
  positionRenderedInspector(root, picker, element);
  return true;
};

const renderInspector = (): void => {
  const origin = inspectedElement;
  if (!isSelecting() || !origin?.isConnected) {
    hideInspector();
    return;
  }
  const element = pendingChoice?.element ?? selectedTargets.get(origin) ?? origin;

  const restoreFocus = inspector?.contains(document.activeElement);
  const previousSearch = inspector?.querySelector<HTMLInputElement>(
    '[aria-label="Search page selectors"]',
  );
  const searchSelection = previousSearch
    ? {
        start: previousSearch.selectionStart,
        end: previousSearch.selectionEnd,
        direction: previousSearch.selectionDirection,
      }
    : undefined;
  inspector?.remove();
  const root = document.createElement('div');
  root.setAttribute(INSPECTOR_ATTRIBUTE, '');
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:12px/16px ui-monospace,SFMono-Regular,Menlo,monospace;color:#f7faf9';

  const rect = element.getBoundingClientRect();
  const outline = document.createElement('div');
  outline.setAttribute('data-testron-outline', '');
  outline.style.cssText = `position:fixed;left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px;border:2px solid #3987e5;border-radius:3px;box-sizing:border-box;background:rgb(57 135 229 / 8%);pointer-events:none`;
  root.append(outline);

  // Targeting is non-interactive; a page click opens the stationary editor.
  if (!pinnedElement) {
    const hint = document.createElement('div');
    hint.setAttribute('aria-label', 'Selector targeting hint');
    hint.textContent = `${elementLabel(element)} · Click to select · Esc to cancel`;
    hint.style.cssText =
      'position:fixed;max-width:calc(100vw - 16px);padding:4px 8px;border-radius:4px;background:#14181b;color:#f7faf9;pointer-events:none';
    root.append(hint);
    document.documentElement.append(root);
    positionRenderedInspector(root, hint, element);
    inspector = root;
    return;
  }

  const picker = document.createElement('div');
  picker.style.cssText =
    'position:fixed;left:0;top:0;box-sizing:border-box;visibility:hidden;display:flex;width:400px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);flex-direction:column;gap:12px;align-items:stretch;overflow:hidden;padding:12px;border:1px solid #344151;border-radius:12px;background:#14181f;box-shadow:0 12px 36px rgb(0 0 0 / 45%);pointer-events:auto';
  picker.setAttribute('aria-label', 'Choose locator');
  picker.setAttribute('role', 'dialog');
  picker.tabIndex = -1;

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;flex:none;justify-content:space-between;gap:12px;align-items:center;min-width:0';
  picker.append(header);

  const tag = document.createElement('span');
  tag.textContent = elementLabel(element);
  tag.style.cssText =
    'flex:1;min-width:0;overflow:hidden;color:#d6dfeb;text-overflow:ellipsis;white-space:nowrap';
  header.append(tag);
  const modeControls = document.createElement('div');
  modeControls.style.cssText = 'display:flex;flex:none;gap:6px;align-items:center';
  header.append(modeControls);
  const actions = document.createElement('div');
  actions.setAttribute('aria-label', 'Selector actions');
  actions.style.cssText = 'display:flex;flex:none;gap:8px';
  picker.append(actions);

  if (repicking) {
    const mode = document.createElement('span');
    mode.textContent = 'Repick element';
    mode.style.cssText =
      'padding:2px 6px;border-radius:4px;background:#69511b;color:#ffe19a;font-family:system-ui,sans-serif;font-weight:600';
    modeControls.append(mode);
  } else if (captureMode === 'hover') {
    const mode = document.createElement('span');
    mode.textContent = 'Record hover';
    mode.style.cssText =
      'padding:2px 6px;border-radius:4px;background:rgb(57 135 229 / 22%);color:#8fc5ff;font-family:system-ui,sans-serif;font-weight:600';
    modeControls.append(mode);
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
      const nextElement =
        assertion === 'countExactly' || assertion === 'countAtLeast'
          ? (collectionElementFor(element) ?? element)
          : element;
      inspectedElement = nextElement;
      pinnedElement = nextElement;
      pendingChoice = undefined;
      renderInspector();
    });
    modeControls.append(select);
  }

  if (assertion === 'countExactly' || assertion === 'countAtLeast') {
    const target = observationForCount(element);
    const matches = countMatches(target.locators[0]);
    const count = document.createElement('span');
    count.textContent = `${matches} match${matches === 1 ? '' : 'es'}`;
    count.style.cssText = 'padding:1px 4px;color:#8fc5ff';
    modeControls.append(count);
  }

  const chosen = pendingChoice?.locator ?? preferredLocators.get(element);
  const choose = (choice: InspectorChoice): void => {
    // A snapshot result may have been removed by the page since the tab opened.
    if (choice.element.isConnected) pendingChoice = choice;
    renderInspector();
  };
  const choiceButton = (choice: InspectorChoice, label = choice.label): HTMLButtonElement => {
    const button = document.createElement('button');
    const selected =
      choice.element === element && JSON.stringify(chosen) === JSON.stringify(choice.locator);
    button.type = 'button';
    button.textContent = `${selected ? '✓ ' : ''}${label}`;
    button.setAttribute('aria-pressed', String(selected));
    button.style.cssText = `min-width:0;padding:3px 6px;border:1px solid ${selected ? '#3987e5' : '#394147'};border-radius:4px;background:${selected ? 'rgb(57 135 229 / 22%)' : '#1a1f23'};color:#e3e8e6;cursor:pointer;font:inherit;overflow-wrap:anywhere;text-align:left;white-space:normal`;
    button.addEventListener('pointerdown', blockPageInteraction, true);
    button.addEventListener(
      'click',
      (event) => {
        blockPageInteraction(event);
        choose(choice);
      },
      true,
    );
    return button;
  };

  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    profileVariables.length > 0 &&
    captureMode === 'record' &&
    !repicking
  ) {
    const variables = document.createElement('div');
    variables.style.cssText = 'display:flex;flex:none;gap:6px;flex-wrap:wrap';
    picker.append(variables);
    for (const variable of profileVariables) {
      const button = document.createElement('button');
      const selected = selectedVariables.get(element) === variable.name;
      button.type = 'button';
      button.textContent = `${selected ? '✓ ' : ''}{{${variable.name}}}`;
      button.title = `Fill with profile variable ${variable.name}`;
      button.style.cssText = `padding:2px 6px;border:1px solid ${selected ? '#3987e5' : '#394147'};border-radius:4px;background:${selected ? 'rgb(57 135 229 / 22%)' : '#1a1f23'};color:#e3e8e6;cursor:pointer;font:inherit`;
      button.addEventListener('pointerdown', blockPageInteraction, true);
      button.addEventListener(
        'click',
        (event) => {
          blockPageInteraction(event);
          hideInspector();
          locatorPicking = false;
          fillFromVariable(element, variable, true);
          element.focus();
        },
        true,
      );
      variables.append(button);
    }
  }

  const separator = document.createElement('div');
  separator.setAttribute('role', 'separator');
  separator.style.cssText = 'flex:none;height:0;border-top:1px solid #303c4b';
  const advancedHint = document.createElement('p');
  advancedHint.id = 'testron-advanced-hint';
  advancedHint.textContent = 'You can change selector in advanced mode';
  advancedHint.style.cssText =
    'flex:none;margin:0;color:#94a3b8;font:400 11px/16px system-ui,sans-serif';
  picker.append(separator, advancedHint);

  const tabs = document.createElement('div');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Locator source');
  tabs.setAttribute('aria-describedby', advancedHint.id);
  tabs.style.cssText =
    'display:flex;flex:none;gap:4px;padding:3px;border:1px solid #303c4b;border-radius:7px;background:#0e131a';
  for (const [searchTab, label] of [
    [false, 'Current selection'],
    [true, 'Search on page'],
  ] as const) {
    const tab = document.createElement('button');
    const active = searchTab === inspectorSearchOpen;
    tab.type = 'button';
    tab.id = searchTab ? 'testron-search-tab' : 'testron-current-tab';
    tab.textContent = label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active));
    tab.setAttribute('aria-controls', 'testron-selector-content');
    tab.style.cssText = `flex:1;min-width:0;width:auto;margin:0;padding:7px 8px;border:0;border-radius:4px;background:${active ? '#263346' : 'transparent'};color:${active ? '#e6eefb' : '#94a3b8'};cursor:pointer;font:600 12px system-ui,sans-serif`;
    tab.addEventListener('pointerdown', blockPageInteraction, true);
    tab.addEventListener(
      'click',
      (event) => {
        blockPageInteraction(event);
        if (active) return;
        inspectorSearchOpen = searchTab;
        if (searchTab) inspectorSearchSnapshot = undefined;
        renderInspector();
      },
      true,
    );
    tabs.append(tab);
  }
  picker.append(tabs);
  const content = document.createElement('div');
  content.id = 'testron-selector-content';
  content.setAttribute('role', 'tabpanel');
  content.setAttribute(
    'aria-labelledby',
    inspectorSearchOpen ? 'testron-search-tab' : 'testron-current-tab',
  );
  content.style.cssText = 'display:flex;min-height:0;flex-direction:column;gap:8px';
  picker.append(content);

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel selector picker');
  cancel.textContent = 'Cancel';
  cancel.style.cssText =
    'flex:1;width:auto;margin:0;padding:8px 12px;border:1px solid #435165;border-radius:6px;background:#1c2531;color:#d9e2ef;cursor:pointer;font:600 12px system-ui,sans-serif';
  cancel.addEventListener('pointerdown', blockPageInteraction, true);
  cancel.addEventListener(
    'click',
    (event) => {
      blockPageInteraction(event);
      cancelSelection();
    },
    true,
  );
  actions.append(cancel);

  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  tree.setAttribute('aria-label', 'Nearby element tree');
  tree.style.cssText =
    'display:flex;min-height:0;max-height:42vh;flex-direction:column;gap:3px;overflow:auto;padding:2px';
  const treeNodes = inspectorTreeNodes(element);
  const voidTags = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);
  const renderTreeNode = (node: InspectorTreeNode, nodes = treeNodes): HTMLDivElement => {
    const row = document.createElement('div');
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(node.depth + 1));
    row.setAttribute('aria-label', `${node.relation} ${elementLabel(node.element)}`);
    row.setAttribute('aria-current', String(node.relation === 'current'));
    row.style.cssText =
      'display:flex;min-width:0;flex-direction:column;gap:5px;padding:6px;border:1px solid #3987e5;border-radius:5px;background:rgb(57 135 229 / 6%);font-weight:400';

    const nodeHeader = document.createElement('div');
    nodeHeader.setAttribute('data-tree-opening-tag', '');
    nodeHeader.setAttribute('aria-label', `${node.relation} locator choices`);
    const current = node.relation === 'current';
    const syntaxColor = current ? '#c4b5fd' : '#84919e';
    nodeHeader.style.cssText = `min-width:0;line-height:25px;overflow-wrap:anywhere;color:${syntaxColor};font-weight:${current ? 700 : 400}`;
    const tagName = node.element.tagName.toLowerCase();
    const choices = choicesForTreeNode(node.element);
    const attributeName = (choice: InspectorChoice): string | undefined => {
      switch (choice.locator.strategy) {
        case 'testId':
          return choice.locator.attribute;
        case 'id':
          return 'id';
        case 'name':
          return 'name';
        default:
          return undefined;
      }
    };
    const inlineChoice = (choice: InspectorChoice, label: string): HTMLButtonElement => {
      const button = choiceButton(choice, label);
      // Keep the tag looking like HTML; selection is conveyed by the chip's
      // border/background and aria-pressed, not a checkmark inside the markup.
      button.textContent = label;
      button.setAttribute(
        'aria-label',
        `${node.relation} ${elementLabel(node.element)} selector ${choice.label}`,
      );
      button.title = `Select ${choice.label}`;
      button.style.cssText =
        'display:inline-block;vertical-align:baseline;width:auto;max-width:100%;min-width:0;margin:0;padding:1px 4px;border:1px solid;border-radius:4px;cursor:pointer;font:inherit;line-height:18px;text-align:left;white-space:normal;overflow-wrap:anywhere';
      const selected = button.getAttribute('aria-pressed') === 'true';
      let hovered = false;
      let focused = false;
      const updateStyle = (): void => {
        const active = hovered || focused;
        button.style.borderColor = active ? '#a7b7ca' : selected ? '#70aafa' : '#485565';
        button.style.background = active
          ? 'rgb(148 163 184 / 24%)'
          : selected
            ? 'rgb(57 135 229 / 22%)'
            : 'rgb(148 163 184 / 8%)';
        button.style.color = active ? '#ffffff' : current ? '#e0d7ff' : '#e2e8f0';
      };
      button.addEventListener('pointerenter', () => {
        hovered = true;
        updateStyle();
      });
      button.addEventListener('pointerleave', () => {
        hovered = false;
        updateStyle();
      });
      button.addEventListener('focus', () => {
        focused = true;
        updateStyle();
      });
      button.addEventListener('blur', () => {
        focused = false;
        updateStyle();
      });
      updateStyle();
      return button;
    };
    const attributes = choices.filter((choice) => attributeName(choice) !== undefined);
    if (attributes.length > 0) {
      nodeHeader.append(`<${tagName}`);
      const attributeOrder = node.element.getAttributeNames();
      attributes.sort(
        (a, b) =>
          attributeOrder.indexOf(attributeName(a)!) - attributeOrder.indexOf(attributeName(b)!),
      );
      for (const choice of attributes) {
        const name = attributeName(choice)!;
        const value = node.element.getAttribute(name) ?? '';
        nodeHeader.append(' ', inlineChoice(choice, `${name}="${value}"`));
      }
      nodeHeader.append('>');
    } else {
      // Elements without author attributes remain selectable via their tag.
      nodeHeader.append('<', inlineChoice(choices[0], tagName), '>');
    }
    row.append(nodeHeader);

    const contents = document.createElement('div');
    contents.style.cssText =
      'display:flex;min-width:0;flex-direction:column;gap:5px;margin-left:14px';
    contents.setAttribute('role', 'group');
    // Keep the nearby-tree scope, but preserve DOM order for text and children.
    for (const child of node.element.childNodes) {
      const childNode = nodes.find((candidate) => candidate.element === child);
      if (childNode) contents.append(renderTreeNode(childNode, nodes));
      else if (child.nodeType === Node.TEXT_NODE && node.relation !== 'parent') {
        const value = clean(child.textContent);
        if (value) {
          const text = document.createElement('span');
          text.textContent = value;
          text.style.cssText = 'color:#c1ccd7;overflow-wrap:anywhere;font-weight:400';
          contents.append(text);
        }
      }
    }
    if (contents.childNodes.length > 0) row.append(contents);
    if (!voidTags.has(tagName)) {
      const closing = document.createElement(node.relation === 'current' ? 'strong' : 'span');
      closing.textContent = `</${tagName}>`;
      closing.style.cssText = `color:${syntaxColor};font-weight:${current ? 700 : 400}`;
      row.append(closing);
    }
    return row;
  };
  if (!inspectorSearchOpen) tree.append(renderTreeNode(treeNodes[0]));

  const attachTreeHighlight = (tree: HTMLElement): void => {
    let hoveredRow: HTMLElement | undefined;
    const highlightRow = (row?: HTMLElement): void => {
      if (row === hoveredRow) return;
      if (hoveredRow) {
        hoveredRow.style.borderColor = '#3987e5';
        hoveredRow.style.background = 'rgb(57 135 229 / 6%)';
      }
      hoveredRow = row;
      if (row) {
        row.style.borderColor = '#39b879';
        row.style.background = 'rgb(57 184 121 / 12%)';
      }
    };
    tree.addEventListener('pointerover', (event) => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[role="treeitem"]')
          : null;
      highlightRow(row ?? undefined);
    });
    tree.addEventListener('pointerleave', () => highlightRow());
    tree.addEventListener('focusin', (event) => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[role="treeitem"]')
          : null;
      highlightRow(row ?? undefined);
    });
    tree.addEventListener('focusout', () => highlightRow());
  };
  attachTreeHighlight(tree);
  if (!inspectorSearchOpen) content.append(tree);

  if (inspectorSearchOpen) {
    const search = document.createElement('div');
    search.id = 'testron-selector-search';
    search.style.cssText = 'display:flex;min-height:0;flex:1 1 auto;flex-direction:column;gap:8px';
    const input = document.createElement('input');
    input.type = 'search';
    input.value = inspectorSearchQuery;
    input.placeholder = 'Search ID, test ID, or name…';
    input.setAttribute('aria-label', 'Search page selectors');
    input.autocomplete = 'off';
    input.style.cssText =
      'box-sizing:border-box;width:100%;height:28px;padding:4px 7px;border:1px solid #4b555c;border-radius:4px;outline:none;background:#0f1214;color:#f1f5f3;font:12px/18px ui-monospace,SFMono-Regular,Menlo,monospace';
    const results = document.createElement('div');
    results.setAttribute('role', 'tree');
    results.setAttribute('aria-label', 'Page selector results');
    results.style.cssText =
      'display:flex;min-height:0;max-height:42vh;flex-direction:column;gap:6px;overflow:auto;padding:2px';
    attachTreeHighlight(results);
    const status = document.createElement('span');
    status.style.cssText = 'color:#7f8a85;font:11px/15px system-ui,sans-serif';
    // New/changed page content is picked up when this tab is reopened. Drop
    // detached results on each update; do not rescan the document on selection.
    const snapshot = (inspectorSearchSnapshot ??= pageInspectorSearchSnapshot());
    const updateResults = (): void => {
      const query = inspectorSearchQuery.trim().toLowerCase();
      const matches = snapshot
        .filter((entry) => entry.element.isConnected && entry.searchText.includes(query))
        .map((entry) => entry.element);
      const visible = matches.slice(0, 100);
      const included = new Set(visible);
      for (const match of visible) {
        const parent = match.parentElement;
        if (parent && parent !== document.body && parent !== document.documentElement)
          included.add(parent);
      }
      const nodes: InspectorTreeNode[] = [...included].map((match) => {
        let depth = 0;
        let parent = match.parentElement;
        while (parent && included.has(parent)) {
          depth += 1;
          parent = parent.parentElement;
        }
        return {
          element: match,
          depth,
          relation: match === element ? 'current' : visible.includes(match) ? 'child' : 'parent',
        };
      });
      const roots = nodes.filter(
        (node) => !node.element.parentElement || !included.has(node.element.parentElement),
      );
      roots.sort((a, b) => {
        const position = a.element.compareDocumentPosition(b.element);
        if (position === 0 || position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0;
        return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
      results.replaceChildren(...roots.map((node) => renderTreeNode(node, nodes)));
      status.textContent =
        matches.length === 0
          ? 'No selectors found'
          : `Showing ${visible.length} of ${matches.length} element${matches.length === 1 ? '' : 's'}`;
    };
    input.addEventListener('input', () => {
      inspectorSearchQuery = input.value;
      updateResults();
    });
    updateResults();
    search.append(input, status, results);
    content.append(search);
    queueMicrotask(() => {
      if (!input.isConnected) return;
      input.focus();
      if (searchSelection?.start != null && searchSelection.end != null)
        input.setSelectionRange(
          searchSelection.start,
          searchSelection.end,
          searchSelection.direction ?? undefined,
        );
    });
  }

  {
    const confirm = document.createElement('button');
    confirm.type = 'button';
    const label = repicking
      ? 'Apply locator'
      : captureMode === 'hover'
        ? 'Record hover'
        : captureMode === 'verify'
          ? 'Confirm assertion'
          : 'Use locator';
    confirm.setAttribute('aria-label', label);
    confirm.textContent = 'Confirm';
    confirm.title = label;
    confirm.style.cssText =
      'flex:1;width:auto;margin:0;padding:8px 12px;border:1px solid #5792df;border-radius:6px;background:#285c9e;color:#f4f8ff;cursor:pointer;font:600 12px system-ui,sans-serif';
    confirm.addEventListener('pointerdown', blockPageInteraction, true);
    confirm.addEventListener(
      'click',
      (event) => {
        blockPageInteraction(event);
        if (!origin.isConnected || !element.isConnected) {
          hideInspector();
          return;
        }
        if (pendingChoice) {
          selectedTargets.set(origin, element);
          preferredLocators.set(element, pendingChoice.locator);
        }
        if (repicking) sendControl({ kind: 'repick-target', target: observationFor(element) });
        else if (captureMode === 'verify') captureAssertion(element);
        else if (captureMode === 'hover') {
          send({ kind: 'hover', target: observationFor(element), url: window.location.href });
          sendControl({ kind: 'hover-captured' });
        }
        hideInspector();
        locatorPicking = false;
      },
      true,
    );
    actions.append(confirm);
  }

  root.append(picker);
  document.documentElement.append(root);
  positionRenderedInspector(root, picker, element);
  picker.style.visibility = 'visible';
  inspector = root;
  if (restoreFocus && !inspectorSearchOpen) picker.focus({ preventScroll: true });
};

const isPageShell = (element: Element): boolean => {
  if (element === document.documentElement || element === document.body) return true;
  if (element.id !== 'root') return false;
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height >= window.innerWidth * window.innerHeight * 0.8;
};

const inspect = (origin: Element, reposition = false): void => {
  if (!isSelecting() || isInspectorElement(origin) || pinnedElement) return;
  // Promote icon/span children to the control they belong to, but keep every
  // other element exact. Attribute-bearing ancestors such as React's #root
  // must never swallow the card, chart, SVG node, or text actually under the
  // pointer.
  const element =
    captureMode === 'verify' && (assertion === 'countExactly' || assertion === 'countAtLeast')
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
  if (!lastPointer || !isSelecting()) return;
  if (repositionPinnedInspector()) return;
  if (pinnedElement) hideInspector();
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
    const origin = event.target;
    if (!(origin instanceof Element) || isInspectorElement(origin) || pinnedElement) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    schedulePointerHitTest();
  },
  true,
);
window.addEventListener('scroll', schedulePointerHitTest, true);
window.addEventListener('resize', schedulePointerHitTest);
window.addEventListener(
  'pointerout',
  (event) => {
    if (event.relatedTarget === null && !pinnedElement) hideInspector();
  },
  true,
);
window.addEventListener('blur', () => {
  if (!pinnedElement) hideInspector();
});

// A selection gesture must not focus, submit, or activate controls on the site.
for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const) {
  window.addEventListener(
    type,
    (event) => {
      if (
        event.target instanceof Element &&
        !isInspectorElement(event.target) &&
        (isSelecting() || (recordingActive && event.altKey))
      )
        blockPageInteraction(event);
    },
    true,
  );
}

window.addEventListener(
  'click',
  (event) => {
    if (!recordingActive && !repicking) return;
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    if (isInspectorElement(origin)) return;
    lastPointer = { x: event.clientX, y: event.clientY };
    // Alt/Option-click is the explicit locator editor during normal recording.
    const editLocator = recordingActive && event.altKey;
    if (isSelecting() || editLocator) {
      blockPageInteraction(event);
      if (pinnedElement) {
        cancelSelection();
        return;
      }
      const element =
        captureMode === 'verify' && (assertion === 'countExactly' || assertion === 'countAtLeast')
          ? (collectionElementFor(origin) ?? origin)
          : (origin.closest(INTERACTIVE_SELECTOR) ?? origin);
      if (isPageShell(element)) return;
      if (editLocator) locatorPicking = true;
      pinnedElement = element;
      inspectedElement = element;
      renderInspector();
      inspector
        ?.querySelector<HTMLElement>('[aria-label="Choose locator"]')
        ?.focus({ preventScroll: true });
      return;
    }
    const hit = origin.closest(
      'button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"]',
    );
    if (!hit) {
      hideInspector();
      return;
    }
    const element = selectedTargets.get(hit) ?? hit;
    send({ kind: 'click', target: observationFor(element), url: window.location.href });
    hideInspector();
  },
  true,
);

window.addEventListener(
  'focusin',
  (event) => {
    if (!recordingActive || captureMode !== 'record' || isSelecting()) return;
    const element = event.target;
    if (element instanceof Element && isInspectorElement(element)) return;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (automaticallyFilled.has(element) || selectedVariables.has(element)) return;
    automaticallyFilled.add(element);
    const variable = exactVariableFor(element);
    if (variable) fillFromVariable(element, variable, false);
  },
  true,
);

window.addEventListener(
  'input',
  (event) => {
    if (captureMode !== 'record' || isSelecting()) return;
    const element = event.target;
    if (element instanceof Element && isInspectorElement(element)) return;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (event.isTrusted && selectedVariables.has(element)) selectedVariables.delete(element);
    send({
      kind: 'input',
      target: observationFor(element),
      value: element.value,
      url: window.location.href,
    });
  },
  true,
);

window.addEventListener(
  'focusout',
  (event) => {
    if (captureMode !== 'record' || isSelecting()) return;
    const element = event.target;
    if (element instanceof Element && isInspectorElement(element)) return;
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
    if (captureMode !== 'record' || isSelecting()) return;
    const element = event.target;
    if (element instanceof Element && isInspectorElement(element)) return;
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
    const target = event.target;
    if (event.key === 'Escape' && isSelecting()) {
      blockPageInteraction(event);
      cancelSelection();
      return;
    }
    if (target instanceof Element && isInspectorElement(target)) {
      if (event.key === 'Tab') {
        event.preventDefault();
        const controls = [
          ...(inspector?.querySelectorAll<HTMLElement>('button, input, select') ?? []),
        ];
        const index = controls.indexOf(target as HTMLElement);
        const next = event.shiftKey
          ? index <= 0
            ? controls.length - 1
            : index - 1
          : (index + 1) % controls.length;
        controls[next]?.focus();
      }
      event.stopImmediatePropagation();
      return;
    }
    const isEditable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    const normalizedKey = event.key.toLowerCase();
    const shortcutKey =
      (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && normalizedKey === 'l'
        ? 'mod+l'
        : !isEditable && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
          ? ['r', 'a', 'h', '1', '2', 'f'].find((key) => key === normalizedKey)
          : undefined;
    if (!event.repeat && shortcutKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendControl({ kind: 'shortcut', key: shortcutKey });
      return;
    }
    if (captureMode !== 'record' || isSelecting()) return;
    if (!['Enter', 'Escape', 'Tab'].includes(event.key) || event.repeat) return;
    const element = target;
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

// A user can change the page while recording is paused. The replay cursor is then stale.
for (const eventName of ['pointerdown', 'keydown', 'input', 'change']) {
  document.addEventListener(
    eventName,
    (event) => {
      if (event.isTrusted && !recordingActive)
        ipcRenderer.send(RECORDER_CHANNEL, { kind: 'browser-interaction' });
    },
    true,
  );
}
