import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type {
  BrowserContext,
  expect as PlaywrightExpect,
  Locator as PwLocator,
  Page,
} from '@playwright/test';

import type { Locator } from '@testron/domain/locators/schema';
import { presentStep } from '@testron/domain/steps/present';
import type { Step } from '@testron/domain/steps/schema';

export type ReplayStepStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface ReplayStepResult {
  index: number;
  action: string;
  locator?: string;
  status: ReplayStepStatus;
  durationMs?: number;
  error?: string;
  pageUrl?: string;
}

export interface ReplaySnapshot {
  status: 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'timedOut';
  steps: ReplayStepResult[];
  startedAt?: string;
  durationMs?: number;
  screenshotPath?: string;
  tracePath?: string;
  error?: string;
}

type PlaywrightStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
export type BrowserStorageState = Omit<PlaywrightStorageState, 'origins'> & {
  origins: Array<PlaywrightStorageState['origins'][number] & { indexedDB?: unknown[] }>;
};

/** Internal main-process result. `capturedStorageState` must never be sent to a renderer. */
export interface ReplayResult extends ReplaySnapshot {
  capturedStorageState?: BrowserStorageState;
}

export interface ReplayOptions {
  steps: readonly Step[];
  environmentVariables: Readonly<Record<string, string>>;
  secretValues?: Readonly<Record<string, string>>;
  timeoutMs: number;
  headed?: boolean;
  artifactsDirectory: string;
  initialStorageState?: BrowserStorageState;
  captureStorageState?: boolean;
  protectSensitiveArtifacts?: boolean;
  cookies?: Array<{ name: string; value: string; url: string }>;
  headers?: { origin: string; values: Record<string, string> };
  onProgress: (snapshot: ReplaySnapshot) => void;
}

const locatorDescription = (locator: Locator): string => {
  switch (locator.strategy) {
    case 'testId':
      return `${locator.attribute}=${JSON.stringify(locator.value)}`;
    case 'id':
      return `id=${JSON.stringify(locator.value)}`;
    case 'name':
      return `name=${JSON.stringify(locator.value)}`;
    case 'role':
      return `role=${JSON.stringify(locator.role)}, name=${JSON.stringify(locator.name)}`;
    case 'label':
      return `label=${JSON.stringify(locator.text)}`;
    case 'placeholder':
      return `placeholder=${JSON.stringify(locator.text)}`;
    case 'text':
      return `text=${JSON.stringify(locator.text)} (exact)`;
    case 'css':
      return `css=${JSON.stringify(locator.selector)}`;
  }
};

const resolveLocator = (page: Page, locator: Locator): PwLocator => {
  switch (locator.strategy) {
    case 'testId':
      return locator.attribute === 'data-testid'
        ? page.getByTestId(locator.value)
        : page.locator(`[${locator.attribute}=${JSON.stringify(locator.value)}]`);
    case 'id':
      return page.locator(`[id=${JSON.stringify(locator.value)}]`);
    case 'name':
      return page.locator(`[name=${JSON.stringify(locator.value)}]`);
    case 'role':
      return page.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
        name: locator.name,
      });
    case 'label':
      return page.getByLabel(locator.text);
    case 'placeholder':
      return page.getByPlaceholder(locator.text);
    case 'text':
      return page.getByText(locator.text, { exact: true });
    case 'css':
      return page.locator(locator.selector);
  }
};

const executeStep = async (
  page: Page,
  step: Step,
  environmentVariables: Readonly<Record<string, string>>,
  secretValues: Readonly<Record<string, string>>,
  expect: typeof PlaywrightExpect,
): Promise<void> => {
  switch (step.kind) {
    case 'code':
      throw new Error('This test contains exact Playwright code and must run as a complete spec.');
    case 'navigate':
      await page.goto(step.url);
      break;
    case 'click':
      await resolveLocator(page, step.target.primary).click();
      break;
    case 'hover':
      await resolveLocator(page, step.target.primary).hover();
      break;
    case 'fill': {
      const variableName = step.variable?.name;
      const secretName = step.secret?.environmentVariable;
      const value = secretName
        ? secretValues[secretName]
        : variableName
          ? environmentVariables[variableName]
          : step.value;
      if (
        value === undefined ||
        ((variableName !== undefined || secretName !== undefined) && value === '')
      )
        throw new Error(
          secretName
            ? `Missing required authentication secret: ${secretName}`
            : `Missing required profile variable: ${variableName}`,
        );
      await resolveLocator(page, step.target.primary).fill(value);
      break;
    }
    case 'selectOption':
      await resolveLocator(page, step.target.primary).selectOption(step.value);
      break;
    case 'check':
      await resolveLocator(page, step.target.primary).check();
      break;
    case 'uncheck':
      await resolveLocator(page, step.target.primary).uncheck();
      break;
    case 'press':
      await resolveLocator(page, step.target.primary).press(step.key);
      break;
    case 'assertElement': {
      const locator = resolveLocator(page, step.target.primary);
      switch (step.assertion.type) {
        case 'visible':
          await expect(locator).toBeVisible();
          break;
        case 'hidden':
          await expect(locator).toBeHidden();
          break;
        case 'enabled':
          await expect(locator).toBeEnabled();
          break;
        case 'disabled':
          await expect(locator).toBeDisabled();
          break;
        case 'checked':
          await expect(locator).toBeChecked();
          break;
        case 'unchecked':
          await expect(locator).not.toBeChecked();
          break;
        case 'text':
          if (step.assertion.match === 'equals')
            await expect(locator).toHaveText(step.assertion.expected);
          else await expect(locator).toContainText(step.assertion.expected);
          break;
        case 'value':
          await expect(locator).toHaveValue(step.assertion.expected);
          break;
        case 'attribute':
          await expect(locator).toHaveAttribute(step.assertion.name, step.assertion.expected);
          break;
        case 'class':
          await expect(locator).toHaveClass(step.assertion.expected);
          break;
        case 'count':
          if (step.assertion.operator === 'equals')
            await expect(locator).toHaveCount(step.assertion.expected);
          else
            await expect
              .poll(() => locator.count())
              .toBeGreaterThanOrEqual(step.assertion.expected);
          break;
      }
      break;
    }
    case 'assertUrlPath':
      await expect(page).toHaveURL((url) => url.pathname === step.expected);
      break;
  }
};

export class LocalReplayRunner {
  private context?: BrowserContext;
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
    void this.context?.close().catch(() => undefined);
  }

  async run(options: ReplayOptions): Promise<ReplayResult> {
    this.cancelled = false;
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const protectSensitiveArtifacts =
      options.captureStorageState === true ||
      options.protectSensitiveArtifacts === true ||
      options.initialStorageState !== undefined ||
      options.secretValues !== undefined ||
      options.cookies !== undefined ||
      options.headers !== undefined;
    const results: ReplayStepResult[] = options.steps.map((step, index) => ({
      index,
      action: presentStep(step),
      ...('target' in step ? { locator: locatorDescription(step.target.primary) } : {}),
      status: 'pending',
    }));
    let snapshot: ReplaySnapshot = { status: 'running', steps: results, startedAt };
    const publish = (): void => options.onProgress(structuredClone(snapshot));
    publish();

    const exactCodeIndex = options.steps.findIndex((step) => step.kind === 'code');
    if (exactCodeIndex >= 0) {
      const error =
        'This test contains exact Playwright code. Complete-spec execution is not available yet.';
      results[exactCodeIndex] = { ...results[exactCodeIndex]!, status: 'failed', error };
      snapshot = { ...snapshot, status: 'failed', durationMs: Date.now() - started, error };
      publish();
      return snapshot;
    }

    // Loaded only after main.ts configures PLAYWRIGHT_BROWSERS_PATH. A static
    // import makes Playwright cache its default browser directory too early.
    const { chromium, expect } = await import('@playwright/test');

    await mkdir(options.artifactsDirectory, { recursive: true });
    const tracePath = path.join(options.artifactsDirectory, 'trace.zip');
    const screenshotPath = path.join(options.artifactsDirectory, 'failure.png');
    await Promise.all([rm(tracePath, { force: true }), rm(screenshotPath, { force: true })]);

    const browser = await chromium.launch({ headless: !options.headed });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      this.context = await browser.newContext({
        ...(options.initialStorageState ? { storageState: options.initialStorageState } : {}),
      });
      if (options.cookies?.length) await this.context.addCookies(options.cookies);
      this.context.setDefaultTimeout(options.timeoutMs);
      // Authentication setup steps can contain resolved secrets. They must not enter a
      // Playwright trace or screenshot, even when setup fails.
      if (!protectSensitiveArtifacts)
        await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await this.context.newPage();
      if (options.headers) {
        const profileHeaders = options.headers;
        const profileOrigin = new URL(profileHeaders.origin).origin;
        const cdp = await this.context.newCDPSession(page);
        cdp.on('Fetch.requestPaused', (event) => {
          const headers = { ...event.request.headers };
          const sameProfileOrigin = new URL(event.request.url).origin === profileOrigin;
          for (const [name, value] of Object.entries(profileHeaders.values)) {
            const existingName = Object.keys(headers).find(
              (candidate) => candidate.toLowerCase() === name.toLowerCase(),
            );
            if (existingName) delete headers[existingName];
            if (sameProfileOrigin) headers[name] = value;
          }
          void cdp.send('Fetch.continueRequest', {
            requestId: event.requestId,
            headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
          });
        });
        await cdp.send('Fetch.enable', {
          patterns: [
            { urlPattern: 'http://*/*', requestStage: 'Request' },
            { urlPattern: 'https://*/*', requestStage: 'Request' },
          ],
        });
      }
      timer = setTimeout(() => {
        timedOut = true;
        void this.context?.close().catch(() => undefined);
      }, options.timeoutMs);

      for (const result of results) {
        if (this.cancelled || timedOut) break;
        const stepStarted = Date.now();
        result.status = 'running';
        publish();
        try {
          await executeStep(
            page,
            options.steps[result.index],
            options.environmentVariables,
            options.secretValues ?? {},
            expect,
          );
          result.status = 'passed';
          result.durationMs = Date.now() - stepStarted;
          result.pageUrl = page.url();
          publish();
        } catch (error) {
          result.status = 'failed';
          result.durationMs = Date.now() - stepStarted;
          result.error = options.captureStorageState
            ? 'Authentication flow step failed.'
            : stripVTControlCharacters(error instanceof Error ? error.message : String(error));
          result.pageUrl = page.url();
          const screenshotCaptured = protectSensitiveArtifacts
            ? false
            : await page
                .screenshot({ path: screenshotPath, fullPage: true })
                .then(() => true)
                .catch(() => false);
          snapshot = {
            ...snapshot,
            status: timedOut ? 'timedOut' : this.cancelled ? 'cancelled' : 'failed',
            durationMs: Date.now() - started,
            ...(screenshotCaptured ? { screenshotPath } : {}),
            ...(!protectSensitiveArtifacts ? { tracePath } : {}),
          };
          break;
        }
      }

      if (snapshot.status === 'running') {
        const status = timedOut ? 'timedOut' : this.cancelled ? 'cancelled' : 'passed';
        const timeoutScreenshotCaptured =
          status === 'timedOut' && !protectSensitiveArtifacts
            ? await page
                .screenshot({ path: screenshotPath, fullPage: true })
                .then(() => true)
                .catch(() => false)
            : false;
        const capturedStorageState =
          status === 'passed' && options.captureStorageState
            ? await this.context.storageState({ indexedDB: true })
            : undefined;
        snapshot = {
          ...snapshot,
          status,
          durationMs: Date.now() - started,
          ...(timeoutScreenshotCaptured ? { screenshotPath } : {}),
          ...(!protectSensitiveArtifacts ? { tracePath } : {}),
        };
        return { ...snapshot, ...(capturedStorageState ? { capturedStorageState } : {}) };
      }
      return snapshot;
    } finally {
      if (timer) clearTimeout(timer);
      if (this.context) {
        if (!protectSensitiveArtifacts)
          await this.context.tracing.stop({ path: tracePath }).catch(() => undefined);
        await this.context.close().catch(() => undefined);
      }
      this.context = undefined;
      await browser.close().catch(() => undefined);
      publish();
    }
  }
}
