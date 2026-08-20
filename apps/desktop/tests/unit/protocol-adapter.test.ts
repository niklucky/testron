import { describe, expect, it } from 'vitest';

import { saveTestRevisionRequestSchema, type TestSnapshot } from '@testron/protocol';
import {
  fromTestSnapshot,
  toCreateTestRequest,
  toSaveTestRevisionRequest,
} from '../../src/main/sync/protocol-adapter';

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const now = '2026-01-01T00:00:00.000Z';

describe('desktop protocol adapter', () => {
  it('redacts local secrets and assigns stable IDs when making the first revision', () => {
    const request = toCreateTestRequest(
      {
        id: id('1'),
        projectId: id('2'),
        environmentId: id('3'),
        title: 'sign in',
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          version: 1,
          kind: 'fill',
          target: { primary: { strategy: 'name', value: 'password' }, alternatives: [] },
          value: 'local-only-secret',
          secret: { environmentVariable: 'TESTRON_PASSWORD' },
          metadata: { recordedAt: now },
        },
      ],
      { requestId: id('4'), idempotencyKey: 'create-test-0001', clientVersion: '0.0.1' },
      () => id('5'),
    );

    expect(request.content.steps[0].id).toBe(id('5'));
    expect(request.content.steps[0].payload).toMatchObject({ value: '' });
    expect(JSON.stringify(request)).not.toContain('local-only-secret');
  });

  it('imports a canonical snapshot and writes against exactly its acknowledged revision', () => {
    const snapshot: TestSnapshot = {
      test: {
        id: id('11'),
        projectId: id('12'),
        testSuiteId: null,
        currentRevision: { id: id('13'), number: 4 },
        createdAt: now,
        createdBy: id('14'),
        deletion: { status: 'active' },
      },
      currentRevision: {
        id: id('13'),
        testId: id('11'),
        projectId: id('12'),
        number: 4,
        parentRevision: { id: id('15'), number: 3 },
        content: {
          stepSchemaVersion: 1,
          title: 'checkout',
          environmentId: id('16'),
          steps: [
            {
              id: id('17'),
              payload: {
                version: 1,
                kind: 'navigate',
                url: 'https://example.test/',
                metadata: { recordedAt: now },
              },
            },
          ],
        },
        createdAt: now,
        createdBy: id('14'),
      },
    };
    const imported = fromTestSnapshot(snapshot, { draftId: id('18'), acknowledgedAt: now });
    const request = toSaveTestRevisionRequest(imported.draft, {
      requestId: id('19'),
      idempotencyKey: 'save-test-0001',
      clientVersion: '0.0.1',
    });

    expect(imported.record).toMatchObject({ title: 'checkout', environmentId: id('16') });
    expect(imported.steps).toHaveLength(1);
    expect(imported.draft).toMatchObject({
      draftId: id('18'),
      localCreatedAt: now,
      localUpdatedAt: now,
    });
    expect(request.baseRevision).toEqual({ id: id('13'), number: 4 });
    expect(request.content.steps[0].id).toBe(id('17'));
    expect(saveTestRevisionRequestSchema.parse(request)).toEqual(request);
  });
});
