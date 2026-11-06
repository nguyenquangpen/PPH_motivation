import { describe, expect } from 'vitest';
import type { DashboardDto } from '@pph/shared';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f17-dashboard.json');
const at = (date: string, time = '10:00') => `${date}T${time}:00+07:00`;
const utc = (local: string) => new Date(local).toISOString();

const completeOn = (t: TestApp, date: string) => {
  t.clock.set(at(date));
  const task = t.f.task();
  t.f.complete(task.id);
};

const dashboard = async (t: TestApp) => {
  const res = await t.api.get<DashboardDto>('/api/v1/dashboard');
  expect(res.status).toBe(200);
  return res.body;
};

describe('F-17 Dashboard', () => {
  scenario('[F-17] Today', async () => {
    const t = createTestApp(); // 2026-11-06 10:00 +07:00
    const due = [1, 2, 3].map((i) => t.f.task({ title: `Due ${i}`, deadline: utc(at('2026-11-06', '22:00')) }));
    t.f.complete(due[0]!.id);
    t.f.complete(due[1]!.id);
    t.f.taskRaw({ title: 'Missed', deadline: utc(at('2026-11-05', '18:00')) });
    // Task deadline ngày khác không tính vào hôm nay
    t.f.task({ title: 'Tomorrow', deadline: utc(at('2026-11-07', '10:00')) });

    const d = await dashboard(t);
    expect(d.today.date).toBe('2026-11-06');
    expect(d.today.dueToday).toBe(3);
    expect(d.today.completedToday).toBe(2);
    expect(d.today.missed).toBe(1);
    expect(d.today.tasks.map((x) => x.id).sort()).toEqual(due.map((x) => x.id).sort());
    // Task còn mở có thể Complete trực tiếp (1 thao tác)
    const open = d.today.tasks.find((x) => x.status === 'TODO')!;
    const res = await t.api.post(`/api/v1/tasks/${open.id}/complete`);
    expect(res.status).toBe(200);
    expect((await dashboard(t)).today.completedToday).toBe(3);
  });

  scenario('[F-17] Goals', async () => {
    const t = createTestApp();
    const ids: Record<string, string> = {};
    for (const status of ['ACTIVE', 'NOT_STARTED', 'PAUSED', 'COMPLETED', 'ARCHIVED']) {
      ids[status] = t.f.goal({ title: `Goal ${status}`, status, target: 1000, targetDate: '2026-12-31', startDate: '2026-11-01' });
    }
    const d = await dashboard(t);
    expect(d.goals.map((g) => g.status).sort()).toEqual(['ACTIVE', 'NOT_STARTED', 'PAUSED']);
    for (const g of d.goals) {
      expect(g.targetContribution).toBe(1000);
      expect(g.progress.completedContribution).toBe(0);
      expect(typeof g.progress.displayPercent).toBe('number');
      expect(g.progress.daysRemaining).toEqual(expect.any(Number));
      expect(g.title).toBe(`Goal ${g.status}`);
    }
  });

  scenario('[F-17] Reward', async () => {
    const t = createTestApp(at('2026-11-05'));
    // Hôm qua: Lifetime 2100, Spendable 650 (5 giao dịch)
    t.f.xp('GOAL_REWARD', 1800, 'GOAL');
    for (let i = 0; i < 3; i++) t.f.xp('TASK_REWARD', 100);
    t.f.xp('PENALTY', 1450);
    t.f.pool(35);
    // Hôm nay: +200 TASK_REWARD, −50 PENALTY
    t.clock.set(at('2026-11-06'));
    const reward = t.f.xp('TASK_REWARD', 200);
    t.clock.advanceMinutes(1);
    const penalty = t.f.xp('PENALTY', 50);

    const d = await dashboard(t);
    expect(d.reward).toMatchObject({ level: 3, lifetimeXp: 2300, spendableXp: 800, xpToday: 200, pool: 35, poolTarget: 100 });
    expect(d.reward.recent).toHaveLength(5);
    expect(d.reward.recent[0]!.id).toBe(penalty.id);
    expect(d.reward.recent[1]!.id).toBe(reward.id);
  });

  scenario('[F-17] Streak', async () => {
    const t = createTestApp(at('2026-10-01'));
    // Tháng 10: chuỗi 10 ngày (01–10), sau đó đứt
    for (let d = 1; d <= 10; d++) completeOn(t, `2026-10-${String(d).padStart(2, '0')}`);
    // Tháng 11: 02, 03 active, 04 Freeze, 05, 06 active → Current 4, dùng 1 Freeze
    for (const d of ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']) completeOn(t, d);
    t.f.tick(); // xử lý mọi ngày đã kết thúc: 11–12/10 Freeze (hết lượt tháng 10), 13/10 đứt, 04/11 Freeze
    const d = await dashboard(t);
    expect(d.streak).toEqual({ current: 4, longest: 10, freezesLeft: 1 });
  });

  scenario('[F-17] Alerts', async () => {
    const t = createTestApp();
    for (let i = 0; i < 3; i++) t.s.notifications.notify({ type: 'LEVEL_UP', dedupeKey: `test:${i}`, title: `N${i}` });
    const read = t.s.notifications.notify({ type: 'LEVEL_UP', dedupeKey: 'test:read', title: 'Đã đọc' })!;
    t.s.notifications.markRead(read);
    t.f.taskRaw({ title: 'M1', deadline: utc(at('2026-11-05', '08:00')) });
    t.f.taskRaw({ title: 'M2', deadline: utc(at('2026-11-05', '09:00')) });
    const d = await dashboard(t);
    expect(d.alerts.unreadNotifications).toBe(3);
    expect(d.alerts.missedReview).toBe(2);
  });

  scenario('[F-17] Achievements', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const ids: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const id = t.f.milestone(g, { title: `M${i}`, status: 'COMPLETED' });
      t.db.prepare('UPDATE milestones SET completed_at = ? WHERE id = ?').run(`2026-11-0${i}T00:00:00.000Z`, id);
      ids.push(id);
    }
    const d = await dashboard(t);
    expect(d.achievements.map((a) => a.title)).toEqual(['M7', 'M6', 'M5', 'M4', 'M3']);
    expect(d.achievements[0]).toMatchObject({ milestoneId: ids[6], goalId: g });
  });
});
