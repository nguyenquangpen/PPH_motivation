import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, type Settings } from '@pph/shared';
import { api } from './endpoints';

/** Root query keys. Every query key starts with one of these. */
export const qk = {
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  goals: ['goals'] as const,
  goal: ['goal'] as const,
  milestones: ['milestones'] as const,
  tasks: ['tasks'] as const,
  task: ['task'] as const,
  reasons: ['missed-reasons'] as const,
  xp: ['xp'] as const,
  shop: ['shop'] as const,
  streak: ['streak'] as const,
  checkins: ['checkins'] as const,
  notifications: ['notifications'] as const,
  activity: ['activity'] as const,
  dashboard: ['dashboard'] as const,
};

type Root = keyof typeof qk;

export function invalidate(qc: QueryClient, roots: Root[]): Promise<void> {
  return Promise.all(roots.map((r) => qc.invalidateQueries({ queryKey: qk[r] }))).then(() => undefined);
}

/** Anything that touches a task can change goals, milestones, XP, pool, streak, notifications, shop states. */
export const TASK_CHANGE: Root[] = [
  'tasks', 'task', 'goals', 'goal', 'milestones', 'xp', 'shop', 'streak', 'notifications', 'activity', 'dashboard',
];
export const GOAL_CHANGE: Root[] = ['goals', 'goal', 'milestones', 'tasks', 'xp', 'shop', 'notifications', 'activity', 'dashboard', 'categories'];
export const XP_CHANGE: Root[] = ['xp', 'shop', 'notifications', 'activity', 'dashboard'];

export function useInvalidate() {
  const qc = useQueryClient();
  return (roots: Root[]) => invalidate(qc, roots);
}

/** Settings with defaults as fallback while loading or when the endpoint is unavailable. */
export function useSettings(): { settings: Settings; loaded: boolean } {
  const q = useQuery({ queryKey: qk.settings, queryFn: api.getSettings, staleTime: 60_000 });
  return { settings: q.data ? { ...DEFAULT_SETTINGS, ...q.data } : DEFAULT_SETTINGS, loaded: !!q.data };
}

export function useTimezone(): string {
  return useSettings().settings.timezone || DEFAULT_SETTINGS.timezone;
}

export function useGoals() {
  return useQuery({ queryKey: [...qk.goals, 'all'], queryFn: () => api.listGoals() });
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: api.listCategories });
}

export function useReasons() {
  return useQuery({ queryKey: qk.reasons, queryFn: api.listReasons });
}
