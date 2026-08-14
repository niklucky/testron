import { generatePlaywright } from '../../domain/codegen/playwright';
import { RecorderNormalizer } from '../../domain/recording/normalizer';
import type { RecorderCandidate } from '../../domain/recording/schema';
import { presentStep } from '../../domain/steps/present';
import { redactStepSecrets, stepSchema, stepsSchema, type Step } from '../../domain/steps/schema';

export interface RecordingSnapshot {
  recording: boolean;
  status: 'idle' | 'recording' | 'paused' | 'finished';
  currentUrl: string;
  steps: Step[];
  descriptions: string[];
  source: string;
  captureMode: 'record' | 'verify';
  stepWarnings: string[][];
  warning?: string;
}

export class RecordingSession {
  private status: RecordingSnapshot['status'] = 'idle';
  private currentUrl = '';
  private steps: Step[] = [];
  private title = 'Untitled test';
  private captureMode: RecordingSnapshot['captureMode'] = 'record';
  private lastNavigationActionAt = 0;
  private readonly normalizer: RecorderNormalizer;

  constructor(
    private readonly changed: (snapshot: RecordingSnapshot) => void,
    private readonly stepsChanged: (steps: readonly Step[]) => void = () => undefined,
  ) {
    this.normalizer = new RecorderNormalizer((step) => {
      this.steps.push(step);
      if (['click', 'selectOption', 'check', 'uncheck', 'press'].includes(step.kind))
        this.lastNavigationActionAt = Date.now();
      this.stepsChanged(this.steps);
      this.notify();
    });
  }

  start(): void {
    this.normalizer.dispose();
    this.steps = [];
    this.status = 'recording';
    this.captureMode = 'record';
    this.stepsChanged(this.steps);
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
    this.steps.push({
      version: 1,
      kind: 'assertUrlPath',
      expected,
      metadata: { recordedAt: new Date().toISOString() },
    });
    this.stepsChanged(this.steps);
    this.notify();
  }

  finish(): void {
    this.normalizer.flush();
    this.status = 'finished';
    this.notify();
  }

  undo(): void {
    this.normalizer.flush();
    this.steps.pop();
    this.stepsChanged(this.steps);
    this.notify();
  }

  deleteStep(index: number): void {
    this.normalizer.flush();
    this.steps.splice(index, 1);
    this.stepsChanged(this.steps);
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
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(destination, 0, step);
    this.stepsChanged(this.steps);
    this.notify();
  }

  duplicateStep(index: number): void {
    this.normalizer.flush();
    const step = this.steps[index];
    if (!step) return;
    const copy = stepSchema.parse({
      ...structuredClone(step),
      metadata: { recordedAt: new Date().toISOString() },
    });
    this.steps.splice(index + 1, 0, copy);
    this.stepsChanged(this.steps);
    this.notify();
  }

  updateStep(index: number, step: Step): void {
    this.normalizer.flush();
    if (!this.steps[index]) return;
    this.steps[index] = redactStepSecrets(stepSchema.parse(step));
    this.stepsChanged(this.steps);
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

  load(title: string, steps: readonly Step[]): void {
    this.normalizer.dispose();
    this.title = title;
    this.steps = stepsSchema.parse(steps).map(redactStepSecrets);
    this.status = 'idle';
    this.notify();
  }

  setGenerationContext(title: string): void {
    this.title = title;
    this.notify();
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
      this.steps.push({
        version: 1,
        kind: 'navigate',
        url,
        metadata: { recordedAt: new Date().toISOString() },
      });
      this.stepsChanged(this.steps);
    }
    this.notify();
  }

  warn(warning: string): void {
    this.notify(warning);
  }

  snapshot(warning?: string): RecordingSnapshot {
    const steps = stepsSchema.parse(this.steps);
    return {
      recording: this.status === 'recording',
      status: this.status,
      currentUrl: this.currentUrl,
      steps,
      descriptions: steps.map(presentStep),
      source: generatePlaywright(this.title, steps),
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
      ...(warning ? { warning } : {}),
    };
  }

  private notify(warning?: string): void {
    this.changed(this.snapshot(warning));
  }
}
