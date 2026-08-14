import type { ActionCandidate } from './schema';
import type { Step } from '../steps/schema';

interface BufferedInput {
  candidate: Extract<ActionCandidate, { kind: 'input' }>;
}

type TargetedCandidate = Extract<ActionCandidate, { kind: 'click' | 'input' }>;

const targetFrom = (candidate: TargetedCandidate) => ({
  primary: candidate.target.locators[0],
  alternatives: candidate.target.locators.slice(1),
});

export class RecorderNormalizer {
  private readonly inputs = new Map<string, BufferedInput>();

  constructor(private readonly emit: (step: Step) => void) {}

  accept(candidate: ActionCandidate): void {
    if (candidate.kind === 'input-commit') {
      this.flushInput(candidate.fingerprint);
      return;
    }

    if (candidate.kind === 'input') {
      this.bufferInput(candidate);
      return;
    }

    this.flush();
    this.emit({
      version: 1,
      kind: 'click',
      target: targetFrom(candidate),
      metadata: { recordedAt: new Date().toISOString() },
    });
  }

  flush(): void {
    for (const fingerprint of [...this.inputs.keys()]) this.flushInput(fingerprint);
  }

  dispose(): void {
    this.inputs.clear();
  }

  private bufferInput(candidate: Extract<ActionCandidate, { kind: 'input' }>): void {
    for (const fingerprint of [...this.inputs.keys()]) {
      if (fingerprint !== candidate.target.fingerprint) this.flushInput(fingerprint);
    }
    this.inputs.set(candidate.target.fingerprint, { candidate });
  }

  private flushInput(fingerprint: string): void {
    const buffered = this.inputs.get(fingerprint);
    if (!buffered) return;

    this.inputs.delete(fingerprint);
    this.emit({
      version: 1,
      kind: 'fill',
      target: targetFrom(buffered.candidate),
      value: buffered.candidate.target.sensitive ? '' : buffered.candidate.value,
      metadata: { recordedAt: new Date().toISOString() },
    });
  }
}
