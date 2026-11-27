import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { TasksPage } from '../src/pages/Tasks';
import { makeTask, mockFetch, renderWithProviders, settingsHandler } from './helpers';

type H = Parameters<typeof mockFetch>[number];
const tomorrow = DateTime.now().plus({ days: 1 }).set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
const tasks = [
  makeTask({ id: 'a', title: 'Việc không hạn', deadline: null }),
  makeTask({ id: 'b', title: 'Việc đã xong', status: 'COMPLETED', completedAt: '2026-11-05T02:00:00.000Z' }),
  makeTask({ id: 'c', title: 'Việc quá hạn', missed: true }),
  makeTask({ id: 'd', title: 'Việc ngày mai', deadline: tomorrow }),
];
const base: H[] = [
  settingsHandler,
  (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks/a') ? { body: { ...tasks[0], history: [] } } : undefined),
  (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks') ? { body: tasks } : undefined),
  (c) => (c.url.startsWith('/api/v1/goals') ? { body: [] } : undefined),
];

describe('Tasks list (to-do style)', () => {
  it('defaults to "Hôm nay": overdue pinned, later tasks hidden; tabs switch', async () => {
    mockFetch(...base);
    renderWithProviders(<TasksPage />, '/tasks?view=list');
    expect(await screen.findByText('Việc quá hạn')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Hôm nay/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Việc ngày mai')).not.toBeInTheDocument();
    expect(screen.queryByText('Việc đã xong')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Sắp tới/ }));
    expect(await screen.findByText('Việc ngày mai')).toBeInTheDocument();
    expect(screen.getByText('Việc không hạn')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Hoàn thành/ }));
    expect(await screen.findByText('Việc đã xong')).toBeInTheDocument();
  });

  it('old ?missed=true link still shows the overdue task', async () => {
    mockFetch(...base);
    renderWithProviders(<TasksPage />, '/tasks?missed=true');
    expect(await screen.findByText('Việc quá hạn')).toBeInTheDocument();
  });

  it('clicking a row opens the detail drawer', async () => {
    mockFetch(...base);
    renderWithProviders(<TasksPage />, '/tasks?tab=upcoming');
    await userEvent.click(await screen.findByText('Việc không hạn'));
    expect(await screen.findByRole('dialog', { name: 'Chi tiết Task' })).toBeInTheDocument();
  });

  it('dragging a task onto "Ngày mai" PATCHes its deadline', async () => {
    const calls = mockFetch(
      ...base,
      (c) => (c.method === 'PATCH' && c.url === '/api/v1/tasks/c' ? { body: tasks[2] } : undefined),
    );
    renderWithProviders(<TasksPage />, '/tasks?view=list');
    const row = (await screen.findByText('Việc quá hạn')).closest('li')!;
    fireEvent.dragStart(row);
    fireEvent.drop(await screen.findByText('Ngày mai'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/v1/tasks/c')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.stringify(patch.body)).toContain(DateTime.now().plus({ days: 1 }).toISODate()!.slice(0, 7));
  });

  it('board: columns by status; dragging a TODO card to "Đang làm" calls start; backwards is refused', async () => {
    const inProgress = makeTask({ id: 'e', title: 'Việc đang làm', status: 'IN_PROGRESS' });
    const all = [...tasks, inProgress];
    const calls = mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks') ? { body: all } : undefined),
      (c) => (c.url.startsWith('/api/v1/goals') ? { body: [] } : undefined),
      (c) => (c.method === 'POST' && c.url === '/api/v1/tasks/c/start' ? { body: { ...tasks[2], status: 'IN_PROGRESS' } } : undefined),
    );
    renderWithProviders(<TasksPage />, '/tasks');
    const todo = await screen.findByRole('region', { name: 'Cần làm' });
    await userEvent.click(await screen.findByRole('button', { name: 'Tất cả ngày' }));
    expect(await screen.findByText('Việc quá hạn')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Đang làm' })).toHaveTextContent('Việc đang làm');
    expect(screen.getByRole('region', { name: 'Hoàn thành' })).toHaveTextContent('Việc đã xong');

    // backwards: Đang làm → Cần làm is refused (no request)
    fireEvent.dragStart(screen.getByText('Việc đang làm').closest('li')!);
    fireEvent.drop(todo);
    expect(await screen.findByText(/Không thể đưa về/)).toBeInTheDocument();

    fireEvent.dragStart(screen.getByText('Việc quá hạn').closest('li')!);
    fireEvent.drop(screen.getByRole('region', { name: 'Đang làm' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/v1/tasks/c/start')).toBe(true));
  });

  it('board: "Cần làm" shows only the selected day (default today) and can show all days', async () => {
    const todayNoon = DateTime.now().set({ hour: 23, minute: 30, second: 0, millisecond: 0 }).toUTC().toISO()!;
    const all = [
      makeTask({ id: 'x', title: 'Việc hôm nay', deadline: todayNoon }),
      makeTask({ id: 'y', title: 'Việc ngày mai', deadline: tomorrow }),
      makeTask({ id: 'z', title: 'Việc không hạn', deadline: null }),
    ];
    mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks') ? { body: all } : undefined),
      (c) => (c.url.startsWith('/api/v1/goals') ? { body: [] } : undefined),
    );
    renderWithProviders(<TasksPage />, '/tasks');
    const todo = await screen.findByRole('region', { name: 'Cần làm' });
    expect(await screen.findByText('Việc hôm nay')).toBeInTheDocument();
    expect(todo).not.toHaveTextContent('Việc ngày mai');
    expect(todo).toHaveTextContent('Còn 2 việc');

    await userEvent.click(screen.getByRole('button', { name: 'Ngày sau' }));
    expect(await screen.findByText('Việc ngày mai')).toBeInTheDocument();
    expect(screen.queryByText('Việc hôm nay')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tất cả ngày' }));
    expect(await screen.findByText('Việc không hạn')).toBeInTheDocument();
    expect(screen.getByText('Việc hôm nay')).toBeInTheDocument();
  });

  it('board: card shows the next work session of the task', async () => {
    const start = DateTime.now().plus({ days: 2 }).set({ hour: 19, minute: 0, second: 0, millisecond: 0 });
    const session = { id: 's1', taskId: 'a', start: start.toUTC().toISO()!, end: start.plus({ hours: 1 }).toUTC().toISO()!, minutes: 60, source: 'HUB', calendar: 'NONE' };
    mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url === '/api/v1/tasks/a/sessions' ? { body: [session] } : undefined),
      (c) => (c.method === 'GET' && c.url.includes('/sessions') ? { body: [] } : undefined),
      (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks') ? { body: [tasks[0]] } : undefined),
      (c) => (c.url.startsWith('/api/v1/goals') ? { body: [] } : undefined),
    );
    renderWithProviders(<TasksPage />, '/tasks');
    await userEvent.click(await screen.findByRole('button', { name: 'Tất cả ngày' }));
    expect(await screen.findByText(/📅 .*\d\d:\d\d–\d\d:\d\d/)).toBeInTheDocument();
  });

  it('list: rescheduling warns when a session ends up after the new deadline', async () => {
    const far = DateTime.now().plus({ days: 5 }).toUTC().toISO()!;
    const withSession = makeTask({ id: 'q', title: 'Việc có phiên', missed: true });
    const moved = { ...withSession, deadline: DateTime.now().plus({ days: 1 }).set({ hour: 23, minute: 59 }).toUTC().toISO()!, missed: false };
    mockFetch(
      settingsHandler,
      (c) => (c.method === 'GET' && c.url === '/api/v1/tasks/q/sessions' ? { body: [{ id: 's', taskId: 'q', start: far, end: far, minutes: 60, source: 'HUB', calendar: 'NONE' }] } : undefined),
      (c) => (c.method === 'PATCH' && c.url === '/api/v1/tasks/q' ? { body: moved } : undefined),
      (c) => (c.method === 'GET' && c.url.startsWith('/api/v1/tasks') ? { body: [withSession] } : undefined),
      (c) => (c.url.startsWith('/api/v1/goals') ? { body: [] } : undefined),
    );
    renderWithProviders(<TasksPage />, '/tasks?view=list');
    fireEvent.dragStart((await screen.findByText('Việc có phiên')).closest('li')!);
    fireEvent.drop(await screen.findByText('Ngày mai'));
    expect(await screen.findByText(/có 1 phiên nằm sau hạn mới/)).toBeInTheDocument();
  });
});
