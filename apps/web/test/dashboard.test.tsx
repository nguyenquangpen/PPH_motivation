import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from '../src/pages/Dashboard';
import { makeDashboard, makeTask, mockFetch, renderWithProviders, settingsHandler, streakHandler } from './helpers';

describe('Dashboard', () => {
  it('renders all sections from a DashboardDto', async () => {
    mockFetch(settingsHandler, streakHandler, (c) => (c.url === '/api/v1/dashboard' ? { body: makeDashboard() } : undefined));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Viết báo cáo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Hôm nay/ })).toBeInTheDocument();
    // Goals with overflow label and days remaining
    expect(screen.getByText('Học tiếng Nhật N3')).toBeInTheDocument();
    expect(screen.getByText('+30 vượt mục tiêu')).toBeInTheDocument();
    expect(screen.getByText(/Còn 55 ngày/)).toBeInTheDocument();
    // Reward
    const reward = screen.getByRole('heading', { name: 'Phần thưởng' }).closest('section')!;
    expect(within(reward).getByText('Pool 40/100')).toBeInTheDocument();
    expect(within(reward).getByText('+75 XP')).toBeInTheDocument();
    const lifetime = within(reward).getByText((_, el) => el?.tagName === 'SPAN' && /^2[.,]450$/.test(el.textContent ?? ''));
    expect(lifetime.closest('a')).toHaveAttribute('href', '/rewards#transactions');
    // Streak
    const streak = screen.getByRole('heading', { name: 'Chuỗi ngày' }).closest('section')!;
    expect(within(streak).getByText('12')).toBeInTheDocument();
    const cal = await within(streak).findByTestId('streak-calendar');
    const days = cal.querySelectorAll('[data-state]');
    expect(days).toHaveLength(84);
    expect(days[83]).toHaveAttribute('data-state', 'ACTIVE');
    expect(days[83]).toHaveAttribute('title', '06/11/2026: Hoạt động');
    expect(days[77]).toHaveAttribute('title', '31/10/2026: Dùng Freeze');
    expect(days[0]).toHaveAttribute('title', '15/08/2026: Không hoạt động');
    expect(within(streak).getByText('Freeze')).toBeInTheDocument();
    // Alerts
    expect(screen.getByRole('link', { name: 'Cần review: 4' })).toHaveAttribute('href', '/tasks?missed=true');
    // Achievements
    expect(screen.getByText(/Hoàn thành giáo trình 1/)).toBeInTheDocument();
  });

  it('Complete button calls POST /api/v1/tasks/:id/complete with an Idempotency-Key in one click', async () => {
    const calls = mockFetch(
      settingsHandler,
      streakHandler,
      (c) => (c.method === 'GET' && c.url === '/api/v1/dashboard' ? { body: makeDashboard() } : undefined),
      (c) => (c.method === 'POST' && c.url === '/api/v1/tasks/t-1/complete'
        ? { body: makeTask({ status: 'COMPLETED', xpReceived: 50 }) } : undefined),
    );
    renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Hoàn thành Viết báo cáo' }));

    await waitFor(() => expect(calls.some((c) => c.url === '/api/v1/tasks/t-1/complete')).toBe(true));
    const post = calls.find((c) => c.url === '/api/v1/tasks/t-1/complete')!;
    expect(post.method).toBe('POST');
    expect(post.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
    // Dashboard is refetched after the mutation
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/v1/dashboard').length).toBeGreaterThan(1));
  });
});
