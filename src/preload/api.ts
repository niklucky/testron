import type { RecordingSnapshot } from '../main/recording/session';
import type { LibrarySnapshot } from '../main/persistence/repository';

export interface AppSnapshot extends RecordingSnapshot {
  library: LibrarySnapshot;
}

export type AppCommand =
  | { type: 'start-recording' }
  | { type: 'stop-recording' }
  | { type: 'pause-recording' }
  | { type: 'resume-recording' }
  | { type: 'undo-step' }
  | { type: 'finish-recording' }
  | { type: 'delete-step'; index: number }
  | { type: 'move-step'; index: number; direction: -1 | 1 }
  | { type: 'navigate'; url: string }
  | { type: 'request-snapshot' }
  | { type: 'create-project'; name: string }
  | {
      type: 'create-environment';
      projectId: string;
      name: string;
      baseUrl: string;
      testIdAttribute: string;
    }
  | { type: 'create-test'; projectId: string; environmentId: string; title: string }
  | { type: 'select-project'; projectId: string }
  | { type: 'select-environment'; environmentId: string }
  | { type: 'select-test'; testId: string }
  | { type: 'copy-source' }
  | { type: 'export-source' };

export interface TestronApi {
  command(command: AppCommand): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
}
