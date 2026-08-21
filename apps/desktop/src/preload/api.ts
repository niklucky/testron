import type { RecordingSnapshot } from '../main/recording/session';
import type { LibrarySnapshot } from '../main/persistence/repository';
import type { ReplaySnapshot } from '../main/replay/runner';
import type { BrowserInstallationStatus } from '../main/replay/browser-installer';
import type { RecordPanelEvent, RecordPanelState } from './record';
import type { AppCommand, SessionMenuId, VerifyAssertion } from './app-command';

export type { AppCommand, VerifyAssertion } from './app-command';

export interface AppSnapshot extends RecordingSnapshot {
  verifyAssertion: VerifyAssertion;
  repickIndex?: number;
  library: LibrarySnapshot;
  replay: ReplaySnapshot;
  replayHistory: ReplaySnapshot[];
  browserInstallation: BrowserInstallationStatus;
}

export interface TestronApi {
  command(command: AppCommand): void;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  onSessionMenuSelect(
    listener: (selection: { menu: SessionMenuId; id: string }) => void,
  ): () => void;
  onTargetUrl(listener: (url: string) => void): () => void;
  /** Panel views: the state to draw. */
  onRecordState(listener: (state: RecordPanelState) => void): () => void;
  /** Panel views: report an interaction back to the record screen. */
  sendRecordEvent(event: RecordPanelEvent): void;
  /** The record screen: interactions that happened inside a panel view. */
  onRecordEvent(listener: (event: RecordPanelEvent) => void): () => void;
}
