import type { ProjectActivity } from '@testron/protocol';

import type { IconName, Tone } from '../design';

export type PresentedActivity = {
  id: string;
  icon: IconName;
  tone: Tone;
  title: string;
  detail: string;
  minutesAgo: number;
};

const actorName = (activity: ProjectActivity) => activity.actor.name ?? activity.actor.email;
const AUTHORING_IDLE_MINUTES = 15;

type ActivityGroup = {
  activity: ProjectActivity;
  count: number;
  oldestAt: number;
};

const groupAuthoringSessions = (activities: readonly ProjectActivity[]): ActivityGroup[] => {
  const groups: ActivityGroup[] = [];
  const sorted = [...activities].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
  for (const activity of sorted) {
    const createdAt = Date.parse(activity.createdAt);
    const group =
      activity.action === 'test.updated'
        ? groups.find(
            (candidate) =>
              candidate.activity.action === activity.action &&
              candidate.activity.projectId === activity.projectId &&
              candidate.activity.actor.id === activity.actor.id &&
              candidate.activity.entity.id === activity.entity.id &&
              candidate.oldestAt - createdAt <= AUTHORING_IDLE_MINUTES * 60_000,
          )
        : undefined;
    if (group) {
      group.count += 1;
      group.oldestAt = createdAt;
    } else {
      groups.push({ activity, count: 1, oldestAt: createdAt });
    }
  }
  return groups;
};

export const presentProjectActivity = (
  activities: readonly ProjectActivity[],
  now = new Date(),
): PresentedActivity[] =>
  groupAuthoringSessions(activities).map(({ activity, count }) => {
    const actor = actorName(activity);
    const common = {
      id: activity.id,
      title: activity.entity.label,
      minutesAgo: Math.max(
        0,
        Math.floor((now.getTime() - Date.parse(activity.createdAt)) / 60_000),
      ),
    };
    switch (activity.action) {
      case 'member.invited':
        return { ...common, icon: 'plus', tone: 'accent', detail: `Invited by ${actor}` };
      case 'member.invitationAccepted':
        return {
          ...common,
          icon: 'check',
          tone: 'good',
          detail: `Invitation accepted by ${actor}`,
        };
      case 'test.created':
        return { ...common, icon: 'plus', tone: 'good', detail: `Test created by ${actor}` };
      case 'test.updated':
        return {
          ...common,
          icon: 'pencil',
          tone: 'warning',
          detail:
            count === 1 ? `Test updated by ${actor}` : `Test updated ${count} times by ${actor}`,
        };
      case 'test.deleted':
        return { ...common, icon: 'trash', tone: 'critical', detail: `Test deleted by ${actor}` };
      case 'testSuite.created':
        return { ...common, icon: 'plus', tone: 'good', detail: `Suite created by ${actor}` };
      case 'testSuite.updated':
        return {
          ...common,
          icon: 'pencil',
          tone: 'warning',
          detail: `Suite updated by ${actor}`,
        };
      case 'testSuite.deleted':
        return {
          ...common,
          icon: 'trash',
          tone: 'critical',
          detail: `Suite deleted by ${actor}`,
        };
    }
  });
