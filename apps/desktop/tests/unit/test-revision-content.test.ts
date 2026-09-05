import { expect, it } from 'vitest';
import type { TestRevisionContent } from '@testron/protocol';
import { editedTestRevisionContent } from '../../src/main/persistence/test-revision-content';

it('preserves the target revision profile for delayed source edits and conflict retries', () => {
  const target: TestRevisionContent = {
    stepSchemaVersion: 1,
    title: 'A',
    environmentIds: ['environment-a'],
    prerequisites: ['setup-a'],
    steps: [],
    source: 'original',
    profileId: 'profile-a',
  };
  const edit = {
    title: 'Edited A',
    environmentIds: target.environmentIds,
    steps: [],
    source: 'edited',
  };
  const saved = editedTestRevisionContent(target, edit);
  expect(saved).toEqual({ ...target, title: 'Edited A', source: 'edited' });
  expect(
    editedTestRevisionContent({ ...target, profileId: 'newer-server-profile' }, edit).profileId,
  ).toBe('newer-server-profile');
  expect(
    editedTestRevisionContent(target, { ...edit, profileId: 'chosen-profile' }).profileId,
  ).toBe('chosen-profile');
  expect(editedTestRevisionContent(target, { ...edit, profileId: null }).profileId).toBeNull();
  expect(target.source).toBe('original');
});
