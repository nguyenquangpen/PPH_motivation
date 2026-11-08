import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f09-xp-ledger-level.json');

describe('F-09 XP Ledger, Balances & Level', () => {
  scenario('[F-09] Thưởng tăng cả hai số dư', () => {
    const t = createTestApp();
    t.f.xp('TASK_REWARD', 200);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 200, spendable: 200 });
  });

  scenario('[F-09] Đổi thưởng chỉ trừ Spendable', () => {
    const t = createTestApp();
    t.f.balances(1500, 1500);
    t.f.xp('REDEEM', 300, 'REDEMPTION');
    expect(t.s.ledger.balances()).toEqual({ lifetime: 1500, spendable: 1200 });
    expect(t.s.ledger.level()).toBe(2);
  });

  scenario('[F-09] Phạt chỉ trừ Spendable', () => {
    const t = createTestApp();
    t.f.balances(1000, 100);
    t.f.xp('PENALTY', 150);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 1000, spendable: -50 });
    expect(t.s.ledger.level()).toBe(2);
  });

  scenario('[F-09] Đảo ngược thưởng trừ cả hai', () => {
    const t = createTestApp();
    t.f.balances(800, 100);
    const task = t.f.task({ contribution: 100, estimated: 120 });
    t.f.complete(task.id); // +200 → 1000 / 300
    expect(t.s.ledger.balances()).toEqual({ lifetime: 1000, spendable: 300 });
    t.f.undo(task.id);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 800, spendable: 100 });
    expect(t.s.ledger.level()).toBe(1);
  });

  scenario('[F-09] Biên Level', () => {
    const t = createTestApp();
    expect([0, 999, 1000, 2500].map((x) => t.s.ledger.levelOf(x))).toEqual([1, 1, 2, 3]);
  });

  scenario('[F-09] Thông báo lên Level', () => {
    const t = createTestApp();
    t.f.balances(950, 950);
    t.f.xp('TASK_REWARD', 100);
    expect(t.s.ledger.level()).toBe(2);
    expect(t.f.count("notifications WHERE type='LEVEL_UP' AND title LIKE '%Level 2%'")).toBe(1);
    expect(t.f.activity().some((a) => a.message === 'Lên Level 2')).toBe(true);
  });

  scenario('[F-09] Giao dịch bất biến', async () => {
    const t = createTestApp();
    const tx = t.f.xp('TASK_REWARD', 10);
    const del = await t.api.call('DELETE', `/api/v1/xp/transactions/${tx.id}`);
    const patch = await t.api.call('PATCH', `/api/v1/xp/transactions/${tx.id}`, { lifetimeDelta: 999 });
    expect(del.status).toBe(404);
    expect(patch.status).toBe(404);
    expect(t.f.xpTx()).toHaveLength(1);
  });

  scenario('[F-09] Đảo ngược tối đa một lần', () => {
    const t = createTestApp();
    const tx = t.f.xp('TASK_REWARD', 100);
    t.db.transaction(() => t.s.ledger.reverseXp(tx.id))();
    expect(() => t.db.transaction(() => t.s.ledger.reverseXp(tx.id))()).toThrow(/đã được đảo ngược/);
    expect(t.f.xpTx('REWARD_REVERSAL')).toHaveLength(1);
  });

  scenario('[F-09] Thông tin giao dịch', async () => {
    const t = createTestApp();
    const task = t.f.task({ title: 'T', contribution: 100 });
    t.f.complete(task.id);
    const res = await t.api.get('/api/v1/xp/transactions?type=TASK_REWARD');
    const tx = res.body.items[0];
    expect(tx).toMatchObject({ type: 'TASK_REWARD', lifetimeDelta: 100, spendableDelta: 100, sourceType: 'TASK', sourceId: task.id });
    expect(tx.id).toBeTruthy();
    expect(tx.reason).toContain('T');
    expect(tx.createdAt).toBeTruthy();
  });

  scenario('[F-09] Lọc Reward History', async () => {
    const t = createTestApp('2026-11-03T03:00:00.000Z');
    t.f.xp('TASK_REWARD', 100);
    t.f.xp('REDEEM', 10, 'REDEMPTION');
    t.f.xp('PENALTY', 20);
    t.clock.set('2026-10-15T03:00:00.000Z');
    t.f.xp('PENALTY', 5);
    const res = await t.api.get('/api/v1/xp/transactions?type=PENALTY&from=2026-10-31T17:00:00.000Z&to=2026-11-30T17:00:00.000Z');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].spendableDelta).toBe(-20);
  });
});
