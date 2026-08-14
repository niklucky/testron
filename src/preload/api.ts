import type { RecordingSnapshot } from '../main/recording/session';

export type AppCommand =
  | { type: 'start-recording' }
  | { type: 'stop-recording' }
  | { type: 'navigate'; url: string }
  | { type: 'request-snapshot' };

export interface TestronApi {
  command(command: AppCommand): void;
  onSnapshot(listener: (snapshot: RecordingSnapshot) => void): () => void;
}
