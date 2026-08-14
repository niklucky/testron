import { generatePlaywright } from '../../domain/codegen/playwright';
import { RecorderNormalizer } from '../../domain/recording/normalizer';
import type { RecorderCandidate } from '../../domain/recording/schema';
import { presentStep } from '../../domain/steps/present';
import { stepsSchema, type Step } from '../../domain/steps/schema';

export interface RecordingSnapshot {
  recording: boolean;
  currentUrl: string;
  steps: Step[];
  descriptions: string[];
  source: string;
  warning?: string;
}

export class RecordingSession {
  private recording = false;
  private currentUrl = '';
  private steps: Step[] = [];
  private lastClickAt = 0;
  private readonly normalizer: RecorderNormalizer;

  constructor(private readonly changed: (snapshot: RecordingSnapshot) => void) {
    this.normalizer = new RecorderNormalizer((step) => {
      this.steps.push(step);
      if (step.kind === 'click') this.lastClickAt = Date.now();
      this.notify();
    });
  }

  start(): void {
    this.normalizer.dispose();
    this.steps = [];
    this.recording = true;
    this.notify();
  }

  stop(): void {
    this.normalizer.flush();
    this.recording = false;
    this.notify();
  }

  accept(candidate: RecorderCandidate): void {
    if (!this.recording) return;
    if (candidate.kind === 'unsupported') {
      this.warn(candidate.message);
      return;
    }
    this.normalizer.accept(candidate);
  }

  navigated(url: string): void {
    this.currentUrl = url;
    if (!this.recording) {
      this.notify();
      return;
    }

    this.normalizer.flush();
    const clickCausedNavigation = Date.now() - this.lastClickAt < 2_000;
    if (!clickCausedNavigation) {
      this.steps.push({
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
      recording: this.recording,
      currentUrl: this.currentUrl,
      steps,
      descriptions: steps.map(presentStep),
      source: generatePlaywright('recorded login flow', steps),
      ...(warning ? { warning } : {}),
    };
  }

  private notify(warning?: string): void {
    this.changed(this.snapshot(warning));
  }
}
