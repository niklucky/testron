import type { Locator } from '@testron/domain/locators/schema';
import type { Step } from '@testron/domain/steps/schema';

import type { AppSnapshot } from '../../preload/api';
import type { CodeLine } from './codegen';
import type { RecordedStep } from './types';

const labelFor = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return locator.value;
    case 'id':
    case 'name':
      return locator.value;
    case 'role':
      return locator.name;
    case 'label':
    case 'placeholder':
    case 'text':
      return locator.text;
    case 'css':
      return locator.selector;
  }
  return 'element';
};

const quote = (value: string): string =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/**
 * Keep panel presentation independent from the generated-code formatter.
 * During development Vite may briefly serve an older optimized domain module
 * after the recorder preload learns a new locator strategy. A total local
 * formatter keeps that version skew from ever taking down the record screen.
 */
export const presentLocator = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return locator.attribute === 'data-testid'
        ? `getByTestId(${quote(locator.value)})`
        : `locator(${quote(`[${locator.attribute}=${quote(locator.value)}]`)})`;
    case 'id':
      return `locator(${quote(`[id=${quote(locator.value)}]`)})`;
    case 'name':
      return `locator(${quote(`[name=${quote(locator.value)}]`)})`;
    case 'role':
      return `getByRole(${quote(locator.role)}, { name: ${quote(locator.name)} })`;
    case 'label':
      return `getByLabel(${quote(locator.text)})`;
    case 'placeholder':
      return `getByPlaceholder(${quote(locator.text)})`;
    case 'text':
      return `getByText(${quote(locator.text)}, { exact: true })`;
    case 'css':
      return `locator(${quote(locator.selector)})`;
  }
  return "locator('unknown-locator')";
};

const assertionFor = (
  step: Extract<Step, { kind: 'assertElement' }>,
): RecordedStep['assertion'] => {
  if (step.assertion.type === 'count')
    return step.assertion.operator === 'equals' ? 'countExactly' : 'countAtLeast';
  if (step.assertion.type !== 'text') return step.assertion.type;
  return step.assertion.match === 'contains' ? 'textContains' : 'textEquals';
};

/** Convert the domain recorder model into the compact model shared by both overlay views. */
export const presentRecordedSteps = (steps: readonly Step[]): RecordedStep[] => {
  const firstAt = Date.parse(steps[0]?.metadata.recordedAt ?? '') || Date.now();
  const occurrences = new Map<string, number>();

  return steps.map((step) => {
    const recordedAt = step.metadata.recordedAt;
    const occurrence = occurrences.get(recordedAt) ?? 0;
    occurrences.set(recordedAt, occurrence + 1);
    const common = {
      id: `step-${recordedAt}-${occurrence}`,
      at: Math.max(0, Math.round(((Date.parse(recordedAt) || firstAt) - firstAt) / 1_000)),
      alternatives: 'target' in step ? step.target.alternatives.map(presentLocator) : [],
      warning: 'target' in step ? step.target.warnings?.join(' · ') : undefined,
    };

    switch (step.kind) {
      case 'navigate':
        return { ...common, kind: 'navigate', label: step.url, locator: '', url: step.url };
      case 'click':
        return {
          ...common,
          kind: 'click',
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
        };
      case 'fill':
        return {
          ...common,
          kind: 'fill',
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
          value: step.value,
          secret: step.variable?.name ?? step.secret?.environmentVariable,
        };
      case 'selectOption':
        return {
          ...common,
          kind: 'select',
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
          value: step.value,
        };
      case 'check':
      case 'uncheck':
        return {
          ...common,
          kind: step.kind,
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
        };
      case 'press':
        return {
          ...common,
          kind: 'press',
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
          value: step.key,
        };
      case 'assertElement':
        return {
          ...common,
          kind: 'assert',
          label: labelFor(step.target.primary),
          locator: presentLocator(step.target.primary),
          assertion: assertionFor(step),
          value:
            step.assertion.type === 'text' ||
            step.assertion.type === 'value' ||
            step.assertion.type === 'count'
              ? String(step.assertion.expected)
              : undefined,
        };
      case 'assertUrlPath':
        return {
          ...common,
          kind: 'assertUrl',
          label: 'URL path',
          locator: '',
          value: step.expected,
        };
    }
  });
};

/** Preserve the backend's canonical source while tagging its one action line per step. */
export const presentSource = (source: string, steps: readonly RecordedStep[]): CodeLine[] => {
  let stepIndex = 0;
  return source
    .replace(/\n$/, '')
    .split('\n')
    .map((text) => ({
      text,
      ...(/^ {2}await /.test(text) && steps[stepIndex] ? { stepId: steps[stepIndex++].id } : {}),
    }));
};

export const recordingContext = (snapshot: AppSnapshot) => {
  const { library } = snapshot;
  const project = library.projects.find((one) => one.id === library.selectedProjectId);
  const environment = library.environments.find((one) => one.id === library.selectedEnvironmentId);
  const test = library.tests.find((one) => one.id === library.selectedTestId);
  const title = test?.title ?? snapshot.title;
  const filename = `${
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled-test'
  }.spec.ts`;
  return {
    project: project?.name ?? 'My project',
    suite: 'Tests',
    environment: environment?.name ?? 'Local',
    baseUrl: environment?.baseUrl ?? 'http://127.0.0.1:4174',
    testIdAttribute: environment?.testIdAttribute ?? 'data-testid',
    title,
    file: `tests/${filename}`,
  };
};
