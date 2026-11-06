import type {
  ActivityItemDto, ActivityPageDto, CategoryDto, CheckinDto, CreateGoalInput, CreateMilestoneInput, CreateRewardItemInput,
  CreateTaskInput, DashboardDto, GoalDetailDto, GoalDto, GoalStatus, MilestoneDto, MissedReviewAction,
  NotificationDto, NotificationListDto, Page, ReasonTagDto, ReconciliationDto, RedemptionDto, RewardItemDto, Settings, StreakDto,
  TaskDto, TaskHistoryDto, TaskStatus, UpdateGoalInput, UpdateTaskInput, XpSummaryDto, XpTransactionDto,
} from '@pph/shared';
import { request, toArray, toPage } from './client';

export type TaskDetail = TaskDto & { history: TaskHistoryDto[] };

export type TaskFilters = { status?: TaskStatus; goalId?: string; missed?: boolean; due?: 'today' };
export type XpTxFilters = { type?: string; sourceType?: string; from?: string; to?: string; page?: number };
export type ActivityFilters = { from?: string; to?: string; goalId?: string; taskId?: string; type?: string; page?: number };

const enc = encodeURIComponent;

export const api = {
  // ---------- Settings ----------
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: patch }),
  resetSettingsGroup: (group: string) => request<Settings>('/settings/reset', { method: 'POST', body: { group } }),

  // ---------- Categories ----------
  listCategories: async () => toArray(await request<CategoryDto[] | Page<CategoryDto>>('/categories')),
  createCategory: (b: { name: string; color?: string | null }) => request<CategoryDto>('/categories', { method: 'POST', body: b }),
  updateCategory: (id: string, b: { name?: string; color?: string | null }) =>
    request<CategoryDto>(`/categories/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteCategory: (id: string) => request<unknown>(`/categories/${enc(id)}`, { method: 'DELETE' }),

  // ---------- Goals ----------
  listGoals: async (status?: GoalStatus) =>
    toArray(await request<GoalDto[] | Page<GoalDto>>('/goals', { query: { status } })),
  getGoal: (id: string) => request<GoalDetailDto>(`/goals/${enc(id)}`),
  createGoal: (b: CreateGoalInput) => request<GoalDto>('/goals', { method: 'POST', body: b }),
  updateGoal: (id: string, b: UpdateGoalInput) => request<GoalDto>(`/goals/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteGoal: (id: string) => request<unknown>(`/goals/${enc(id)}`, { method: 'DELETE' }),
  completeGoal: (id: string, confirmBelow100?: boolean) =>
    request<GoalDto>(`/goals/${enc(id)}/complete`, {
      method: 'POST', body: confirmBelow100 ? { confirmBelow100: true } : {}, idempotent: true,
    }),

  // ---------- Milestones ----------
  listMilestones: async (goalId: string) =>
    toArray(await request<MilestoneDto[] | Page<MilestoneDto>>(`/goals/${enc(goalId)}/milestones`)),
  createMilestone: (goalId: string, b: CreateMilestoneInput) =>
    request<MilestoneDto>(`/goals/${enc(goalId)}/milestones`, { method: 'POST', body: b }),
  updateMilestone: (id: string, b: Partial<CreateMilestoneInput>) =>
    request<MilestoneDto>(`/milestones/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteMilestone: (id: string) => request<unknown>(`/milestones/${enc(id)}`, { method: 'DELETE' }),

  // ---------- Tasks ----------
  listTasks: async (f: TaskFilters = {}) =>
    toArray(
      await request<TaskDto[] | Page<TaskDto>>('/tasks', {
        query: { status: f.status, goalId: f.goalId, missed: f.missed === undefined ? undefined : String(f.missed), due: f.due },
      }),
    ),
  getTask: (id: string) => request<TaskDetail>(`/tasks/${enc(id)}`),
  createTask: (b: CreateTaskInput) => request<TaskDto>('/tasks', { method: 'POST', body: b }),
  updateTask: (id: string, b: UpdateTaskInput) => request<TaskDto>(`/tasks/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteTask: (id: string, confirm?: boolean) =>
    request<unknown>(`/tasks/${enc(id)}`, { method: 'DELETE', query: { confirm: confirm ? 'true' : undefined }, idempotent: true }),
  startTask: (id: string) => request<TaskDto>(`/tasks/${enc(id)}/start`, { method: 'POST', body: {} }),
  completeTask: (id: string, actualDuration?: number) =>
    request<TaskDto>(`/tasks/${enc(id)}/complete`, {
      method: 'POST', body: actualDuration ? { actualDuration } : {}, idempotent: true,
    }),
  undoTask: (id: string) => request<TaskDto>(`/tasks/${enc(id)}/undo`, { method: 'POST', body: {}, idempotent: true }),
  cancelTask: (id: string, reasonTagId?: string) =>
    request<TaskDto>(`/tasks/${enc(id)}/cancel`, {
      method: 'POST', body: reasonTagId ? { reasonTagId } : {}, idempotent: true,
    }),
  missedReview: (id: string, b: { reasonTagId: string; action: MissedReviewAction; newDeadline?: string }) =>
    request<TaskDto>(`/tasks/${enc(id)}/missed-review`, { method: 'POST', body: b, idempotent: true }),

  // ---------- Missed reasons ----------
  listReasons: async () => toArray(await request<ReasonTagDto[] | Page<ReasonTagDto>>('/missed-reasons')),
  getReason: (id: string) => request<ReasonTagDto>(`/missed-reasons/${enc(id)}`),
  createReason: (b: { name: string; exempt: boolean }) => request<ReasonTagDto>('/missed-reasons', { method: 'POST', body: b }),
  updateReason: (id: string, b: { name?: string; exempt?: boolean }) =>
    request<ReasonTagDto>(`/missed-reasons/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteReason: (id: string) => request<unknown>(`/missed-reasons/${enc(id)}`, { method: 'DELETE' }),

  // ---------- XP ----------
  xpSummary: () => request<XpSummaryDto>('/xp/summary'),
  xpTransactions: async (f: XpTxFilters = {}) =>
    toPage(
      await request<Page<XpTransactionDto> | XpTransactionDto[]>('/xp/transactions', { query: f }),
      f.page ?? 1,
    ),
  reconciliation: () => request<ReconciliationDto>('/xp/reconciliation'),

  // ---------- Shop ----------
  listItems: async () => toArray(await request<RewardItemDto[] | Page<RewardItemDto>>('/shop/items')),
  createItem: (b: CreateRewardItemInput) => request<RewardItemDto>('/shop/items', { method: 'POST', body: b }),
  updateItem: (id: string, b: Partial<CreateRewardItemInput>) =>
    request<RewardItemDto>(`/shop/items/${enc(id)}`, { method: 'PATCH', body: b }),
  deleteItem: (id: string) => request<unknown>(`/shop/items/${enc(id)}`, { method: 'DELETE' }),
  redeem: (id: string) => request<RedemptionDto>(`/shop/items/${enc(id)}/redeem`, { method: 'POST', body: {}, idempotent: true }),
  listRedemptions: async () => toArray(await request<RedemptionDto[] | Page<RedemptionDto>>('/shop/redemptions')),
  undoRedemption: (id: string) =>
    request<RedemptionDto>(`/shop/redemptions/${enc(id)}/undo`, { method: 'POST', body: {}, idempotent: true }),

  // ---------- Streak / check-in ----------
  streak: () => request<StreakDto>('/streak'),
  listCheckins: async (from: string, to: string) =>
    toArray(await request<CheckinDto[] | Page<CheckinDto>>('/checkins', { query: { from, to } })),
  saveCheckinToday: (b: { mood?: number | null; note?: string | null }) =>
    request<CheckinDto>('/checkins/today', { method: 'PUT', body: b }),

  // ---------- Notifications ----------
  listNotifications: async (): Promise<NotificationListDto> => {
    const r = await request<NotificationListDto | NotificationDto[]>('/notifications');
    const items = toArray(r);
    const unreadCount = !Array.isArray(r) && typeof r?.unreadCount === 'number' ? r.unreadCount : items.filter((n) => !n.read).length;
    return { items, unreadCount };
  },
  readNotification: (id: string) => request<unknown>(`/notifications/${enc(id)}/read`, { method: 'POST', body: {} }),
  readAllNotifications: () => request<unknown>('/notifications/read-all', { method: 'POST', body: {} }),

  // ---------- Activity ----------
  activity: async (f: ActivityFilters = {}) =>
    toPage(await request<ActivityPageDto | ActivityItemDto[]>('/activity', { query: f }), f.page ?? 1),

  // ---------- Dashboard ----------
  dashboard: () => request<DashboardDto>('/dashboard'),
};
