import type { TestRevisionContent } from '@testron/protocol';

type RevisionEdit = Pick<TestRevisionContent, 'title' | 'environmentIds' | 'steps'> & {
  prerequisites?: readonly string[];
  source?: string;
  profileId?: string | null;
};

/** Apply a queued edit to its target's latest revision, independent of the active test. */
export const editedTestRevisionContent = (
  current: TestRevisionContent,
  edit: RevisionEdit,
): TestRevisionContent => ({
  ...current,
  title: edit.title,
  environmentIds: edit.environmentIds,
  steps: edit.steps,
  prerequisites: edit.prerequisites ? [...edit.prerequisites] : current.prerequisites,
  source: edit.source ?? current.source,
  profileId: edit.profileId === undefined ? current.profileId : edit.profileId,
});
