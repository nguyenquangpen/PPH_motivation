import { z } from 'zod';
import type { NotificationType } from '../enums.js';
import type { GoalDto } from './goals.js';
import type { TaskDto } from './tasks.js';
import type { XpSummaryDto, XpTransactionDto } from './xp.js';

// ---------- Missed reason tags (F-16) ----------
export const CreateReasonTagSchema = z.object({ name: z.string().trim().min(1).max(50), exempt: z.boolean() });
export const UpdateReasonTagSchema = CreateReasonTagSchema.partial();
export type ReasonTagDto = { id: string; name: string; exempt: boolean; isSystem: boolean };

// ---------- Streak (F-13) / Check-in (F-14) ----------
export type StreakDayState = 'ACTIVE' | 'FREEZE' | 'EMPTY';
export type StreakDto = {
  current: number; longest: number; freezesLeft: number;
  calendar: { date: string; state: StreakDayState }[];   // 84 ngày gần nhất, cũ → mới
  goalStreaks: { goalId: string; current: number }[];
};
export const CheckinSchema = z.object({ mood: z.number().int().min(1).max(5).nullish(), note: z.string().max(2000).nullish() });
export type CheckinDto = { date: string; mood: number | null; note: string | null; updatedAt: string };

// ---------- Notifications (F-19) ----------
export type NotificationDto = {
  id: string; type: NotificationType; objectType: string | null; objectId: string | null;
  title: string; body: string | null; read: boolean; createdAt: string;
};

// ---------- Activity (F-18) ----------
export type ActivityItemDto = {
  id: string; type: string; message: string; goalId: string | null; taskId: string | null;
  milestoneId: string | null; itemId: string | null; before: unknown; after: unknown; createdAt: string;
};

// ---------- Dashboard (F-17) ----------
export type DashboardDto = {
  today: { date: string; dueToday: number; completedToday: number; missed: number; tasks: TaskDto[] };
  goals: GoalDto[];
  reward: XpSummaryDto & { recent: XpTransactionDto[] };
  streak: { current: number; longest: number; freezesLeft: number };
  alerts: { unreadNotifications: number; missedReview: number };
  achievements: { milestoneId: string; goalId: string; title: string; completedAt: string }[];
};

// ---------- Additions (Agent D) ----------
export const CheckinDateParamSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type ActivityPageDto = { items: ActivityItemDto[]; page: number; pageSize: number; total: number; totalPages: number };
export type NotificationListDto = { items: NotificationDto[]; unreadCount: number };
