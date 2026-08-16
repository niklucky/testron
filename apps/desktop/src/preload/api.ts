import type { RecordingSnapshot } from '../main/recording/session';
import type { LibrarySnapshot } from '../main/persistence/repository';
import type { Step } from '@testron/domain/steps/schema';
import type { ReplaySnapshot } from '../main/replay/runner';
import type { RecordLayout, RecordPanelEvent, RecordPanelState } from './record';

export type VerifyAssertion =
  | 'visible'
  | 'hidden'
  | 'textContains'
  | 'textEquals'
  | 'value'
  | 'enabled'
  | 'disabled'
  | 'checked'
  | 'unchecked';

export interface AppSnapshot extends RecordingSnapshot {
  library: LibrarySnapshot;
  replay: ReplaySnapshot;
}

export type AppCommand =
  | { type: 'set-shell-route'; route: 'dashboard' | 'recorder' }
  | { type: 'start-recording' }
  | { type: 'stop-recording' }
  | { type: 'pause-recording' }
  | { type: 'resume-recording' }
  | { type: 'undo-step' }
  | { type: 'redo-step' }
  | { type: 'finish-recording' }
  | { type: 'delete-step'; index: number }
  | { type: 'move-step'; index: number; direction: -1 | 1 }
  | { type: 'duplicate-step'; index: number }
  | { type: 'update-step'; index: number; step: Step }
  | { type: 'replace-steps'; steps: Step[] }
  | { type: 'use-alternative-locator'; index: number; alternativeIndex: number }
  | { type: 'set-capture-mode'; mode: 'record' | 'verify'; assertion: VerifyAssertion }
  | { type: 'add-url-path-assertion'; expected: string }
  | { type: 'navigate'; url: string }
  | { type: 'browser-navigation'; action: 'back' | 'forward' | 'reload' | 'stop' }
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
  | { type: 'rename-test'; testId: string; title: string }
  | { type: 'prepare-new-test' }
  | { type: 'save-recording'; title: string; baseUrl: string }
  | { type: 'copy-source' }
  | { type: 'export-source' }
  | {
      type: 'run-test';
      environmentVariables: Record<string, string>;
      timeoutMs: number;
      reuseAuthState: boolean;
    }
  | { type: 'cancel-run' }
  | { type: 'clear-auth-state' }
  /** Where the website view and the two panel views belong in the window. */
  | { type: 'set-record-layout'; layout: RecordLayout }
  /** Everything the panels draw, pushed from the screen that owns it. */
  | { type: 'publish-record-state'; state: RecordPanelState };

export interface TestronApi {
  command(command: AppCommand): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  /** Panel views: the state to draw. */
  onRecordState(listener: (state: RecordPanelState) => void): () => void;
  /** Panel views: report an interaction back to the record screen. */
  sendRecordEvent(event: RecordPanelEvent): void;
  /** The record screen: interactions that happened inside a panel view. */
  onRecordEvent(listener: (event: RecordPanelEvent) => void): () => void;
}
