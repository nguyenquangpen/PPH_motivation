import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f03-goal-completion.json');

const seedContribution = (t: TestApp, goalId: string, amount: number) => {
  const task = t.f.task({ goalId, contribution: amount, title: `Seed ${amount}` });
  t.f.complete(task.id);
  return task.id;
};

const reachedNotifs = (t: TestApp, goalId: string, unreadOnly = true) =>
  t.f.count(
    `notifications WHERE type = 'GOAL_REACHED_100' AND object_id = ?${unreadOnly ? ' AND read_at IS NULL AND hidden_at IS NULL' : ''}`,
    goalId,
  );

describe('F-03 Goal Completion', () => {
  scenario('[F-03] Gợi ý khi đạt 100%', async () => {
    const t = createTestApp();
    const g = t.f.goal({ title: 'G', status: 'ACTIVE', target: 1000 });
    seedContribution(t, g, 950);
    expect(reachedNotifs(t, g)).toBe(0);
    const task = t.f.task({ goalId: g, contribution: 50 });
    t.f.start(task.id);
    await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    const n = t.db.prepare("SELECT title FROM notifications WHERE type = 'GOAL_REACHED_100' AND object_id = ?").all(g) as { title: string }[];
    expect(n.map((x) => x.title)).toEqual(['Goal G đã đạt mục tiêu — đánh dấu hoàn thành?']);
    expect(t.s.goals.get(g).status).toBe('ACTIVE');
    expect(t.f.xpTx('GOAL_REWARD')).toHaveLength(0);
  });

  scenario('[F-03] Xác nhận hoàn thành', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 1000 });
    seedContribution(t, g, 1000);
    // Đưa XP về Lifetime 500 / Spendable 500 (Task 1000 là task lớn → TASK_REWARD); reset bằng cách đảo rồi đặt lại
    const taskTx = t.f.xpTx('TASK_REWARD')[0]!;
    t.db.transaction(() => t.s.ledger.reverseXp(taskTx.id))();
    t.f.balances(500, 500);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 500, spendable: 500 });
    const res = await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.completedAt).toBe(t.ctx.nowIso());
    expect(res.body.completedContributionSnapshot).toBe(1000);
    const gr = t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g);
    expect(gr.map((x) => x.lifetime_delta)).toEqual([1000]);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 1500, spendable: 1500 });
  });

  scenario('[F-03] Goal Reward tùy chỉnh', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100, goalRewardXp: 500 });
    seedContribution(t, g, 100);
    await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g).map((x) => x.lifetime_delta)).toEqual([500]);
  });

  scenario('[F-03] Hoàn thành khi chưa đủ 100%', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 1000 });
    seedContribution(t, g, 400);
    const first = await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(first.status).toBe(422);
    expect(first.body.error.code).toBe('CONFIRM_REQUIRED');
    expect(t.s.goals.get(g).status).toBe('ACTIVE');
    const second = await t.api.post(`/api/v1/goals/${g}/complete`, { confirmBelow100: true });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('COMPLETED');
    expect(t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g).map((x) => x.lifetime_delta)).toEqual([1000]);
  });

  scenario('[F-03] Xác nhận trùng', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100 });
    seedContribution(t, g, 100);
    const r1 = await t.api.post(`/api/v1/goals/${g}/complete`, {}, 'goal-op-1');
    const r2 = await t.api.post(`/api/v1/goals/${g}/complete`, {}, 'goal-op-1');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g)).toHaveLength(1);
    // Không có khóa: lần 2 báo đã hoàn thành, không thưởng thêm
    const r3 = await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(r3.status).toBe(409);
    expect(t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g)).toHaveLength(1);
  });

  scenario('[F-03] Goal đã xóa', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100 });
    seedContribution(t, g, 100);
    await t.api.del(`/api/v1/goals/${g}`);
    const res = await t.api.post(`/api/v1/goals/${g}/complete`, { confirmBelow100: true });
    expect(res.status).toBe(404);
    expect(t.f.xpTx('GOAL_REWARD')).toHaveLength(0);
  });

  scenario('[F-03] Hoàn tác Task sau khi Goal Completed', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 1000 });
    seedContribution(t, g, 900);
    const task = seedContribution(t, g, 100);
    await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(t.f.xpTx('GOAL_REWARD')).toHaveLength(1);
    await t.api.post(`/api/v1/tasks/${task}/undo`);
    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.body.progress.completedContribution).toBe(900);
    expect(res.body.progress.progressPercent).toBe(90);
    expect(res.body.status).toBe('COMPLETED');
    const goalTx = t.f.xpTx('GOAL_REWARD')[0]!;
    expect(t.f.count('xp_transactions WHERE reversed_transaction_id = ?', goalTx.id)).toBe(0);
  });

  scenario('[F-03] Goal Reward chỉ một lần trong vòng đời', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100 });
    seedContribution(t, g, 100);
    await t.api.post(`/api/v1/goals/${g}/complete`, {});
    await t.api.patch(`/api/v1/goals/${g}`, { status: 'ACTIVE' });
    expect(t.s.goals.get(g).status).toBe('ACTIVE');
    const res = await t.api.post(`/api/v1/goals/${g}/complete`, {});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(t.f.xpTx('GOAL_REWARD').filter((x) => x.source_id === g)).toHaveLength(1);
  });

  scenario('[F-03] Không gợi ý lặp', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100 });
    seedContribution(t, g, 99);
    const task = t.f.task({ goalId: g, contribution: 1 });
    await t.api.post(`/api/v1/tasks/${task.id}/complete`); // 100%
    await t.api.post(`/api/v1/tasks/${task.id}/undo`); // 99%
    await t.api.post(`/api/v1/tasks/${task.id}/complete`); // 100%
    expect(reachedNotifs(t, g)).toBe(1);
  });
});
