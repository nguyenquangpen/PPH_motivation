import { z } from 'zod';
import { Priority, TaskStatus, MissedReviewAction } from '../enums.js';
import { Contribution, Description, Duration, IsoDateTime, Uuid } from './common.js';

/** deadline: ISO datetime có offset, hoặc chỉ ngày YYYY-MM-DD (→ 23:59 theo timezone Owner) */
export const DeadlineInput = z.union([IsoDateTime, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title bắt buộc').max(200),
  description: Description,
  priority: z.enum(Priority),
  contribution: Contribution,
  goalId: Uuid.nullish(),
  milestoneIds: z.array(Uuid).optional(),
  estimatedDuration: Duration,
  deadline: DeadlineInput.nullish(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({ actualDuration: Duration.nullish() });
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const CompleteTaskSchema = z.object({ actualDuration: Duration.optional() });
export const CancelTaskSchema = z.object({ reasonTagId: Uuid.optional() });
export const MissedReviewSchema = z.object({
  reasonTagId: Uuid,
  action: z.enum(MissedReviewAction),
  newDeadline: DeadlineInput.optional(),
});

export type ExpectedXp = { isSmall: boolean; nominalXp: number; immediateXp: number; poolContribution: number };

export type TaskDto = {
  id: string; title: string; description: string | null; priority: Priority; contribution: number;
  goalId: string | null; milestoneIds: string[]; estimatedDuration: number; actualDuration: number | null;
  deadline: string | null; status: TaskStatus; completedAt: string | null; missed: boolean;
  missedReasonTagId: string | null; missedReasonTagName: string | null; expectedXp: ExpectedXp; xpReceived: number | null;
  createdAt: string; updatedAt: string;
};

export type TaskHistoryDto = { fromStatus: TaskStatus | null; toStatus: TaskStatus; reason: string | null; at: string };
