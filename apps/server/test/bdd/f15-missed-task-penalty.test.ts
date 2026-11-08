import { describe, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FixedClock } from '../../src/core/clock.js';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f15-missed-task-penalty.json');
const HOUR = 3600_000;
const iso = (base: string, hours: number) => new Date(new Date(base).getTime() + hours * HOUR).toISOString();

const penalties = (t: TestApp, taskId: string) => t.f.xpTx('PENALTY').filter((p) => p.source_id === taskId);
const activePenalties = (t: TestApp, taskId: string) => penalties(t, taskId).filter((p) => !t.s.ledger.isReversed(p.id));
const review = (t: TestApp, id: string, tag: string, action = 'KEEP', newDeadline?: string) =>
  t.api.post(`/api/v1/tasks/${id}/missed-review`, { reasonTagId: t.f.tagId(tag), action, newDeadline });

describe('F-15 Missed Task & Penalty', () => {
  scenario('[F-15] Biên Missed', () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: '2026-11-06T10:00:00.000Z' }); // 17:00 Asia/Ho_Chi_Minh
    t.clock.set('2026-11-06T10:00:00.000Z');
    expect(t.s.tasks.get(id).missed).toBe(false);
    t.clock.set('2026-11-06T10:01:00.000Z');
    expect(t.s.tasks.get(id).missed).toBe(true);
  });

  scenario('[F-15] Cảnh báo Missed', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ status: 'IN_PROGRESS', deadline: iso(t.ctx.nowIso(), -1 / 60) });
    t.f.tick();
    t.f.tick();
    expect(t.f.count("notifications WHERE type = 'TASK_MISSED' AND object_id = ?", id)).toBe(1);
    const queue = await t.api.get('/api/v1/tasks?missed=true');
    expect(queue.body.map((x: { id: string }) => x.id)).toContain(id);
    expect(t.s.tasks.get(id).status).toBe('IN_PROGRESS');
  });

  scenario('[F-15] Task không deadline', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: null });
    t.clock.advanceDays(30);
    t.f.tick();
    const queue = await t.api.get('/api/v1/tasks?missed=true');
    expect(queue.body.map((x: { id: string }) => x.id)).not.toContain(id);
    expect(t.s.penalty.missedReviewCount()).toBe(0);
  });

  scenario('[F-15] Phạt sau Grace khi chưa có lý do', () => {
    const t = createTestApp();
    t.f.balances(1000, 300);
    const level = t.s.ledger.level();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(22); // deadline + 23h
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    t.clock.advanceHours(1); // deadline + 24h
    t.f.tick();
    expect(penalties(t, id).map((p) => [p.lifetime_delta, p.spendable_delta])).toEqual([[0, -100]]);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 1000, spendable: 200 });
    expect(t.s.ledger.level()).toBe(level);
  });

  scenario('[F-15] Phạt Task nhỏ', () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 10, estimated: 30, deadline: iso(t.ctx.nowIso(), -1) });
    expect(t.s.tasks.get(id).expectedXp.nominalXp).toBe(5);
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id).map((p) => p.spendable_delta)).toEqual([-3]);
  });

  scenario('[F-15] Lý do miễn trừ trước Grace', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    expect((await review(t, id, 'Bất khả kháng')).status).toBe(200);
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
  });

  scenario('[F-15] Lý do không miễn trừ trước Grace', async () => {
    const t = createTestApp();
    const deadline = iso(t.ctx.nowIso(), -2);
    const id = t.f.taskRaw({ deadline });
    expect((await review(t, id, 'Trì hoãn')).status).toBe(200);
    expect(penalties(t, id)).toHaveLength(0);
    t.clock.set(iso(deadline, 24));
    t.clock.advanceMinutes(-1);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    t.clock.set(iso(deadline, 24));
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(1);
  });

  scenario('[F-15] Hoàn phạt khi đổi sang lý do miễn trừ', async () => {
    const t = createTestApp();
    t.f.balances(150, 150);
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1), reasonTagId: t.f.tagId('Trì hoãn') });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id).map((p) => p.spendable_delta)).toEqual([-100]);
    expect(t.s.ledger.balances().spendable).toBe(50);
    expect((await review(t, id, 'Bất khả kháng')).status).toBe(200);
    const rev = t.f.xpTx('PENALTY_REVERSAL');
    expect(rev.map((r) => r.spendable_delta)).toEqual([100]);
    expect(rev[0]!.reversed_transaction_id).toBe(penalties(t, id)[0]!.id);
    expect(t.s.ledger.balances().spendable).toBe(150);
  });

  scenario('[F-15] Đổi lại lý do không miễn', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1), reasonTagId: t.f.tagId('Trì hoãn') });
    t.clock.advanceHours(24);
    t.f.tick();
    await review(t, id, 'Bất khả kháng');
    expect(t.f.xpTx('PENALTY_REVERSAL')).toHaveLength(1);
    expect(activePenalties(t, id)).toHaveLength(0);
    expect((await review(t, id, 'Trì hoãn')).status).toBe(200);
    expect(penalties(t, id)).toHaveLength(2);
    expect(activePenalties(t, id)).toHaveLength(1);
    // đổi lặp lại cùng tag không phạt thêm; tick không phạt thêm
    await review(t, id, 'Trì hoãn');
    t.f.tick();
    expect(activePenalties(t, id)).toHaveLength(1);
  });

  scenario('[F-15] Goal Paused tự miễn', () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'PAUSED' });
    const id = t.f.taskRaw({ goalId: g, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    const tagId = t.s.tasks.get(id).missedReasonTagId!;
    expect(t.s.penalty.getTag(tagId).name).toBe('Goal đang Paused');
  });

  scenario('[F-15] Penalty tắt', async () => {
    const t = createTestApp();
    t.f.settings({ penaltyEnabled: false });
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    const queue = await t.api.get('/api/v1/tasks?missed=true');
    expect(queue.body.map((x: { id: string }) => x.id)).toContain(id);
  });

  scenario('[F-15] Tắt Penalty không hồi tố', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(penalties(t, id).map((p) => p.spendable_delta)).toEqual([-100]);
    expect((await t.api.put('/api/v1/settings', { penaltyEnabled: false })).status).toBe(200);
    t.f.tick();
    expect(activePenalties(t, id).map((p) => p.spendable_delta)).toEqual([-100]);
    expect(t.f.xpTx('PENALTY_REVERSAL')).toHaveLength(0);
  });

  scenario('[F-15] Grace = 0', () => {
    const t = createTestApp();
    t.f.settings({ gracePeriodHours: 0 });
    const id = t.f.taskRaw({ contribution: 100, estimated: 60, deadline: iso(t.ctx.nowIso(), 1) });
    expect(t.s.tasks.get(id).expectedXp.nominalXp).toBe(100);
    t.clock.advanceHours(1); // đúng deadline → chưa Missed
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    t.clock.advanceMinutes(1);
    expect(t.s.tasks.get(id).missed).toBe(true);
    t.f.tick();
    expect(penalties(t, id).map((p) => p.spendable_delta)).toEqual([-50]);
  });

  scenario('[F-15] Dời deadline', async () => {
    const t = createTestApp(); // 2026-11-06 10:00 Asia/Ho_Chi_Minh
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    const res = await review(t, id, 'Ước lượng sai', 'RESCHEDULE', '2026-11-08T17:00:00+07:00');
    expect(res.status).toBe(200);
    expect(res.body.deadline).toBe('2026-11-08T10:00:00.000Z');
    expect(res.body.missed).toBe(false);
    const queue = await t.api.get('/api/v1/tasks?missed=true');
    expect(queue.body.map((x: { id: string }) => x.id)).not.toContain(id);
    t.clock.advanceHours(24); // Grace của deadline cũ đã hết
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
  });

  scenario('[F-15] Dời deadline về quá khứ', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -2) });
    const res = await review(t, id, 'Ước lượng sai', 'RESCHEDULE', '2026-11-06T09:00:00+07:00');
    expect(res.status).toBe(400);
    expect(t.s.tasks.get(id).missed).toBe(true);
  });

  scenario('[F-15] Bỏ lỡ lại sau khi dời', async () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24);
    t.f.tick();
    const first = penalties(t, id);
    expect(first).toHaveLength(1);
    const deadline2 = iso(t.ctx.nowIso(), 5);
    expect((await t.api.patch(`/api/v1/tasks/${id}`, { deadline: deadline2 })).status).toBe(200);
    t.clock.advanceHours(5 + 24);
    t.f.tick();
    t.f.tick();
    const all = penalties(t, id);
    expect(all).toHaveLength(2);
    expect(t.s.ledger.isReversed(first[0]!.id)).toBe(false);
    expect(t.s.penalty.activePenaltyId(id, deadline2)).toBe(all[1]!.id);
  });

  scenario('[F-15] Đánh giá bù khi khởi động lại', () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    t.f.tick(); // Hub đang chạy, chưa hết Grace
    expect(penalties(t, id)).toHaveLength(0);
    // Hub tắt; khởi động lại 2 ngày sau deadline + 24h
    const clock = new FixedClock(iso(t.ctx.nowIso(), 23 + 48));
    const restarted = buildApp(t.db, clock);
    restarted.ctx.scheduler.tick(restarted.ctx.nowIso());
    restarted.ctx.scheduler.tick(restarted.ctx.nowIso());
    expect(penalties(t, id)).toHaveLength(1);
  });

  scenario('[F-15] Đánh giá lặp', () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -25) });
    t.f.tick();
    t.f.tick();
    t.db.transaction(() => t.s.penalty.evaluateDue())();
    expect(penalties(t, id)).toHaveLength(1);
  });

  scenario('[F-15] NominalXP bằng 0', () => {
    const t = createTestApp();
    const id = t.f.taskRaw({ contribution: 0, deadline: iso(t.ctx.nowIso(), -1) });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(t.f.xpTx('PENALTY')).toHaveLength(0);
    expect(t.f.activity().some((a) => a.type === 'TASK_PENALIZED' && a.message.includes('0 XP'))).toBe(true);
    expect(t.f.count('penalty_evaluations WHERE task_id = ?', id)).toBe(1);
  });
});
