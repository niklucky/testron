import {
  playwrightReplayError,
  parsePlaywright,
  reconcilePlaywrightSteps,
} from '@testron/domain/codegen/parse-playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Locator as PwLocator,
  Page,
  expect as PlaywrightExpect,
} from '@playwright/test';

import type { Locator } from '@testron/domain/locators/schema';
import { presentStep } from '@testron/domain/steps/present';
import type { Step } from '@testron/domain/steps/schema';
import { RunnerEgressProxy, runnerOrigin, type RunnerEgressPolicy } from './egress.js';

export interface ServerRunStepResult {
  index: number;
  action: string;
  status: 'passed' | 'failed';
  durationMs: number;
  error: string | null;
  pageUrl: string | null;
}

export interface ServerRunResult {
  status: 'passed' | 'failed' | 'timedOut';
  durationMs: number;
  error: string | null;
  screenshotPath: string | null;
  videoPath: string | null;
  steps: ServerRunStepResult[];
  storageState?: Awaited<ReturnType<BrowserContext['storageState']>>;
}

export interface ServerRunOptions {
  source?: string | undefined;
  environmentUrl: string;
  steps: readonly Step[];
  environmentVariables: Readonly<Record<string, string>>;
  timeoutMs: number;
  artifactsDirectory: string;
  storageState?: BrowserContextOptions['storageState'];
  cookies?: Array<{ name: string; value: string; url: string }>;
  headers?: { origin: string; values: Record<string, string> };
  captureArtifacts?: boolean;
  captureStorageState?: boolean;
}

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
  variables: Readonly<Record<string, string>>,
  expect: typeof PlaywrightExpect,
): Promise<void> => {
  switch (step.kind) {
    case 'code':
      throw new Error('This test contains exact Playwright code and must run as a complete spec.');
    case 'navigate': {
      runnerOrigin(step.url);
      const response = await page.goto(step.url);
      if (await response?.headerValue('x-testron-egress-denied'))
        throw new Error('Runner egress denied: destination must be an approved public website.');
      break;
    }
    case 'click':
      await resolveLocator(page, step.target.primary).click();
      break;
    case 'hover':
      await resolveLocator(page, step.target.primary).hover();
      break;
    case 'fill': {
      const name = step.variable?.name ?? step.secret?.environmentVariable;
      const value = name ? variables[name] : step.value;
      if (value === undefined || (name !== undefined && value === ''))
        throw new Error(`Missing required variable: ${name ?? 'value'}`);
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

export class ServerPlaywrightRunner {
  constructor(private readonly egressPolicy: RunnerEgressPolicy = {}) {}

  async run(options: ServerRunOptions): Promise<ServerRunResult> {
    if (options.source !== undefined) {
      const parsed = parsePlaywright(options.source);
      if (!parsed.error)
        options = {
          ...options,
          steps: reconcilePlaywrightSteps(
            options.steps,
            parsed.steps.map(({ step }) => step),
          ),
        };
    }
    const started = Date.now();
    const exactCodeIndex = options.steps.findIndex((step) => step.kind === 'code');
    const sourceError = playwrightReplayError(options.source);
    if (sourceError || exactCodeIndex >= 0) {
      const error =
        sourceError ??
        'This test contains exact Playwright code. Complete-spec execution is not available yet.';
      return {
        status: 'failed',
        durationMs: Date.now() - started,
        error,
        screenshotPath: null,
        videoPath: null,
        steps:
          exactCodeIndex < 0
            ? []
            : [
                {
                  index: exactCodeIndex,
                  action: presentStep(options.steps[exactCodeIndex]!),
                  status: 'failed',
                  durationMs: 0,
                  error,
                  pageUrl: null,
                },
              ],
      };
    }
    const { chromium, expect } = await import('@playwright/test');
    await mkdir(options.artifactsDirectory, { recursive: true });
    const screenshotPath = path.join(options.artifactsDirectory, 'failure.png');
    const videoPath = path.join(options.artifactsDirectory, 'failure.webm');
    const videoDirectory = path.join(options.artifactsDirectory, '.video');
    await Promise.all([
      rm(screenshotPath, { force: true }),
      rm(videoPath, { force: true }),
      rm(videoDirectory, { recursive: true, force: true }),
    ]);
    const proxy = new RunnerEgressProxy(options.environmentUrl, this.egressPolicy);
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    const results: ServerRunStepResult[] = [];
    let status: ServerRunResult['status'] = 'passed';
    let runError: string | null = null;
    let screenshot: string | null = null;
    let video: string | null = null;
    let page: Page | undefined;
    let capturedStorageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
    try {
      const proxyUrl = await proxy.start();
      browser = await chromium.launch({
        headless: true,
        proxy: { server: proxyUrl, bypass: '<-loopback>' },
        args: [
          '--disable-quic',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        ],
      });
      context = await browser.newContext({
        serviceWorkers: 'block',
        ...(options.storageState ? { storageState: options.storageState } : {}),
        ...(options.captureArtifacts === false ? {} : { recordVideo: { dir: videoDirectory } }),
      });
      if (options.cookies?.length) await context.addCookies(options.cookies);
      page = await context.newPage();
      if (options.headers) {
        const origin = new URL(options.headers.origin).origin;
        await page.route('**/*', async (route) => {
          const headers = { ...route.request().headers() };
          if (new URL(route.request().url()).origin === origin)
            Object.assign(headers, options.headers!.values);
          await route.continue({ headers });
        });
      }
      for (let index = 0; index < options.steps.length; index += 1) {
        const step = options.steps[index]!;
        const stepStarted = Date.now();
        const remainingMs = options.timeoutMs - (stepStarted - started);
        if (remainingMs <= 0) {
          status = 'timedOut';
          runError = 'The server test run timed out.';
          break;
        }
        context.setDefaultTimeout(remainingMs);
        page.setDefaultNavigationTimeout(remainingMs);
        try {
          await executeStep(
            page,
            step,
            options.environmentVariables,
            expect.configure({ timeout: remainingMs }),
          );
          results.push({
            index,
            action: presentStep(step),
            status: 'passed',
            durationMs: Date.now() - stepStarted,
            error: null,
            pageUrl: page.url() || null,
          });
        } catch (error) {
          const message = stripVTControlCharacters(
            error instanceof Error ? error.message : String(error),
          ).slice(0, 10_000);
          results.push({
            index,
            action: presentStep(step),
            status: 'failed',
            durationMs: Date.now() - stepStarted,
            error: message,
            pageUrl: page.url() || null,
          });
          const timedOut = Date.now() - started >= options.timeoutMs;
          status = timedOut ? 'timedOut' : 'failed';
          runError = timedOut ? 'The server test run timed out.' : message;
          if (options.captureArtifacts !== false)
            screenshot = await page
              .screenshot({ path: screenshotPath, fullPage: true })
              .then(() => screenshotPath)
              .catch(() => null);
          break;
        }
      }
      if (status === 'passed' && options.captureStorageState)
        capturedStorageState = await context.storageState({ indexedDB: true });
    } catch (error) {
      const timedOut = Date.now() - started >= options.timeoutMs;
      status = timedOut ? 'timedOut' : 'failed';
      runError = stripVTControlCharacters(
        timedOut
          ? 'The server test run timed out.'
          : error instanceof Error
            ? error.message
            : String(error),
      ).slice(0, 10_000);
    } finally {
      const recordedVideo = page?.video();
      await context?.close().catch(() => undefined);
      if (status !== 'passed' && recordedVideo && options.captureArtifacts !== false)
        video = await recordedVideo
          .saveAs(videoPath)
          .then(() => videoPath)
          .catch(() => null);
      await browser?.close().catch(() => undefined);
      await proxy.close();
      await rm(videoDirectory, { recursive: true, force: true });
    }
    return {
      status,
      durationMs: Date.now() - started,
      error: runError,
      screenshotPath: screenshot,
      videoPath: video,
      steps: results,
      ...(capturedStorageState ? { storageState: capturedStorageState } : {}),
    };
  }
}
