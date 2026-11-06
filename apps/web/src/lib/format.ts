import { DateTime } from 'luxon';
import type { GoalStatus, Priority, TaskStatus, XpTxType, XpSourceType, NotificationType } from '@pph/shared';

export function fmtDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(tz);
  return d.isValid ? d.toFormat('dd/MM/yyyy HH:mm') : iso;
}

/** Calendar date 'YYYY-MM-DD' → 'dd/MM/yyyy' (no timezone shift). */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = DateTime.fromISO(date);
  return d.isValid ? d.toFormat('dd/MM/yyyy') : date;
}

export function todayIn(tz: string): string {
  return DateTime.now().setZone(tz).toISODate() ?? '';
}

/** Start of a local calendar day in tz, as UTC ISO. */
export function startOfDayIso(date: string, tz: string): string | undefined {
  if (!date) return undefined;
  return DateTime.fromISO(date, { zone: tz }).startOf('day').toUTC().toISO() ?? undefined;
}
export function endOfDayIso(date: string, tz: string): string | undefined {
  if (!date) return undefined;
  return DateTime.fromISO(date, { zone: tz }).endOf('day').toUTC().toISO() ?? undefined;
}

/** `datetime-local` input value interpreted in tz → ISO with offset. */
export function localInputToIso(value: string, tz: string): string | undefined {
  if (!value) return undefined;
  const d = DateTime.fromISO(value, { zone: tz });
  return d.isValid ? d.toISO({ suppressMilliseconds: true }) ?? undefined : undefined;
}

/** ISO instant → `datetime-local` input value in tz. */
export function isoToLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(tz);
  return d.isValid ? d.toFormat("yyyy-MM-dd'T'HH:mm") : '';
}

export function fmtXp(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toLocaleString('vi-VN')}`;
}
export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('vi-VN'));

export function daysRemainingLabel(days: number | null | undefined): string {
  if (days == null) return 'Không có hạn';
  if (days < 0) return `Quá hạn ${-days} ngày`;
  if (days === 0) return 'Hết hạn hôm nay';
  return `Còn ${days} ngày`;
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  NOT_STARTED: 'Chưa bắt đầu', ACTIVE: 'Đang thực hiện', PAUSED: 'Tạm dừng', COMPLETED: 'Hoàn thành', ARCHIVED: 'Lưu trữ',
};
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'Cần làm', IN_PROGRESS: 'Đang làm', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: 'Khẩn cấp', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp',
};
export const XP_TYPE_LABEL: Record<XpTxType, string> = {
  TASK_REWARD: 'Thưởng Task', POOL_REWARD: 'Thưởng Pool', MILESTONE_REWARD: 'Thưởng Milestone', GOAL_REWARD: 'Thưởng Goal',
  REWARD_REVERSAL: 'Đảo thưởng', REDEEM: 'Đổi quà', REDEEM_REVERSAL: 'Hoàn tác đổi quà', PENALTY: 'Phạt',
  PENALTY_REVERSAL: 'Hoàn phạt',
};
export const XP_SOURCE_LABEL: Record<XpSourceType, string> = {
  TASK: 'Task', POOL: 'Pool', MILESTONE: 'Milestone', GOAL: 'Goal', REDEMPTION: 'Đổi quà',
};
export const NOTIF_TYPE_LABEL: Record<NotificationType, string> = {
  TASK_MISSED: 'Task quá hạn', TASK_DEADLINE_SOON: 'Sắp đến hạn', GOAL_REACHED_100: 'Goal đạt 100%',
  GOAL_BEHIND: 'Goal chậm tiến độ', GOAL_NEAR_DUE: 'Goal gần hạn', MILESTONE_COMPLETED: 'Milestone hoàn thành',
  LEVEL_UP: 'Lên level', POOL_REWARD: 'Thưởng Pool',
};
export const WARNING_LABEL: Record<string, string> = { BEHIND: 'Chậm tiến độ', NEAR_DUE: 'Gần hạn' };
