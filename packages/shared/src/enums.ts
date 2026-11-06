export const GoalStatus = ['NOT_STARTED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
export type GoalStatus = (typeof GoalStatus)[number];

export const TaskStatus = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TaskStatus)[number];

export const Priority = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof Priority)[number];

export const XpTxType = [
  'TASK_REWARD', 'POOL_REWARD', 'MILESTONE_REWARD', 'GOAL_REWARD', 'REWARD_REVERSAL',
  'REDEEM', 'REDEEM_REVERSAL', 'PENALTY', 'PENALTY_REVERSAL',
] as const;
export type XpTxType = (typeof XpTxType)[number];

export const XpSourceType = ['TASK', 'POOL', 'MILESTONE', 'GOAL', 'REDEMPTION'] as const;
export type XpSourceType = (typeof XpSourceType)[number];

export const MilestoneCondition = ['CONTRIBUTION_THRESHOLD', 'LINKED_TASKS'] as const;
export type MilestoneCondition = (typeof MilestoneCondition)[number];

export const MilestoneStatus = ['PENDING', 'COMPLETED'] as const;
export type MilestoneStatus = (typeof MilestoneStatus)[number];

export const UnlockType = ['LEVEL', 'MILESTONE_COMPLETED', 'GOAL_COMPLETED'] as const;
export type UnlockType = (typeof UnlockType)[number];

export const NotificationType = [
  'TASK_MISSED', 'TASK_DEADLINE_SOON', 'GOAL_REACHED_100', 'GOAL_BEHIND', 'GOAL_NEAR_DUE',
  'MILESTONE_COMPLETED', 'LEVEL_UP', 'POOL_REWARD',
] as const;
export type NotificationType = (typeof NotificationType)[number];

export const MissedReviewAction = ['RESCHEDULE', 'CANCEL', 'KEEP'] as const;
export type MissedReviewAction = (typeof MissedReviewAction)[number];
