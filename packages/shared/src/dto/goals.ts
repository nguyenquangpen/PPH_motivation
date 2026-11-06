import { z } from 'zod';
import { GoalStatus, MilestoneCondition, MilestoneStatus } from '../enums.js';
import { Description, IsoDate, NonNegXp, Uuid } from './common.js';

// ---------- Category ----------
export const CreateCategorySchema = z.object({ name: z.string().trim().min(1).max(50), color: z.string().max(30).nullish() });
export const UpdateCategorySchema = CreateCategorySchema.partial();
export type CategoryDto = { id: string; name: string; color: string | null; goalCount: number };

// ---------- Goal ----------
export const CreateGoalSchema = z.object({
  title: z.string().trim().min(1, 'Title bắt buộc').max(200),
  description: Description,
  categoryId: Uuid,
  startDate: IsoDate.nullish(),
  targetDate: IsoDate.nullish(),
  targetContribution: z.number().int().min(1).max(1_000_000),
  goalRewardXp: NonNegXp.nullish(),
  icon: z.string().max(50).nullish(),
  color: z.string().max(30).nullish(),
});
export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;

/** status chỉ nhận NOT_STARTED|ACTIVE|PAUSED|ARCHIVED; COMPLETED → lỗi GOAL_COMPLETE_VIA_ENDPOINT */
export const UpdateGoalSchema = CreateGoalSchema.partial().extend({ status: z.enum(GoalStatus).optional() });
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;

export const CompleteGoalSchema = z.object({ confirmBelow100: z.boolean().optional() });

export type GoalWarning = 'BEHIND' | 'NEAR_DUE';

export type GoalProgressDto = {
  completedContribution: number;
  targetContribution: number;
  progressPercent: number;   // làm tròn xuống 0,1
  displayPercent: number;    // min(progress, 100)
  overflowContribution: number;
  remainingContribution: number;
  expectedPercent: number | null;
  daysRemaining: number | null;
  warnings: GoalWarning[];
};

export type GoalDto = {
  id: string; title: string; description: string | null; categoryId: string; categoryName: string;
  status: GoalStatus; startDate: string | null; targetDate: string | null; targetContribution: number;
  goalRewardXp: number | null; icon: string | null; color: string | null;
  completedAt: string | null; completedContributionSnapshot: number | null; goalRewardGranted: boolean;
  progress: GoalProgressDto; createdAt: string; updatedAt: string;
};

// ---------- Milestone ----------
export const CreateMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: Description,
  targetDate: IsoDate.nullish(),
  conditionType: z.enum(MilestoneCondition),
  threshold: z.number().int().min(1).max(1_000_000).nullish(),
  rewardXp: NonNegXp.nullish(),
});
export const UpdateMilestoneSchema = CreateMilestoneSchema.partial();
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;

export type MilestoneDto = {
  id: string; goalId: string; title: string; description: string | null; targetDate: string | null;
  conditionType: MilestoneCondition; threshold: number | null; rewardXp: number | null; effectiveRewardXp: number;
  status: MilestoneStatus; completedAt: string | null; linkedTaskIds: string[];
};

export type GoalDetailDto = GoalDto & {
  milestones: MilestoneDto[];
  tasksByStatus: Record<string, { id: string; title: string; contribution: number }[]>;
  /** Activity gần nhất của Goal (F-20). */
  activity?: GoalActivityItem[];
};

export type GoalActivityItem = { id: string; type: string; message: string; createdAt: string };
