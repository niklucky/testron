import { describe, expect, it } from 'vitest';

import type { ProjectActivity } from '@testron/protocol';
import { presentProjectActivity } from '../../src/renderer/dashboard/activity';

const event = (
  id: string,
  action: ProjectActivity['action'],
  label: string,
  createdAt: string,
): ProjectActivity => ({
  id,
  projectId: '00000000-0000-4000-8000-000000000001',
  actor: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'owner@example.test',
    name: 'Test Owner',
  },
  action,
  entity: {
    type: action.startsWith('testSuite') ? 'testSuite' : 'test',
    id: '00000000-0000-4000-8000-000000000003',
    label,
  },
  createdAt,
});

describe('dashboard recent activity', () => {
  it('orders server events newest-first and presents retained entity labels', () => {
    const items = presentProjectActivity(
      [
        event(
          '00000000-0000-4000-8000-000000000010',
          'test.created',
          'Old name',
          '2026-08-20T09:00:00Z',
        ),
        event(
          '00000000-0000-4000-8000-000000000011',
          'test.deleted',
          'Renamed test',
          '2026-08-20T09:55:00Z',
        ),
      ],
      new Date('2026-08-20T10:00:00Z'),
    );

    expect(items.map((item) => item.title)).toEqual(['Renamed test', 'Old name']);
    expect(items[0]).toMatchObject({
      tone: 'critical',
      detail: 'Test deleted by Test Owner',
      minutesAgo: 5,
    });
  });

  it('collapses step-level test updates into authoring sessions', () => {
    const items = presentProjectActivity(
      [
        event(
          '00000000-0000-4000-8000-000000000020',
          'test.updated',
          'Checkout',
          '2026-08-20T09:55:00Z',
        ),
        event(
          '00000000-0000-4000-8000-000000000021',
          'test.updated',
          'Checkout',
          '2026-08-20T09:50:00Z',
        ),
        event(
          '00000000-0000-4000-8000-000000000022',
          'test.updated',
          'Checkout',
          '2026-08-20T09:40:00Z',
        ),
        event(
          '00000000-0000-4000-8000-000000000023',
          'test.updated',
          'Checkout',
          '2026-08-20T09:20:00Z',
        ),
      ],
      new Date('2026-08-20T10:00:00Z'),
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Checkout',
      detail: 'Test updated 3 times by Test Owner',
      minutesAgo: 5,
    });
  });
});
