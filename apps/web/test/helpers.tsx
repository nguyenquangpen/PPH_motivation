import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS, type DashboardDto, type StreakDto, type TaskDto } from '@pph/shared';
import { ToastProvider } from '../src/components/ui';

export type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };
type Handler = (c: Call) => { status?: number; body?: unknown } | undefined;

/** Stub global fetch. Handlers are tried in order; unmatched requests get a 404 error body. */
export function mockFetch(...handlers: Handler[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers = { ...((init?.headers as Record<string, string>) ?? {}) };
    const call: Call = { method: init?.method ?? 'GET', url, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const r = h(call);
      if (r) {
        return new Response(r.body === undefined ? '' : JSON.stringify(r.body), {
          status: r.status ?? 200, headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }), { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

export const settingsHandler: Handler = (c) =>
  c.method === 'GET' && c.url === '/api/v1/settings' ? { body: DEFAULT_SETTINGS } : undefined;

export function renderWithProviders(ui: ReactElement, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

export function makeTask(over: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 't-1', title: 'Viết báo cáo', description: null, priority: 'HIGH', contribution: 50, goalId: 'g-1', milestoneIds: [],
    estimatedDuration: 60, actualDuration: null, deadline: '2026-11-06T16:59:00.000Z', status: 'TODO', completedAt: null,
    missed: false, missedReasonTagId: null, missedReasonTagName: null, expectedXp: { isSmall: false, nominalXp: 50, immediateXp: 50, poolContribution: 0 },
    xpReceived: null, createdAt: '2026-11-05T01:00:00.000Z', updatedAt: '2026-11-05T01:00:00.000Z', ...over,
  };
}

export function makeDashboard(): DashboardDto {
  return {
    today: { date: '2026-11-06', dueToday: 2, completedToday: 1, missed: 1, tasks: [makeTask()] },
    goals: [{
      id: 'g-1', title: 'Học tiếng Nhật N3', description: null, categoryId: 'c-1', categoryName: 'Education', status: 'ACTIVE',
      startDate: '2026-10-01', targetDate: '2026-12-31', targetContribution: 1000, goalRewardXp: null, icon: null, color: null,
      completedAt: null, completedContributionSnapshot: null, goalRewardGranted: false,
      progress: {
        completedContribution: 1030, targetContribution: 1000, progressPercent: 103, displayPercent: 100, overflowContribution: 30,
        remainingContribution: 0, expectedPercent: 40, daysRemaining: 55, warnings: [],
      },
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }],
    reward: {
      lifetimeXp: 2450, spendableXp: 1300, level: 3, xpPerLevel: 1000, xpToday: 75, pool: 40, poolTarget: 100,
      recent: [{
        id: 'x-1', type: 'TASK_REWARD', lifetimeDelta: 75, spendableDelta: 75, sourceType: 'TASK', sourceId: 't-0',
        reversedTransactionId: null, reason: null, createdAt: '2026-11-06T02:00:00.000Z',
      }],
    },
    streak: { current: 5, longest: 12, freezesLeft: 2 },
    alerts: { unreadNotifications: 3, missedReview: 4 },
    achievements: [{ milestoneId: 'm-1', goalId: 'g-1', title: 'Hoàn thành giáo trình 1', completedAt: '2026-11-04T10:00:00.000Z' }],
  };
}

/** 84-day StreakDto ending 2026-11-06 (oldest → newest): last 5 days ACTIVE, day -6 FREEZE, rest EMPTY. */
export function makeStreak(): StreakDto {
  const end = Date.UTC(2026, 10, 6);
  const calendar = Array.from({ length: 84 }, (_, i) => {
    const back = 83 - i;
    const date = new Date(end - back * 86_400_000).toISOString().slice(0, 10);
    const state = back < 5 ? 'ACTIVE' : back === 6 ? 'FREEZE' : 'EMPTY';
    return { date, state } as StreakDto['calendar'][number];
  });
  return { current: 5, longest: 12, freezesLeft: 2, calendar, goalStreaks: [{ goalId: 'g-1', current: 3 }] };
}

export const streakHandler: Handler = (c) =>
  c.method === 'GET' && c.url === '/api/v1/streak' ? { body: makeStreak() } : undefined;
