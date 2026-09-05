import type { Step } from '@testron/domain/steps/schema';

export interface StepReplaySnapshot {
  status: 'idle' | 'syncing' | 'synced' | 'failed';
  selectedIndex?: number;
  appliedIndex: number;
  error?: string;
}

export interface StepReplayDriver {
  reset: (signal: AbortSignal) => Promise<void>;
  execute: (step: Step, signal: AbortSignal) => Promise<void>;
  highlight: (step: Step | undefined) => Promise<void>;
}

const key = (step: Step) =>
  JSON.stringify(step, (name, value) =>
    ['metadata', 'alternatives', 'warnings'].includes(name) ? undefined : value,
  );

/** Serializes browser effects. A superseded request must finish before a reset can start. */
export class StepReplay {
  private generation = 0;
  private abort?: AbortController;
  private tail = Promise.resolve();
  private applied: string[] | undefined;
  private state: StepReplaySnapshot = { status: 'idle', appliedIndex: -1 };

  constructor(
    private readonly driver: StepReplayDriver,
    private readonly changed: (state: StepReplaySnapshot) => void,
  ) {}

  snapshot(): StepReplaySnapshot {
    return { ...this.state };
  }

  invalidate(): void {
    this.generation++;
    this.abort?.abort();
    this.applied = undefined;
    this.publish({ status: 'idle', appliedIndex: -1 });
  }

  select(steps: readonly Step[], index: number): Promise<void> {
    if (!Number.isInteger(index) || index < -1 || index >= steps.length) return Promise.resolve();
    const prefix = structuredClone(steps.slice(0, index + 1));
    const generation = ++this.generation;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const current = () => generation === this.generation;
    this.publish({
      status: 'syncing',
      selectedIndex: index,
      appliedIndex: this.state.appliedIndex,
    });
    const operation = this.tail.then(async () => {
      if (!current()) return;
      try {
        if (prefix.some((step) => step.kind === 'code'))
          throw new Error('Cannot replay through exact code. Select a structured step before it.');
        const keys = prefix.map(key);
        const canAdvance =
          this.applied !== undefined &&
          this.applied.length <= keys.length &&
          this.applied.every((value, position) => value === keys[position]);
        if (!canAdvance) {
          this.applied = undefined;
          this.publish({ status: 'syncing', selectedIndex: index, appliedIndex: -1 });
          await this.driver.reset(abort.signal);
          if (!current()) return;
          this.applied = [];
        }
        for (let position = this.applied!.length; position < prefix.length; position++) {
          await this.driver.execute(prefix[position]!, abort.signal);
          if (!current()) {
            this.applied = undefined;
            return;
          }
          this.applied!.push(keys[position]!);
          this.publish({ status: 'syncing', selectedIndex: index, appliedIndex: position });
        }
        await this.driver.highlight(prefix.at(-1));
        if (!current()) {
          this.applied = undefined;
          return;
        }
        this.publish({ status: 'synced', selectedIndex: index, appliedIndex: index });
      } catch (error) {
        this.applied = undefined;
        if (current())
          this.publish({
            status: 'failed',
            selectedIndex: index,
            appliedIndex: this.state.appliedIndex,
            error: error instanceof Error ? error.message : String(error),
          });
      }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  private publish(state: StepReplaySnapshot): void {
    this.state = state;
    this.changed(this.snapshot());
  }
}
