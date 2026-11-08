import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityType, type MilestoneDto } from '@pph/shared';
import { Route, Routes } from 'react-router-dom';
import { ActivityPage } from '../src/pages/Activity';
import { RewardsPage } from '../src/pages/Rewards';
import { ACTIVITY_TYPE_LABEL } from '../src/lib/format';
import { makeDashboard, mockFetch, renderWithProviders, settingsHandler } from './helpers';

describe('Activity type filter', () => {
  it('has a Vietnamese label for every ActivityType', () => {
    for (const t of ActivityType) expect(ACTIVITY_TYPE_LABEL[t]).toBeTruthy();
  });

  it('builds a comma-separated type filter and labels entries', async () => {
    const calls = mockFetch(settingsHandler, (c) => (c.url.startsWith('/api/v1/activity') ? {
      body: {
        items: [{ id: 'a1', type: 'TASK_COMPLETED', message: 'Hoàn thành Task X', goalId: null, taskId: null, milestoneId: null, itemId: null, before: null, after: null, createdAt: '2026-11-06T02:00:00.000Z' }],
        page: 1, pageSize: 50, total: 1, totalPages: 1,
      },
    } : undefined));
    renderWithProviders(<Routes><Route path="/activity" element={<ActivityPage />} /></Routes>, '/activity');
    const row = (await screen.findByText('Hoàn thành Task X')).closest('tr')!;
    expect(within(row).getByText('Hoàn thành Task')).toBeInTheDocument();

    const picker = screen.getByLabelText('Thêm loại hoạt động');
    await userEvent.selectOptions(picker, 'TASK_COMPLETED');
    await userEvent.selectOptions(picker, 'XP_PENALTY');
    await waitFor(() => expect(calls.some((c) => c.url.includes('type=TASK_COMPLETED%2CXP_PENALTY'))).toBe(true));
    // Remove a chip
    await userEvent.click(screen.getByTitle('Bỏ lọc TASK_COMPLETED'));
    await waitFor(() => expect(calls.at(-1)!.url).toMatch(/type=XP_PENALTY(&|$)/));
  });
});

describe('Reward item form: milestone unlock', () => {
  it('lists all milestones grouped by goal in one select', async () => {
    const goal = makeDashboard().goals[0]!;
    const ms = (id: string, goalId: string, title: string): MilestoneDto => ({
      id, goalId, title, description: null, targetDate: null, conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 100,
      rewardXp: null, effectiveRewardXp: 300, status: 'PENDING', completedAt: null, linkedTaskIds: [],
    });
    const calls = mockFetch(
      settingsHandler,
      (c) => (c.url === '/api/v1/shop/items' ? { body: [] } : undefined),
      (c) => (c.url.startsWith('/api/v1/goals') ? { body: [goal, { ...goal, id: 'g-2', title: 'Chạy bộ' }] } : undefined),
      (c) => (c.url === '/api/v1/milestones' ? { body: [ms('m-1', 'g-1', 'Bài 1-10'), ms('m-2', 'g-2', '5 km')] } : undefined),
    );
    renderWithProviders(<RewardsPage />);
    await userEvent.click(await screen.findByRole('button', { name: '+ Thêm vật phẩm' }));
    await userEvent.selectOptions(screen.getByLabelText('Điều kiện mở khóa'), 'MILESTONE_COMPLETED');

    const select = screen.getByLabelText('Milestone') as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll('optgroup')).toHaveLength(2));
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Học tiếng Nhật N3', 'Chạy bộ']);
    expect(screen.queryByLabelText('Goal của Milestone')).not.toBeInTheDocument();
    await userEvent.selectOptions(select, 'm-2');
    expect(select).toHaveValue('m-2');
    expect(calls.some((c) => c.url === '/api/v1/milestones')).toBe(true);
  });
});
