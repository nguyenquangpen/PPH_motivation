import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f12-milestone.json');

const seedContribution = (t: TestApp, goalId: string, amount: number) => {
  const task = t.f.task({ goalId, contribution: amount, title: `Seed ${amount}` });
  t.f.complete(task.id);
  return task.id;
};

const milestoneRow = (t: TestApp, id: string) =>
  t.db.prepare('SELECT status, completed_at FROM milestones WHERE id = ?').get(id) as { status: string; completed_at: string | null };

const activeRewards = (t: TestApp, milestoneId: string) => t.s.ledger.activeXpBySource('MILESTONE', milestoneId, 'MILESTONE_REWARD');

describe('F-12 Milestone', () => {
  scenario('[F-12] Hoàn thành theo ngưỡng', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    seedContribution(t, g, 450);
    const m = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'Nửa chặng', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 500 })).body;
    expect(m.status).toBe('PENDING');
    expect(m.effectiveRewardXp).toBe(300);
    const events: unknown[] = [];
    t.ctx.events.on('milestone.completed', (p) => events.push(p));
    const task = t.f.task({ goalId: g, contribution: 50 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    const row = milestoneRow(t, m.id);
    expect(row.status).toBe('COMPLETED');
    expect(row.completed_at).toBe(t.ctx.nowIso());
    expect(activeRewards(t, m.id).map((x) => x.lifetimeDelta)).toEqual([300]);
    expect(t.f.count("notifications WHERE type = 'MILESTONE_COMPLETED' AND object_id = ?", m.id)).toBe(1);
    expect(t.f.activity().some((a) => a.type === 'MILESTONE_COMPLETED')).toBe(true);
    expect(events).toEqual([{ milestoneId: m.id, goalId: g }]);
    expect(t.s.milestones.recentAchievements().map((a) => a.milestoneId)).toContain(m.id);
  });

  scenario('[F-12] Biên ngưỡng', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    seedContribution(t, g, 499);
    const m = t.f.milestone(g, { threshold: 500 });
    expect(t.s.milestones.isCompleted(m)).toBe(false);
    const task = t.f.task({ goalId: g, contribution: 1 });
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
  });

  scenario('[F-12] Thưởng tùy chỉnh', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    seedContribution(t, g, 450);
    const m = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 500, rewardXp: 50 })).body;
    const task = t.f.task({ goalId: g, contribution: 50 });
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(activeRewards(t, m.id).map((x) => x.lifetimeDelta)).toEqual([50]);
  });

  scenario('[F-12] Hoàn thành theo tập Task', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'LINKED_TASKS' })).body;
    const a = t.f.task({ goalId: g, milestoneIds: [m.id], title: 'A' });
    const b = t.f.task({ goalId: g, milestoneIds: [m.id], title: 'B' });
    t.f.complete(a.id);
    t.f.start(b.id);
    expect(t.s.milestones.isCompleted(m.id)).toBe(false);
    expect((await t.api.get(`/api/v1/milestones/${m.id}`)).body.linkedTaskIds.sort()).toEqual([a.id, b.id].sort());
    await t.api.post(`/api/v1/tasks/${b.id}/complete`);
    expect(t.s.milestones.isCompleted(m.id)).toBe(true);
    expect(activeRewards(t, m.id)).toHaveLength(1);
  });

  scenario('[F-12] Bỏ qua Task CANCELLED', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = t.f.milestone(g, { conditionType: 'LINKED_TASKS', threshold: null });
    const a = t.f.task({ goalId: g, milestoneIds: [m], title: 'A' });
    const b = t.f.task({ goalId: g, milestoneIds: [m], title: 'B' });
    const c = t.f.task({ goalId: g, milestoneIds: [m], title: 'C' });
    t.f.complete(a.id);
    await t.api.post(`/api/v1/tasks/${b.id}/cancel`, {});
    t.f.start(c.id);
    expect(t.s.milestones.isCompleted(m)).toBe(false);
    await t.api.post(`/api/v1/tasks/${c.id}/complete`);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
  });

  scenario('[F-12] Tập Task rỗng', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'LINKED_TASKS' })).body;
    expect(m.status).toBe('PENDING');
    const other = t.f.task({ goalId: g });
    await t.api.post(`/api/v1/tasks/${other.id}/complete`);
    expect(t.s.milestones.isCompleted(m.id)).toBe(false);
    expect(activeRewards(t, m.id)).toHaveLength(0);
  });

  scenario('[F-12] Mở lại khi hoàn tác', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = t.f.milestone(g, { threshold: 500 });
    seedContribution(t, g, 470);
    const task = seedContribution(t, g, 50);
    expect(t.s.goals.progress(g).completedContribution).toBe(520);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
    const reward = activeRewards(t, m)[0]!;
    expect(reward.lifetimeDelta).toBe(300);
    const events: unknown[] = [];
    t.ctx.events.on('milestone.reopened', (p) => events.push(p));
    await t.api.post(`/api/v1/tasks/${task}/undo`);
    expect(t.s.goals.progress(g).completedContribution).toBe(470);
    expect(milestoneRow(t, m)).toEqual({ status: 'PENDING', completed_at: null });
    const rev = t.f.xpTx('REWARD_REVERSAL').filter((x) => x.reversed_transaction_id === reward.id);
    expect(rev.map((x) => x.lifetime_delta)).toEqual([-300]);
    expect(events).toEqual([{ milestoneId: m, goalId: g }]);
  });

  scenario('[F-12] Hoàn thành lại không trùng', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = t.f.milestone(g, { threshold: 500 });
    seedContribution(t, g, 470);
    const task = seedContribution(t, g, 50);
    t.f.undo(task);
    expect(t.s.milestones.isCompleted(m)).toBe(false);
    expect(activeRewards(t, m)).toHaveLength(0);
    await t.api.post(`/api/v1/tasks/${task}/complete`);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
    expect(t.f.xpTx('MILESTONE_REWARD').filter((x) => x.source_id === m)).toHaveLength(2);
    expect(activeRewards(t, m)).toHaveLength(1);
  });

  scenario('[F-12] Đổi Target không mở lại', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const m = t.f.milestone(g, { threshold: 500 });
    seedContribution(t, g, 600);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
    const res = await t.api.patch(`/api/v1/goals/${g}`, { targetContribution: 2000 });
    expect(res.status).toBe(200);
    expect(t.s.milestones.isCompleted(m)).toBe(true);
    expect(t.f.xpTx('REWARD_REVERSAL')).toHaveLength(0);
  });

  scenario('[F-12] Tạo Milestone đã thỏa điều kiện', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    seedContribution(t, g, 800);
    const res = await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 500 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.completedAt).toBe(t.ctx.nowIso());
    expect(activeRewards(t, res.body.id)).toHaveLength(1);
  });

  scenario('[F-12] Milestone không hợp lệ', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const zero = await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 0 });
    expect(zero.status).toBe(400);
    const missing = await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', conditionType: 'CONTRIBUTION_THRESHOLD' });
    expect(missing.status).toBe(400);
    const noCondition = await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'M', threshold: 10 });
    expect(noCondition.status).toBe(400);
    const noGoal = await t.api.post('/api/v1/goals/00000000-0000-4000-8000-000000000000/milestones', { title: 'M', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 10 });
    expect(noGoal.status).toBe(404);
    expect(t.f.count('milestones')).toBe(0);
  });

  scenario('[F-12] Không hoàn thành thủ công', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const m = t.f.milestone(g, { threshold: 500 });
    const detail = await t.api.get(`/api/v1/milestones/${m}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('PENDING');
    // Không có endpoint hoàn thành; PATCH status bị bỏ qua
    expect((await t.api.post(`/api/v1/milestones/${m}/complete`, {})).status).toBe(404);
    await t.api.patch(`/api/v1/milestones/${m}`, { status: 'COMPLETED' });
    expect(t.s.milestones.isCompleted(m)).toBe(false);
    expect(t.f.xpTx('MILESTONE_REWARD')).toHaveLength(0);
  });
});
