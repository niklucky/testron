import type { ActionCandidate } from './schema';
import type { Step } from '../steps/schema';

interface BufferedInput {
  candidate: Extract<ActionCandidate, { kind: 'input' }>;
}

type TargetedCandidate = Exclude<ActionCandidate, { kind: 'input-commit' }>;

const targetFrom = (candidate: TargetedCandidate) => ({
  primary: candidate.target.locators[0],
  alternatives: candidate.target.locators.slice(1),
  ...(candidate.target.warnings && candidate.target.warnings.length > 0
    ? { warnings: candidate.target.warnings }
    : {}),
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
    const metadata = { recordedAt: new Date().toISOString() };
    const target = targetFrom(candidate);
    switch (candidate.kind) {
      case 'click':
        this.emit({ version: 1, kind: 'click', target, metadata });
        break;
      case 'select':
        this.emit({ version: 1, kind: 'selectOption', target, value: candidate.value, metadata });
        break;
      case 'check':
        this.emit({ version: 1, kind: candidate.checked ? 'check' : 'uncheck', target, metadata });
        break;
      case 'press':
        this.emit({ version: 1, kind: 'press', target, key: candidate.key, metadata });
        break;
      case 'assertion': {
        const assertion = (() => {
          switch (candidate.assertion) {
            case 'textContains':
              return {
                type: 'text' as const,
                match: 'contains' as const,
                expected: candidate.observedText,
              };
            case 'textEquals':
              return {
                type: 'text' as const,
                match: 'equals' as const,
                expected: candidate.observedText,
              };
            case 'value':
              return { type: 'value' as const, expected: candidate.observedValue };
            case 'countExactly':
              return {
                type: 'count' as const,
                operator: 'equals' as const,
                expected: candidate.observedCount ?? 0,
              };
            case 'countAtLeast':
              return {
                type: 'count' as const,
                operator: 'atLeast' as const,
                expected: candidate.observedCount ?? 0,
              };
            default:
              return { type: candidate.assertion };
          }
        })();
        this.emit({ version: 1, kind: 'assertElement', target, assertion, metadata });
        break;
      }
    }
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
      value: buffered.candidate.target.variableName ? '' : buffered.candidate.value,
      ...(buffered.candidate.target.variableName
        ? { variable: { name: buffered.candidate.target.variableName } }
        : {}),
      metadata: { recordedAt: new Date().toISOString() },
    });
  }
}
