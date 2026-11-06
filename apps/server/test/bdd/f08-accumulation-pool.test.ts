import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f08-accumulation-pool.json');

describe('F-08 Accumulation Pool', () => {
  scenario('[F-08] Task nhỏ cộng vào Pool', () => {
    const t = createTestApp();
    t.f.pool(40);
    const task = t.f.task({ contribution: 10 });
    t.f.complete(task.id);
    expect(t.f.count("pool_ledger WHERE type='ADD' AND task_id=?", task.id)).toBe(1);
    expect(t.s.ledger.pool()).toBe(50);
    expect(t.f.xpTx('POOL_REWARD')).toHaveLength(0);
  });

  scenario('[F-08] Đạt đúng ngưỡng', () => {
    const t = createTestApp();
    t.f.pool(90);
    const task = t.f.task({ contribution: 10 });
    t.f.complete(task.id);
    const pr = t.f.xpTx('POOL_REWARD');
    expect(pr).toHaveLength(1);
    expect(pr[0]!.lifetime_delta).toBe(120);
    expect(pr[0]!.spendable_delta).toBe(120);
    expect(t.f.count("pool_ledger WHERE type='PAYOUT' AND amount=-100")).toBe(1);
    expect(t.s.ledger.pool()).toBe(0);
    expect(t.f.count("notifications WHERE type='POOL_REWARD'")).toBe(1);
  });

  scenario('[F-08] Phần dư giữ lại', () => {
    const t = createTestApp();
    t.f.pool(95);
    const task = t.f.task({ contribution: 10 });
    t.f.complete(task.id);
    expect(t.f.xpTx('POOL_REWARD')).toHaveLength(1);
    expect(t.s.ledger.pool()).toBe(5);
  });

  scenario('[F-08] Vượt nhiều ngưỡng một lần', () => {
    const t = createTestApp();
    t.f.settings({ smallThreshold: 500, poolTarget: 100, poolRewardXp: 120 });
    t.f.pool(50);
    const task = t.f.task({ contribution: 260 });
    t.f.complete(task.id);
    expect(t.f.xpTx('POOL_REWARD')).toHaveLength(3);
    expect(t.s.ledger.pool()).toBe(10);
  });

  scenario('[F-08] Hoàn tác Task nhỏ làm Pool âm', () => {
    const t = createTestApp();
    t.f.pool(90);
    const task = t.f.task({ contribution: 10 });
    t.f.complete(task.id); // pool đầy → thưởng, pool 0
    expect(t.s.ledger.pool()).toBe(0);
    t.f.undo(task.id);
    expect(t.f.count("pool_ledger WHERE type='DEDUCT' AND amount=-10")).toBe(1);
    expect(t.s.ledger.pool()).toBe(-10);
    expect(t.f.xpTx('REWARD_REVERSAL')).toHaveLength(0);
  });

  scenario('[F-08] Task nhỏ không gắn Goal', () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 15, goalId: null });
    t.f.complete(task.id);
    expect(t.s.ledger.pool()).toBe(15);
  });

  scenario('[F-08] Tắt Pool', () => {
    const t = createTestApp();
    t.f.settings({ smallThreshold: 0 });
    const task = t.f.task({ contribution: 5, estimated: 60 });
    t.f.complete(task.id);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(5);
    expect(t.f.count('pool_ledger')).toBe(0);
  });

  scenario('[F-08] Pool bền vững', () => {
    const t = createTestApp('2026-11-30T10:00:00.000Z');
    t.f.pool(70);
    t.clock.set('2026-12-01T10:00:00.000Z');
    t.f.tick();
    expect(t.s.ledger.pool()).toBe(70);
    const sum = (t.db.prepare('SELECT SUM(amount) s FROM pool_ledger').get() as { s: number }).s;
    expect(sum).toBe(70);
  });

  scenario('[F-08] Hiển thị Pool trên Dashboard', async () => {
    const t = createTestApp();
    t.f.pool(35);
    const res = await t.api.get('/api/v1/xp/summary');
    expect(res.body.pool).toBe(35);
    expect(res.body.poolTarget).toBe(100);
  });
});
