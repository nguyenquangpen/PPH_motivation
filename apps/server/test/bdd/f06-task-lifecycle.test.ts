import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f06-task-lifecycle.json');
const HOUR = 3600_000;
const iso = (base: string, hours: number) => new Date(new Date(base).getTime() + hours * HOUR).toISOString();

describe('F-06 Task Lifecycle', () => {
  scenario('[F-06] Bắt đầu Task', async () => {
    const t = createTestApp();
    const task = t.f.task();
    const res = await t.api.post(`/api/v1/tasks/${task.id}/start`);
    expect(res.body.status).toBe('IN_PROGRESS');
    const h = t.s.tasks.history(task.id).at(-1)!;
    expect([h.fromStatus, h.toStatus]).toEqual(['TODO', 'IN_PROGRESS']);
  });

  scenario('[F-06] Hoàn thành Task lớn', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const task = t.f.task({ contribution: 100, estimated: 120, goalId: g });
    t.f.start(task.id);
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.completedAt).toBe(t.ctx.nowIso());
    expect(t.s.ledger.goalContribution(g)).toBe(100);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(200);
    expect(t.s.streak.get().current).toBe(1);
    expect(t.f.activity().some((a) => a.type === 'TASK_COMPLETED')).toBe(true);
  });

  scenario('[F-06] Hoàn thành trực tiếp từ TODO', async () => {
    const t = createTestApp();
    const task = t.f.task();
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    expect(res.body.status).toBe('COMPLETED');
  });

  scenario('[F-06] Hoàn thành lặp', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const task = t.f.task({ goalId: g });
    t.f.start(task.id);
    const r1 = await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, 'op-1');
    const r2 = await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, 'op-1');
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(t.f.xpTx('TASK_REWARD')).toHaveLength(1);
    expect(t.f.count("contribution_ledger WHERE type='ADD'")).toBe(1);
  });

  scenario('[F-06] Chuyển trạng thái không hợp lệ', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ status: 'CANCELLED' });
    const res = await t.api.post(`/api/v1/tasks/${id}/complete`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TASK_INVALID_TRANSITION');
    expect(t.s.tasks.get(id).status).toBe('CANCELLED');
  });

  scenario('[F-06] Hoàn tác Task chưa hoàn thành', async () => {
    const t = createTestApp();
    const task = t.f.task();
    const res = await t.api.post(`/api/v1/tasks/${task.id}/undo`);
    expect(res.status).toBe(422);
    expect(t.s.tasks.get(task.id).status).toBe('TODO');
  });

  scenario('[F-06] Hoàn tác về IN_PROGRESS', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const task = t.f.task({ contribution: 100, estimated: 120, goalId: g });
    t.f.complete(task.id);
    t.f.xp('PENALTY', 150); // Spendable 200 → 50
    expect(t.s.ledger.balances().spendable).toBe(50);
    const res = await t.api.post(`/api/v1/tasks/${task.id}/undo`);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.completedAt).toBeNull();
    const orig = t.f.xpTx('TASK_REWARD')[0]!;
    const rev = t.f.xpTx('REWARD_REVERSAL')[0]!;
    expect(rev.lifetime_delta).toBe(-200);
    expect(rev.reversed_transaction_id).toBe(orig.id);
    expect(t.f.count("contribution_ledger WHERE type='REVERSAL' AND amount=-100")).toBe(1);
    expect(t.s.ledger.balances().spendable).toBe(-150);
  });

  scenario('[F-06] Hoàn thành lại sau hoàn tác', () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 100, estimated: 120 });
    t.f.start(task.id);
    t.f.complete(task.id);
    t.f.undo(task.id);
    t.f.complete(task.id);
    expect(t.f.xpTx('TASK_REWARD')).toHaveLength(2);
    expect(t.f.xpTx('REWARD_REVERSAL')).toHaveLength(1);
    expect(t.s.ledger.balances().lifetime).toBe(200);
    expect(t.s.tasks.get(task.id).status).toBe('COMPLETED');
  });

  scenario('[F-06] Lỗi giữa chừng', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const task = t.f.task({ goalId: g });
    t.f.start(task.id);
    let armed = true;
    t.ctx.events.on('goal.contribution_changed', () => {
      if (armed) throw new Error('lỗi giả lập');
    });
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`);
    armed = false;
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBeTruthy();
    expect(t.s.tasks.get(task.id).status).toBe('IN_PROGRESS');
    expect(t.f.count('contribution_ledger') + t.f.count('xp_transactions')).toBe(0);
  });

  scenario('[F-06] Hủy trước deadline', async () => {
    const t = createTestApp();
    const task = t.f.task({ deadline: iso(t.ctx.nowIso(), 5) });
    const res = await t.api.post(`/api/v1/tasks/${task.id}/cancel`, {});
    expect(res.body.status).toBe('CANCELLED');
    expect(t.f.xpTx('PENALTY')).toHaveLength(0);
  });

  scenario('[F-06] Hủy Task Missed với lý do không miễn trừ', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -2) });
    const lt = t.s.ledger.balances().lifetime;
    const res = await t.api.post(`/api/v1/tasks/${id}/cancel`, { reasonTagId: t.f.tagId('Trì hoãn') });
    expect(res.body.status).toBe('CANCELLED');
    expect(t.f.xpTx('PENALTY').map((x) => x.spendable_delta)).toEqual([-100]);
    expect(t.s.ledger.balances().lifetime).toBe(lt);
  });

  scenario('[F-06] Hủy Task Missed bắt buộc lý do', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    const res = await t.api.post(`/api/v1/tasks/${id}/cancel`, {});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(t.s.tasks.get(id).status).toBe('TODO');
  });

  scenario('[F-06] Hủy Task Missed với lý do miễn trừ', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    const res = await t.api.post(`/api/v1/tasks/${id}/cancel`, { reasonTagId: t.f.tagId('Bất khả kháng') });
    expect(res.body.status).toBe('CANCELLED');
    expect(t.f.xpTx('PENALTY')).toHaveLength(0);
  });

  scenario('[F-06] Hủy Task đã bị phạt', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24); // quá deadline + grace
    t.f.tick();
    expect(t.f.xpTx('PENALTY')).toHaveLength(1);
    const res = await t.api.post(`/api/v1/tasks/${id}/cancel`, { reasonTagId: t.f.tagId('Trì hoãn') });
    expect(res.body.status).toBe('CANCELLED');
    const active = t.f.xpTx('PENALTY').filter((p) => !t.s.ledger.isReversed(p.id));
    expect(active).toHaveLength(1);
  });

  scenario('[F-06] Hoàn thành Task Missed trong Grace', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -3) });
    await t.api.post(`/api/v1/tasks/${id}/complete`);
    t.clock.advanceHours(24);
    t.f.tick();
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(200);
    expect(t.f.xpTx('PENALTY')).toHaveLength(0);
  });

  scenario('[F-06] Hoàn thành Task đã bị phạt', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -25) });
    t.f.tick();
    const pen = t.f.xpTx('PENALTY');
    expect(pen.map((p) => p.spendable_delta)).toEqual([-100]);
    await t.api.post(`/api/v1/tasks/${id}/complete`);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(200);
    expect(t.s.ledger.isReversed(pen[0]!.id)).toBe(false);
  });

  scenario('[F-06] Ghi Actual Duration khi hoàn thành', async () => {
    const t = createTestApp();
    const task = t.f.task();
    t.f.start(task.id);
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`, { actualDuration: 45 });
    expect(res.body.actualDuration).toBe(45);
  });

  scenario('[F-06] Actual Duration không hợp lệ', async () => {
    const t = createTestApp();
    const task = t.f.task();
    t.f.start(task.id);
    const res = await t.api.post(`/api/v1/tasks/${task.id}/complete`, { actualDuration: 0 });
    expect(res.status).toBe(400);
    expect(t.s.tasks.get(task.id).status).toBe('IN_PROGRESS');
  });

  scenario('[F-06] Lịch sử trạng thái', () => {
    const t = createTestApp();
    const task = t.f.task();
    t.f.start(task.id);
    t.f.complete(task.id);
    t.f.undo(task.id);
    const h = t.s.tasks.history(task.id).slice(-3).map((x) => `${x.fromStatus}→${x.toStatus}`);
    expect(h).toEqual(['TODO→IN_PROGRESS', 'IN_PROGRESS→COMPLETED', 'COMPLETED→IN_PROGRESS']);
    expect(t.s.tasks.history(task.id).every((x) => !!x.at)).toBe(true);
  });
});
