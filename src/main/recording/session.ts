import { generatePlaywright } from '../../domain/codegen/playwright';
import { RecorderNormalizer } from '../../domain/recording/normalizer';
import type { RecorderCandidate } from '../../domain/recording/schema';
import { presentStep } from '../../domain/steps/present';
import { stepsSchema, type Step } from '../../domain/steps/schema';

export interface RecordingSnapshot {
  recording: boolean;
  status: 'idle' | 'recording' | 'paused' | 'finished';
  currentUrl: string;
  steps: Step[];
  descriptions: string[];
  source: string;
  warning?: string;
}

export class RecordingSession {
  private status: RecordingSnapshot['status'] = 'idle';
  private currentUrl = '';
  private steps: Step[] = [];
  private title = 'Untitled test';
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

  load(title: string, steps: readonly Step[]): void {
    this.normalizer.dispose();
    this.title = title;
    this.steps = stepsSchema.parse(steps);
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
      ...(warning ? { warning } : {}),
    };
  }

  private notify(warning?: string): void {
    this.changed(this.snapshot(warning));
  }
}
