import { generatePlaywright } from '@testron/domain/codegen/playwright';
import {
  parsePlaywright,
  renamePlaywrightTestSource,
  rewritePlaywrightSteps,
  type ParsedPlaywrightStep,
} from '@testron/domain/codegen/parse-playwright';
import type { Target } from '@testron/domain/locators/schema';
import { RecorderNormalizer } from '@testron/domain/recording/normalizer';
import type { RecorderCandidate } from '@testron/domain/recording/schema';
import { presentStep } from '@testron/domain/steps/present';
import {
  redactStepSecrets,
  stepSchema,
  stepsSchema,
  type Step,
} from '@testron/domain/steps/schema';

export interface RecordingSnapshot {
  title: string;
  recording: boolean;
  status: 'idle' | 'recording' | 'paused' | 'finished';
  currentUrl: string;
  steps: Step[];
  descriptions: string[];
  source: string;
  captureMode: 'record' | 'hover' | 'verify';
  stepWarnings: string[][];
  canUndo: boolean;
  canRedo: boolean;
  warning?: string;
}

export class RecordingSession {
  private status: RecordingSnapshot['status'] = 'idle';
  private currentUrl = '';
  private steps: Step[] = [];
  private source = generatePlaywright('Untitled test', []);
  private parsedSteps: ParsedPlaywrightStep[] = [];
  private pastSources: string[] = [];
  private futureSources: string[] = [];
  private title = 'Untitled test';
  private captureMode: RecordingSnapshot['captureMode'] = 'record';
  private lastNavigationActionAt = 0;
  private readonly normalizer: RecorderNormalizer;

  constructor(
    private readonly changed: (snapshot: RecordingSnapshot) => void,
    private readonly stepsChanged: (
      steps: readonly Step[],
      source: string,
      title: string,
    ) => void = () => undefined,
  ) {
    this.normalizer = new RecorderNormalizer((step) => {
      this.insertStep(step);
      if (['click', 'hover', 'selectOption', 'check', 'uncheck', 'press'].includes(step.kind))
        this.lastNavigationActionAt = Date.now();
      this.notify();
    });
  }

  start(append = false): void {
    this.normalizer.dispose();
    if (!append)
      this.steps = this.currentUrl
        ? [
            {
              version: 1,
              kind: 'navigate',
              url: this.currentUrl,
              metadata: { recordedAt: new Date().toISOString() },
            },
          ]
        : [];
    if (!append) this.setCanonicalSource(generatePlaywright(this.title, this.steps), false);
    this.futureSources = [];
    this.status = 'recording';
    this.captureMode = 'record';
    this.stepsChanged(this.steps, this.source, this.title);
    this.notify();
  }

  stop(): void {
    this.finish();
  }

  pause(): void {
    this.normalizer.flush();
    this.status = 'paused';
    this.notify();
  }

  resume(): void {
    this.status = 'recording';
    this.notify();
  }

  setCaptureMode(mode: RecordingSnapshot['captureMode']): void {
    this.normalizer.flush();
    this.captureMode = mode;
    this.notify();
  }

  addUrlAssertion(expected: string): void {
    this.normalizer.flush();
    this.insertStep({
      version: 1,
      kind: 'assertUrlPath',
      expected,
      metadata: { recordedAt: new Date().toISOString() },
    });
    this.notify();
  }

  finish(): void {
    this.normalizer.flush();
    this.status = 'finished';
    this.notify();
  }

  undo(): void {
    this.normalizer.flush();
    const previous = this.pastSources.pop();
    if (previous === undefined) return;
    this.futureSources.push(this.source);
    this.setCanonicalSource(previous, true);
    this.notify();
  }

  redo(): void {
    this.normalizer.flush();
    const next = this.futureSources.pop();
    if (next === undefined) return;
    this.pastSources.push(this.source);
    this.setCanonicalSource(next, true);
    this.notify();
  }

  deleteStep(index: number): void {
    this.normalizer.flush();
    const parsed = this.parsedSteps[index];
    if (!parsed) return;
    this.replaceRange(parsed.start, parsed.end, '');
    this.notify();
  }

  moveStep(index: number, direction: -1 | 1): void {
    this.normalizer.flush();
    const destination = index + direction;
    if (
      index < 0 ||
      destination < 0 ||
      index >= this.steps.length ||
      destination >= this.steps.length
    )
      return;
    const first = this.parsedSteps[Math.min(index, destination)];
    const second = this.parsedSteps[Math.max(index, destination)];
    if (!first || !second) return;
    const firstText = this.source.slice(first.start, first.end);
    const between = this.source.slice(first.end, second.start);
    const secondText = this.source.slice(second.start, second.end);
    this.pushSource(
      `${this.source.slice(0, first.start)}${secondText}${between}${firstText}${this.source.slice(second.end)}`,
    );
    this.notify();
  }

  duplicateStep(index: number): void {
    this.normalizer.flush();
    if (!this.steps[index]) return;
    const parsed = this.parsedSteps[index];
    if (!parsed) return;
    this.replaceRange(parsed.end, parsed.end, `\n${this.source.slice(parsed.start, parsed.end)}`);
    this.notify();
  }

  updateStep(index: number, step: Step): void {
    this.normalizer.flush();
    if (!this.steps[index]) return;
    const parsed = this.parsedSteps[index];
    if (!parsed) return;
    const replacement = this.stepStatement(redactStepSecrets(stepSchema.parse(step)));
    this.replaceRange(parsed.start, parsed.end, replacement);
    this.notify();
  }

  replaceSteps(steps: readonly Step[]): void {
    this.normalizer.flush();
    this.pushSource(
      rewritePlaywrightSteps(this.source, stepsSchema.parse(steps).map(redactStepSecrets)),
    );
    this.notify();
  }

  useAlternativeLocator(index: number, alternativeIndex: number): void {
    const step = this.steps[index];
    if (!step || !('target' in step)) return;
    const replacement = step.target.alternatives[alternativeIndex];
    if (!replacement) return;
    const alternatives = [
      step.target.primary,
      ...step.target.alternatives.filter(
        (_, candidateIndex) => candidateIndex !== alternativeIndex,
      ),
    ];
    this.updateStep(index, {
      ...step,
      target: { primary: replacement, alternatives },
    });
  }

  repickTarget(index: number, target: Target): void {
    const step = this.steps[index];
    if (!step || !('target' in step)) return;
    this.updateStep(index, { ...step, target });
  }

  load(title: string, steps: readonly Step[], source?: string): void {
    this.normalizer.dispose();
    this.title = title;
    this.steps = stepsSchema.parse(steps).map(redactStepSecrets);
    this.setCanonicalSource(source?.trim() ? source : generatePlaywright(title, this.steps), false);
    this.pastSources = [];
    this.futureSources = [];
    this.status = 'idle';
    this.notify();
  }

  setGenerationContext(title: string): void {
    const renamed = renamePlaywrightTestSource(this.source, title);
    if (renamed !== this.source) this.pushSource(renamed);
    else this.title = title;
    this.notify();
  }

  updateSource(source: string): void {
    this.normalizer.flush();
    this.pushSource(source);
  }

  accept(candidate: RecorderCandidate): void {
    if (this.status !== 'recording') return;
    if (candidate.kind === 'unsupported') {
      this.warn(candidate.message);
      return;
    }
    this.normalizer.accept(candidate);
  }

  navigated(url: string): void {
    this.currentUrl = url;
    if (this.status !== 'recording') {
      this.notify();
      return;
    }

    this.normalizer.flush();
    const actionCausedNavigation = Date.now() - this.lastNavigationActionAt < 2_000;
    if (!actionCausedNavigation) {
      this.insertStep({
        version: 1,
        kind: 'navigate',
        url,
        metadata: { recordedAt: new Date().toISOString() },
      });
    }
    this.notify();
  }

  warn(warning: string): void {
    this.notify(warning);
  }

  snapshot(warning?: string): RecordingSnapshot {
    const steps = stepsSchema.parse(this.steps);
    return {
      title: this.title,
      recording: this.status === 'recording',
      status: this.status,
      currentUrl: this.currentUrl,
      steps,
      descriptions: steps.map(presentStep),
      source: this.source,
      captureMode: this.captureMode,
      stepWarnings: steps.map((step) => {
        if (!('target' in step)) return [];
        return [
          ...(step.target.warnings ?? []),
          ...(step.target.primary.strategy === 'css' &&
          !(step.target.warnings ?? []).some((warning) => warning.includes('fragile'))
            ? ['Primary locator is a fragile CSS fallback.']
            : []),
        ];
      }),
      canUndo: this.pastSources.length > 0,
      canRedo: this.futureSources.length > 0,
      ...(warning ? { warning } : {}),
    };
  }

  private notify(warning?: string): void {
    this.changed(this.snapshot(warning));
  }

  private stepStatement(step: Step): string {
    if (step.kind === 'code') return step.code;
    const generated = generatePlaywright(this.title, [step]);
    return (
      generated
        .split('\n')
        .find((line) => /^ {2}await /.test(line))
        ?.trim() ?? step.kind
    );
  }

  private insertStep(step: Step): void {
    const closing = this.source.lastIndexOf('\n});');
    if (closing < 0) {
      this.pushSource(generatePlaywright(this.title, [...this.steps, step]));
      return;
    }
    this.replaceRange(closing, closing, `\n  ${this.stepStatement(step)}`);
  }

  private replaceRange(start: number, end: number, replacement: string): void {
    this.pushSource(`${this.source.slice(0, start)}${replacement}${this.source.slice(end)}`);
  }

  private pushSource(source: string): void {
    this.pastSources.push(this.source);
    this.futureSources = [];
    this.setCanonicalSource(source, true);
  }

  private setCanonicalSource(source: string, persist: boolean): void {
    this.source = source;
    const parsed = parsePlaywright(source);
    if (!parsed.error) {
      this.title = parsed.title;
      this.parsedSteps = parsed.steps;
      const previousSteps = this.steps;
      const unused = new Set(previousSteps.map((_, index) => index));
      const semanticKey = (step: Step): string =>
        JSON.stringify(step, (key, value) =>
          ['metadata', 'alternatives', 'warnings'].includes(key) ? undefined : value,
        );
      this.steps = parsed.steps.map(({ step }, index) => {
        const exactIndex = previousSteps.findIndex(
          (candidate, candidateIndex) =>
            unused.has(candidateIndex) && semanticKey(candidate) === semanticKey(step),
        );
        const previousIndex = exactIndex >= 0 ? exactIndex : unused.has(index) ? index : -1;
        const previous = previousIndex >= 0 ? previousSteps[previousIndex] : undefined;
        if (previousIndex >= 0) unused.delete(previousIndex);
        const target =
          previous &&
          'target' in previous &&
          'target' in step &&
          JSON.stringify(previous.target.primary) === JSON.stringify(step.target.primary)
            ? {
                ...step.target,
                alternatives: previous.target.alternatives,
                warnings: previous.target.warnings,
              }
            : 'target' in step
              ? step.target
              : undefined;
        return redactStepSecrets(
          previous && previous.kind === step.kind
            ? { ...step, ...(target ? { target } : {}), metadata: previous.metadata }
            : step,
        );
      });
    } else {
      this.notify(
        `Source has a syntax error; showing the last valid manual steps. ${parsed.error}`,
      );
    }
    if (persist) this.stepsChanged(this.steps, this.source, this.title);
  }
}
