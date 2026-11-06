import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f04-goal-deadline-warnings.json');

/** 10:00 giờ VN của một ngày */
const at = (date: string) => `${date}T03:00:00.000Z`;

const seedContribution = (t: TestApp, goalId: string, amount: number) => {
  if (amount > 0) t.f.complete(t.f.task({ goalId, contribution: amount, title: `Seed ${amount}` }).id);
};

const notifCount = (t: TestApp, type: string, goalId: string) =>
  t.f.count('notifications WHERE type = ? AND object_id = ?', type, goalId);

describe('F-04 Goal Deadline Warnings', () => {
  scenario('[F-04] Số ngày còn lại', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g = t.f.goal({ targetDate: '2026-11-16' });
    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.body.progress.daysRemaining).toBe(10); // UI: 'Còn 10 ngày'
    // Ranh giới ngày theo múi giờ Owner: 23:30 giờ VN ngày 06/11 vẫn là ngày 06/11
    const late = createTestApp('2026-11-06T16:30:00.000Z');
    const g2 = late.f.goal({ targetDate: '2026-11-16' });
    expect(late.s.goals.progress(g2).daysRemaining).toBe(10);
    // 00:30 giờ VN ngày 07/11 (vẫn là 06/11 theo UTC) → còn 9 ngày
    const next = createTestApp('2026-11-06T17:30:00.000Z');
    const g3 = next.f.goal({ targetDate: '2026-11-16' });
    expect(next.s.goals.progress(g3).daysRemaining).toBe(9);
  });

  scenario('[F-04] Quá hạn không đổi trạng thái', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g = t.f.goal({ status: 'ACTIVE', targetDate: '2026-11-01' });
    t.f.tick();
    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.body.progress.daysRemaining).toBe(-5); // UI: 'Quá hạn 5 ngày'
    expect(res.body.status).toBe('ACTIVE');
  });

  scenario('[F-04] Cảnh báo chậm', async () => {
    const t = createTestApp(at('2026-02-20'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-01-01', targetDate: '2026-04-11', target: 1000 });
    seedContribution(t, g, 349);
    const p = t.s.goals.progress(g);
    expect(p.expectedPercent).toBe(50);
    expect(p.progressPercent).toBe(34.9);
    expect(p.warnings).toContain('BEHIND');
    t.f.tick();
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(1);
  });

  scenario('[F-04] Đúng biên không cảnh báo chậm', async () => {
    const t = createTestApp(at('2026-02-20'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-01-01', targetDate: '2026-04-11', target: 1000 });
    seedContribution(t, g, 350);
    expect(t.s.goals.progress(g).progressPercent).toBe(35);
    t.f.tick();
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(0);
    expect(t.s.goals.progress(g).warnings).not.toContain('BEHIND');
  });

  scenario('[F-04] Cảnh báo gần hạn tại 14 ngày', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-11-01', targetDate: '2026-11-20', target: 10 });
    seedContribution(t, g, 10); // không chậm, chỉ gần hạn
    expect(t.s.goals.progress(g).daysRemaining).toBe(14);
    t.f.tick();
    expect(notifCount(t, 'GOAL_NEAR_DUE', g)).toBe(1);
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(0);
  });

  scenario('[F-04] Không cảnh báo gần hạn tại 15 ngày', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-11-01', targetDate: '2026-11-21', target: 10 });
    seedContribution(t, g, 10);
    expect(t.s.goals.progress(g).daysRemaining).toBe(15);
    t.f.tick();
    expect(notifCount(t, 'GOAL_NEAR_DUE', g)).toBe(0);
  });

  scenario('[F-04] Chỉ áp dụng Goal Active đủ ngày', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g1 = t.f.goal({ status: 'PAUSED', startDate: '2026-10-01', targetDate: '2026-11-11' });
    const g2 = t.f.goal({ status: 'ACTIVE', startDate: null, targetDate: '2026-11-11' });
    t.f.tick();
    expect(t.f.count("notifications WHERE type IN ('GOAL_BEHIND','GOAL_NEAR_DUE') AND object_id IN (?, ?)", g1, g2)).toBe(0);
    expect(t.s.goals.progress(g1).warnings).toEqual([]);
    expect(t.s.goals.progress(g2).warnings).toEqual([]);
    expect(t.s.goals.progress(g2).daysRemaining).toBe(5);
  });

  scenario('[F-04] start_date bằng target_date', async () => {
    const t = createTestApp(at('2026-11-06'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-11-06', targetDate: '2026-11-06', target: 100 });
    seedContribution(t, g, 80);
    expect(t.s.goals.progress(g).expectedPercent).toBe(100);
    t.f.tick();
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(1);
  });

  scenario('[F-04] Tối đa 1 cảnh báo mỗi loại mỗi ngày', async () => {
    const t = createTestApp(at('2026-02-20'));
    const g = t.f.goal({ status: 'ACTIVE', startDate: '2026-01-01', targetDate: '2026-04-11', target: 1000 });
    seedContribution(t, g, 100);
    t.f.tick();
    // Owner đọc notification giữa các lần đánh giá — vẫn không tạo lại trong cùng ngày
    t.db.prepare("UPDATE notifications SET read_at = ? WHERE type = 'GOAL_BEHIND'").run(t.ctx.nowIso());
    t.f.tick();
    t.clock.set('2026-02-20T15:00:00.000Z'); // 22:00 cùng ngày VN
    t.f.tick();
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(1);
    // Sang ngày mới (00:30 VN 21/02) → được cảnh báo lại
    t.clock.set('2026-02-20T17:30:00.000Z');
    t.f.tick();
    expect(notifCount(t, 'GOAL_BEHIND', g)).toBe(2);
  });
});
