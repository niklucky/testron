import type { Step } from '@testron/domain/steps/schema';

/** Runs in a dedicated isolated world. Never evaluates the user's source document. */
export const replayPage = (step: Step | undefined, operation: 'prepare' | 'highlight') => {
  const overlayId = '__testron_step_replay_highlight__';
  document.getElementById(overlayId)?.remove();
  if (!step || !('target' in step)) return { ready: true };
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const roots: (Document | ShadowRoot)[] = [document];
  const elements: Element[] = [];
  for (let index = 0; index < roots.length; index++) {
    for (const element of roots[index]!.querySelectorAll('*')) {
      elements.push(element);
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  const role = (element: Element): string => {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit.split(' ')[0]!;
    const tag = element.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (element as HTMLInputElement).type;
      return (
        (
          {
            checkbox: 'checkbox',
            radio: 'radio',
            button: 'button',
            submit: 'button',
            reset: 'button',
            range: 'slider',
            number: 'spinbutton',
            search: 'searchbox',
            hidden: '',
            password: '',
          } as Record<string, string>
        )[type] ?? 'textbox'
      );
    }
    return (
      (
        {
          button: 'button',
          a: element.hasAttribute('href') ? 'link' : '',
          textarea: 'textbox',
          select: (element as HTMLSelectElement).multiple ? 'listbox' : 'combobox',
          option: 'option',
          img: 'img',
          li: 'listitem',
          ul: 'list',
          ol: 'list',
          table: 'table',
          tr: 'row',
          td: 'cell',
          th: 'columnheader',
          h1: 'heading',
          h2: 'heading',
          h3: 'heading',
          h4: 'heading',
          h5: 'heading',
          h6: 'heading',
        } as Record<string, string>
      )[tag] ?? ''
    );
  };
  const labels = (element: Element): string =>
    clean(
      'labels' in element
        ? Array.from((element as HTMLInputElement).labels ?? [])
            .map((label) => label.textContent)
            .join(' ')
        : '',
    );
  const name = (element: Element): string => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy)
      return clean(
        labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent)
          .join(' '),
      );
    return clean(
      element.getAttribute('aria-label') ||
        labels(element) ||
        element.getAttribute('alt') ||
        (element instanceof HTMLInputElement && ['submit', 'reset', 'button'].includes(element.type)
          ? element.value
          : '') ||
        element.textContent ||
        element.getAttribute('title'),
    );
  };
  const contains = (actual: string, expected: string) =>
    actual.toLowerCase().includes(expected.toLowerCase());
  const visible = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  };
  const locator = step.target.primary;
  let matches: Element[];
  switch (locator.strategy) {
    case 'css':
      matches = roots.flatMap((root) => [...root.querySelectorAll(locator.selector)]);
      break;
    case 'testId':
      matches = elements.filter(
        (element) => element.getAttribute(locator.attribute) === locator.value,
      );
      break;
    case 'id':
      matches = elements.filter((element) => element.id === locator.value);
      break;
    case 'name':
      matches = elements.filter((element) => element.getAttribute('name') === locator.value);
      break;
    case 'role':
      matches = elements.filter(
        (element) =>
          role(element) === locator.role &&
          contains(name(element), locator.name) &&
          !element.closest('[aria-hidden="true"]') &&
          visible(element),
      );
      break;
    case 'label':
      matches = elements.filter(
        (element) =>
          contains(labels(element), locator.text) ||
          ((element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) &&
            contains(name(element), locator.text)),
      );
      break;
    case 'placeholder':
      matches = elements.filter((element) =>
        contains(clean(element.getAttribute('placeholder')), locator.text),
      );
      break;
    case 'text':
      matches = elements.filter(
        (element) =>
          !['SCRIPT', 'STYLE', 'HEAD'].includes(element.tagName) &&
          clean(element.textContent) === locator.text &&
          ![...element.children].some((child) => clean(child.textContent) === locator.text),
      );
      break;
  }
  if (step.kind === 'assertElement' && operation === 'prepare' && step.assertion.type === 'count') {
    const assertion = step.assertion;
    return {
      ready:
        assertion.operator === 'equals'
          ? matches.length === assertion.expected
          : matches.length >= assertion.expected,
    };
  }
  if (
    step.kind === 'assertElement' &&
    operation === 'prepare' &&
    step.assertion.type === 'hidden' &&
    matches.length === 0
  )
    return { ready: true };
  if (matches.length > 1)
    throw new Error(`Step locator is ambiguous (${matches.length} elements).`);
  const element = matches[0];
  if (!element) return { ready: operation === 'highlight' };
  if (operation === 'highlight') {
    if (!visible(element)) return { ready: true };
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    Object.assign(overlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '2147483647',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      border: '2px solid #7c6cff',
      borderRadius: '4px',
      boxSizing: 'border-box',
      background: '#7c6cff18',
    });
    document.documentElement.append(overlay);
    return { ready: true };
  }
  if (step.kind === 'assertElement') {
    const assertion = step.assertion;
    const value = 'value' in element ? String(element.value) : '';
    const checked = 'checked' in element && Boolean(element.checked);
    switch (assertion.type) {
      case 'visible':
        return { ready: visible(element) };
      case 'hidden':
        return { ready: !visible(element) };
      case 'enabled':
        return {
          ready: !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true',
        };
      case 'disabled':
        return {
          ready: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        };
      case 'checked':
        return { ready: checked };
      case 'unchecked':
        return { ready: !checked };
      case 'text':
        return {
          ready:
            assertion.match === 'equals'
              ? clean(element.textContent) === clean(assertion.expected)
              : clean(element.textContent).includes(clean(assertion.expected)),
        };
      case 'value':
        return { ready: value === assertion.expected };
      case 'attribute':
        return { ready: element.getAttribute(assertion.name) === assertion.expected };
      case 'class':
        return { ready: clean(element.getAttribute('class')) === clean(assertion.expected) };
    }
  }
  if (
    !visible(element) ||
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true'
  )
    return { ready: false };
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (step.kind === 'fill') {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) return { ready: false };
      element.focus();
      const prototype =
        element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, step.value);
    } else if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      element.textContent = step.value;
    } else throw new Error('The fill target is not an editable input.');
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ready: true };
  }
  if (step.kind === 'selectOption') {
    if (!(element instanceof HTMLSelectElement))
      throw new Error('The selection target is not a select element.');
    if (![...element.options].some((option) => option.value === step.value))
      return { ready: false };
    element.value = step.value;
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ready: true };
  }
  if (step.kind === 'check' || step.kind === 'uncheck') {
    if (!(element instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(element.type))
      throw new Error('The check target is not a checkbox or radio.');
    if (element.checked === (step.kind === 'check')) return { ready: true };
    if (element.type === 'radio' && step.kind === 'uncheck')
      throw new Error('A selected radio cannot be unchecked directly.');
  }
  if (step.kind === 'press') {
    if (!(element instanceof HTMLElement))
      throw new Error('The keyboard target cannot be focused.');
    element.focus();
    return { ready: true, key: step.key };
  }
  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
  const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
  const hit =
    element.getRootNode() instanceof ShadowRoot
      ? (element.getRootNode() as ShadowRoot).elementFromPoint(x, y)
      : document.elementFromPoint(x, y);
  if (hit !== element && !element.contains(hit)) return { ready: false };
  return { ready: true, point: { x, y } };
};
