import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f07-task-xp.json');

const xpCase = (name: string, c: number, est: number, act: number | undefined, xp: number) =>
  scenario(name, () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: c, estimated: est });
    t.f.start(task.id);
    t.f.complete(task.id, act);
    const rewards = t.f.xpTx('TASK_REWARD');
    if (xp) {
      expect(rewards).toHaveLength(1);
      expect(rewards[0]!.lifetime_delta).toBe(xp);
    } else expect(rewards).toHaveLength(0);
  });

describe('F-07 Task XP', () => {
  xpCase('[F-07] XP: C=100, est=120, actual=– → 200', 100, 120, undefined, 200);
  xpCase('[F-07] XP: C=100, est=15, actual=– → 50', 100, 15, undefined, 50);
  xpCase('[F-07] XP: C=100, est=600, actual=– → 200', 100, 600, undefined, 200);
  xpCase('[F-07] XP: C=100, est=120, actual=45 → 75', 100, 120, 45, 75);
  xpCase('[F-07] XP: C=50, est=60, actual=90 → 50', 50, 60, 90, 50);
  xpCase('[F-07] XP: C=30, est=45, actual=– → 23', 30, 45, undefined, 23);
  xpCase('[F-07] XP: C=25, est=50, actual=– → 21', 25, 50, undefined, 21);

  scenario('[F-07] Task nhỏ không nhận XP ngay', () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 19, estimated: 60 });
    t.f.start(task.id);
    t.f.complete(task.id);
    expect(t.f.xpTx('TASK_REWARD')).toHaveLength(0);
    expect(t.s.ledger.pool()).toBe(19);
  });

  scenario('[F-07] Biên Task lớn', () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 20, estimated: 60 });
    t.f.start(task.id);
    t.f.complete(task.id);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(20);
    expect(t.f.count('pool_ledger')).toBe(0);
  });

  scenario('[F-07] Task không gắn Goal vẫn nhận XP', () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 100, estimated: 60, goalId: null });
    t.f.complete(task.id);
    expect(t.f.xpTx('TASK_REWARD')[0]!.lifetime_delta).toBe(100);
  });

  scenario('[F-07] Dùng Settings tại thời điểm hoàn thành', () => {
    const t = createTestApp();
    const a = t.f.task({ title: 'A', contribution: 100, estimated: 60 });
    const b = t.f.task({ title: 'B', contribution: 100, estimated: 60 });
    t.f.complete(a.id);
    t.f.start(b.id);
    t.f.settings({ multiplier: 2.0 });
    t.f.complete(b.id);
    const r = t.f.xpTx('TASK_REWARD');
    expect(r.find((x) => x.source_id === a.id)!.lifetime_delta).toBe(100);
    expect(r.find((x) => x.source_id === b.id)!.lifetime_delta).toBe(200);
  });

  scenario('[F-07] Hiển thị XP dự kiến', async () => {
    const t = createTestApp();
    t.f.task({ title: 'A', contribution: 100, estimated: 120 });
    t.f.task({ title: 'B', contribution: 10, estimated: 30 });
    const res = await t.api.get('/api/v1/tasks');
    const a = res.body.find((x: any) => x.title === 'A');
    const b = res.body.find((x: any) => x.title === 'B');
    expect(a.expectedXp).toEqual({ isSmall: false, nominalXp: 200, immediateXp: 200, poolContribution: 0 });
    expect(b.expectedXp).toMatchObject({ isSmall: true, immediateXp: 0, poolContribution: 10 });
  });
});
