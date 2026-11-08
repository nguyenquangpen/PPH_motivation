import { DateTime } from 'luxon';
import type {
  ActivityType, GoalStatus, Priority, TaskStatus, XpTxType, XpSourceType, NotificationType, StreakDayState,
} from '@pph/shared';

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
  TASK: 'Task', POOL: 'Pool', MILESTONE: 'Milestone', GOAL: 'Goal', REDEMPTION: 'Đổi quà', INTEGRATION_EVENT: 'Sự kiện tích hợp',
};
export const NOTIF_TYPE_LABEL: Record<NotificationType, string> = {
  TASK_MISSED: 'Task quá hạn', TASK_DEADLINE_SOON: 'Sắp đến hạn', GOAL_REACHED_100: 'Goal đạt 100%',
  GOAL_BEHIND: 'Goal chậm tiến độ', GOAL_NEAR_DUE: 'Goal gần hạn', MILESTONE_COMPLETED: 'Milestone hoàn thành',
  LEVEL_UP: 'Lên level', POOL_REWARD: 'Thưởng Pool',
  CALENDAR_SYNC_ERROR: 'Lỗi đồng bộ lịch', CALENDAR_EVENT_DELETED: 'Lịch bị xóa trên Google', EXTERNAL_APP_INACTIVE: 'App ngoài không hoạt động',
};
export const WARNING_LABEL: Record<string, string> = { BEHIND: 'Chậm tiến độ', NEAR_DUE: 'Gần hạn' };

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  CATEGORY_CREATED: 'Tạo Category', CATEGORY_UPDATED: 'Sửa Category', CATEGORY_DELETED: 'Xóa Category',
  GOAL_CREATED: 'Tạo Goal', GOAL_UPDATED: 'Sửa Goal', GOAL_TARGET_CHANGED: 'Đổi mục tiêu Goal',
  GOAL_STATUS_CHANGED: 'Đổi trạng thái Goal', GOAL_PROGRESS: 'Tiến độ Goal', GOAL_COMPLETED: 'Hoàn thành Goal', GOAL_DELETED: 'Xóa Goal',
  MILESTONE_CREATED: 'Tạo Milestone', MILESTONE_UPDATED: 'Sửa Milestone', MILESTONE_COMPLETED: 'Đạt Milestone',
  MILESTONE_REOPENED: 'Mở lại Milestone', MILESTONE_DELETED: 'Xóa Milestone',
  TASK_CREATED: 'Tạo Task', TASK_UPDATED: 'Sửa Task', TASK_COMPLETED: 'Hoàn thành Task', TASK_UNDONE: 'Hoàn tác Task',
  TASK_CANCELLED: 'Hủy Task', TASK_DELETED: 'Xóa Task', TASK_RESCHEDULED: 'Dời deadline Task',
  TASK_REASON_CHANGED: 'Đổi lý do bỏ lỡ', TASK_PENALIZED: 'Phạt Task', TASK_PENALTY_REVERSED: 'Hoàn phạt Task',
  REASON_TAG_CREATED: 'Tạo lý do bỏ lỡ', REASON_TAG_UPDATED: 'Sửa lý do bỏ lỡ', REASON_TAG_DELETED: 'Xóa lý do bỏ lỡ',
  XP_TASK_REWARD: 'XP: Thưởng Task', XP_POOL_REWARD: 'XP: Thưởng Pool', XP_MILESTONE_REWARD: 'XP: Thưởng Milestone',
  XP_GOAL_REWARD: 'XP: Thưởng Goal', XP_REWARD_REVERSAL: 'XP: Đảo thưởng', XP_REDEEM: 'XP: Đổi quà',
  XP_REDEEM_REVERSAL: 'XP: Hoàn tác đổi quà', XP_PENALTY: 'XP: Phạt', XP_PENALTY_REVERSAL: 'XP: Hoàn phạt', LEVEL_UP: 'Lên level',
  SHOP_ITEM_CREATED: 'Tạo vật phẩm', SHOP_ITEM_UPDATED: 'Sửa vật phẩm', SHOP_ITEM_DELETED: 'Xóa vật phẩm',
  REDEMPTION_CREATED: 'Đổi thưởng', REDEMPTION_REVERSED: 'Hoàn tác đổi thưởng',
  STREAK_FREEZE_USED: 'Dùng Streak Freeze', CHECKIN_CREATED: 'Check-in', CHECKIN_UPDATED: 'Sửa check-in',
  SETTINGS_CHANGED: 'Đổi cài đặt',
  INTEGRATION_EVENT_PROCESSED: 'Hoạt động từ app ngoài',
};
/** Vietnamese label for an activity type; unknown types fall back to the raw code. */
export const activityTypeLabel = (type: string): string => (ACTIVITY_TYPE_LABEL as Record<string, string>)[type] ?? type;

export const STREAK_DAY_LABEL: Record<StreakDayState, string> = {
  ACTIVE: 'Hoạt động', FREEZE: 'Dùng Freeze', EMPTY: 'Không hoạt động',
};
