import { z } from 'zod';
import { IsoDateTime, Uuid } from './common.js';

// ================= F-21 Sessions =================
export const SessionInputSchema = z.object({ start: IsoDateTime, end: IsoDateTime });
export type SessionInput = z.infer<typeof SessionInputSchema>;
export type CalendarSyncState = 'NONE' | 'PENDING' | 'SYNCED' | 'ERROR' | 'DETACHED' | 'INACTIVE';
export type SessionDto = {
  id: string; taskId: string; start: string; end: string; minutes: number;
  source: 'HUB' | 'LINKED'; calendar: CalendarSyncState;
};

// ================= F-22…F-25 Calendar =================
export type CalendarStatus = 'NOT_CONNECTED' | 'ACTIVE' | 'ERROR';
export type CalendarStatusDto = {
  status: CalendarStatus; accountEmail: string | null; error: string | null;
  lastSuccessAt: string | null; lastPullAt: string | null; busyCalendarIds: string[]; pendingChanges: number;
};
export type CalendarListItemDto = { id: string; name: string; primary: boolean; selectedForBusy: boolean };
export const BusyCalendarsSchema = z.object({ calendarIds: z.array(z.string().min(1)).min(1) });
export type BusyIntervalDto = { start: string; end: string };
export type ExternalEventDto = { eventId: string; calendarId: string; title: string; start: string; end: string };
export const LinkEventSchema = z.object({ eventId: z.string().min(1) });

// ================= F-26…F-29 Scheduling =================
export type SuggestionOptionDto = {
  index: number; kind: 'CONTIGUOUS' | 'SPLIT'; sessions: { start: string; end: string }[];
  totalMinutes: number; complete: boolean;
};
export type SuggestionsDto = {
  taskId: string; remainingMinutes: number; windowEnd: string; options: SuggestionOptionDto[];
  message: string | null;   // 'Task đã đủ thời gian' | 'Không đủ thời gian trống trước Deadline: thiếu N phút' | 'Chưa có dữ liệu lịch Google'
  calendarDataAvailable: boolean;
};
export const ApplySuggestionSchema = z.object({ sessions: z.array(z.object({ start: IsoDateTime, end: IsoDateTime })).min(1) });

export type TaskWarningDto = {
  kind: 'INSUFFICIENT' | 'BIG_TASK_UNDER_SCHEDULED'; taskId: string; taskTitle: string;
  estimatedMinutes: number; scheduledMinutes: number; missingMinutes: number; accepted: boolean;
};
export type DayWarningDto = { date: string; capacityMinutes: number; loadMinutes: number; accepted: boolean };
export type ScheduleWarningsDto = { tasks: TaskWarningDto[]; days: DayWarningDto[] };
export const AcceptWarningSchema = z.object({ kind: z.enum(['TASK', 'DAY']), ref: z.string().min(1) });

// ================= F-30…F-33 Integrations =================
export const CreateIntegrationAppSchema = z.object({
  name: z.string().trim().min(1).max(100),
  appId: z.string().regex(/^[a-z0-9-]{3,50}$/, 'app_id gồm a-z, 0-9, dấu gạch ngang, 3–50 ký tự'),
});
export const UpdateIntegrationAppSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  expectedFrequency: z.enum(['DAILY', 'WEEKLY', 'NONE']).optional(),
});
export type IntegrationAppStatus = 'ACTIVE' | 'INACTIVE' | 'NO_DATA';
export type IntegrationAppDto = {
  id: string; appId: string; name: string; expectedFrequency: 'DAILY' | 'WEEKLY' | 'NONE'; status: IntegrationAppStatus;
  lastActivityAt: string | null; lastHeartbeatAt: string | null; eventCount: number; failedCount: number;
  keys: { id: string; name: string; last4: string; createdAt: string; revokedAt: string | null }[];
};
export const CreateKeySchema = z.object({ name: z.string().trim().min(1).max(50) });
export type CreatedKeyDto = { id: string; name: string; key: string; last4: string };

export const RuleMode = ['PER_UNIT', 'FIXED'] as const;
export const RuleField = ['count', 'duration_minutes', 'items_reviewed'] as const;
export const CreateRuleSchema = z.object({
  appRef: Uuid, eventType: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/), goalId: Uuid,
  mode: z.enum(RuleMode), field: z.enum(RuleField).nullish(), factor: z.number().positive().max(10000).nullish(),
  fixed: z.number().int().min(0).max(10000).nullish(), defaultDurationMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean().optional(),
});
export const UpdateRuleSchema = CreateRuleSchema.partial();
export type RuleDto = {
  id: string; appRef: string; appName: string; eventType: string; goalId: string; goalTitle: string;
  mode: 'PER_UNIT' | 'FIXED'; field: string | null; factor: number | null; fixed: number | null;
  defaultDurationMinutes: number; enabled: boolean;
};
export type IntegrationEventStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
export type IntegrationEventDto = {
  eventId: string; appRef: string; appName: string; eventType: string; occurredAt: string; receivedAt: string;
  status: IntegrationEventStatus; reason: string | null; contribution: number | null; goalId: string | null;
  xp: number | null; payload: unknown;
};
