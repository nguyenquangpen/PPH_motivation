import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f02-goal-progress.json');

/** Đưa Goal đến completed = amount bằng một Task đã hoàn thành. */
const seedContribution = (t: TestApp, goalId: string, amount: number) => {
  if (amount > 0) t.f.complete(t.f.task({ goalId, contribution: amount, title: `Seed ${amount}` }).id);
};

describe('F-02 Goal Progress', () => {
  scenario('[F-02] Hoàn thành Task tăng tiến độ', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(t.f.count("contribution_ledger WHERE goal_id = ? AND type = 'ADD' AND amount = 100", g)).toBe(1);
    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.body.progress.completedContribution).toBe(100);
    expect(res.body.progress.progressPercent).toBe(10);
    expect(t.f.activity().some((a) => a.type === 'GOAL_PROGRESS' && a.message === 'Goal Goal G: 0,0% → 10,0%')).toBe(true);
  });

  scenario('[F-02] Ví dụ spec 130/1000', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    t.f.complete(t.f.task({ goalId: g, contribution: 100 }).id);
    t.f.complete(t.f.task({ goalId: g, contribution: 30 }).id);
    t.f.start(t.f.task({ goalId: g, contribution: 200 }).id);
    t.f.task({ goalId: g, contribution: 50 });
    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.body.progress.completedContribution).toBe(130);
    expect(res.body.progress.progressPercent).toBe(13);
  });

  scenario('[F-02] Task chưa hoàn thành không tính', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    await t.api.post(`/api/v1/tasks/${task.id}/start`);
    expect(t.s.goals.progress(g).completedContribution).toBe(0);
    expect(t.f.count('contribution_ledger')).toBe(0);
  });

  scenario('[F-02] Task CANCELLED không tính', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    expect((await t.api.post(`/api/v1/tasks/${task.id}/cancel`, {})).status).toBe(200);
    expect(t.s.goals.progress(g).completedContribution).toBe(0);
  });

  scenario('[F-02] Hoàn tác giảm tiến độ', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    t.f.complete(task.id);
    expect(t.s.goals.progress(g).completedContribution).toBe(100);
    await t.api.post(`/api/v1/tasks/${task.id}/undo`);
    expect(t.f.count("contribution_ledger WHERE goal_id = ? AND type = 'REVERSAL' AND amount = -100", g)).toBe(1);
    expect(t.f.count("contribution_ledger WHERE goal_id = ? AND type = 'ADD' AND amount = 100", g)).toBe(1);
    expect((await t.api.get(`/api/v1/goals/${g}`)).body.progress.completedContribution).toBe(0);
  });

  scenario('[F-02] Không cộng trùng', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, 'op-x');
    await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, 'op-x');
    expect(t.f.count("contribution_ledger WHERE type = 'ADD'")).toBe(1);
    expect(t.s.goals.progress(g).completedContribution).toBe(100);
  });

  scenario('[F-02] Đạt đúng 100%', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    seedContribution(t, g, 900);
    const task = t.f.task({ goalId: g, contribution: 100 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    const p = (await t.api.get(`/api/v1/goals/${g}`)).body.progress;
    expect(p.progressPercent).toBe(100);
    expect(p.overflowContribution).toBe(0);
    expect(p.remainingContribution).toBe(0);
  });

  scenario('[F-02] Vượt mục tiêu', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    seedContribution(t, g, 1000);
    const task = t.f.task({ goalId: g, contribution: 120 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    const p = (await t.api.get(`/api/v1/goals/${g}`)).body.progress;
    expect(p.completedContribution).toBe(1120);
    expect(p.displayPercent).toBe(100);
    expect(p.progressPercent).toBe(112);
    expect(p.overflowContribution).toBe(120); // UI: '+120 vượt mục tiêu'
    expect(p.remainingContribution).toBe(0);
  });

  scenario('[F-02] Làm tròn xuống 0,1', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 3 });
    seedContribution(t, g, 1);
    const p = (await t.api.get(`/api/v1/goals/${g}`)).body.progress;
    expect(p.progressPercent).toBe(33.3);
    // làm tròn xuống, không phải làm tròn gần nhất: 2/3 → 66,6
    seedContribution(t, g, 1);
    expect(t.s.goals.progress(g).progressPercent).toBe(66.6);
  });

  scenario('[F-02] Sửa Target Contribution', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const m = t.f.milestone(g, { threshold: 500 });
    seedContribution(t, g, 600);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
    const events: unknown[] = [];
    t.ctx.events.on('goal.target_changed', (p) => events.push(p));
    const res = await t.api.patch(`/api/v1/goals/${g}`, { targetContribution: 1500 });
    expect(res.status).toBe(200);
    expect(res.body.progress.completedContribution).toBe(600);
    expect(res.body.progress.progressPercent).toBe(40);
    expect(t.f.activity().some((a) => a.message === 'Target 1000 → 1500, Progress 60,0% → 40,0%')).toBe(true);
    expect(events).toEqual([{ goalId: g, before: 1000, after: 1500 }]);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
  });

  scenario('[F-02] Goal Paused vẫn nhận Contribution', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'PAUSED', target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 50, estimated: 60 });
    t.f.start(task.id);
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(t.s.goals.progress(g).completedContribution).toBe(50);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(50);
  });

  scenario('[F-02] Khóa sửa Task đã COMPLETED', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ goalId: g, contribution: 100 });
    t.f.complete(task.id);
    const res = await t.api.patch(`/api/v1/tasks/${task.id}`, { contribution: 200 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TASK_LOCKED');
    expect(res.body.error.message).toContain('hoàn tác');
    expect(t.s.tasks.get(task.id).contribution).toBe(100);
    expect(t.s.goals.progress(g).completedContribution).toBe(100);
  });
});
