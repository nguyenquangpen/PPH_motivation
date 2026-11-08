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

export const XpSourceType = ['TASK', 'POOL', 'MILESTONE', 'GOAL', 'REDEMPTION', 'INTEGRATION_EVENT'] as const;
export type XpSourceType = (typeof XpSourceType)[number];

export const MilestoneCondition = ['CONTRIBUTION_THRESHOLD', 'LINKED_TASKS'] as const;
export type MilestoneCondition = (typeof MilestoneCondition)[number];

export const MilestoneStatus = ['PENDING', 'COMPLETED'] as const;
export type MilestoneStatus = (typeof MilestoneStatus)[number];

export const UnlockType = ['LEVEL', 'MILESTONE_COMPLETED', 'GOAL_COMPLETED'] as const;
export type UnlockType = (typeof UnlockType)[number];

export const NotificationType = [
  'TASK_MISSED', 'TASK_DEADLINE_SOON', 'GOAL_REACHED_100', 'GOAL_BEHIND', 'GOAL_NEAR_DUE',
  'MILESTONE_COMPLETED', 'LEVEL_UP', 'POOL_REWARD', 'CALENDAR_SYNC_ERROR', 'CALENDAR_EVENT_DELETED', 'EXTERNAL_APP_INACTIVE',
] as const;
export type NotificationType = (typeof NotificationType)[number];

export const MissedReviewAction = ['RESCHEDULE', 'CANCEL', 'KEEP'] as const;
export type MissedReviewAction = (typeof MissedReviewAction)[number];

/**
 * Activity log types (activity_log.type). Taken from every `activity.log({ type })` call in apps/server/src;
 * ledger logs `XP_${XpTxType}` for each XP transaction.
 */
export const ActivityType = [
  'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED',
  'GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_TARGET_CHANGED', 'GOAL_STATUS_CHANGED', 'GOAL_PROGRESS', 'GOAL_COMPLETED', 'GOAL_DELETED',
  'MILESTONE_CREATED', 'MILESTONE_UPDATED', 'MILESTONE_COMPLETED', 'MILESTONE_REOPENED', 'MILESTONE_DELETED',
  'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_UNDONE', 'TASK_CANCELLED', 'TASK_DELETED', 'TASK_RESCHEDULED',
  'TASK_REASON_CHANGED', 'TASK_PENALIZED', 'TASK_PENALTY_REVERSED',
  'REASON_TAG_CREATED', 'REASON_TAG_UPDATED', 'REASON_TAG_DELETED',
  'XP_TASK_REWARD', 'XP_POOL_REWARD', 'XP_MILESTONE_REWARD', 'XP_GOAL_REWARD', 'XP_REWARD_REVERSAL',
  'XP_REDEEM', 'XP_REDEEM_REVERSAL', 'XP_PENALTY', 'XP_PENALTY_REVERSAL', 'LEVEL_UP',
  'SHOP_ITEM_CREATED', 'SHOP_ITEM_UPDATED', 'SHOP_ITEM_DELETED', 'REDEMPTION_CREATED', 'REDEMPTION_REVERSED',
  'STREAK_FREEZE_USED', 'CHECKIN_CREATED', 'CHECKIN_UPDATED', 'SETTINGS_CHANGED',
] as const;
export type ActivityType = (typeof ActivityType)[number];
