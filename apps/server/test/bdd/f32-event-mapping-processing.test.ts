import { describe, expect } from 'vitest';
import { bdd, envelope, eventRow, process, rule, send, setupApp } from './_integrations.js';

const scenario = bdd('f32-event-mapping-processing.json');

const intXp = (t: any) => (t.f.xpTx('TASK_REWARD') as any[]).filter((x) => x.source_type === 'INTEGRATION_EVENT');

describe('F-32 Event Mapping & Processing', () => {
  scenario('[F-32] Ví dụ học 20 từ', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    const ev = envelope({ data: { count: 20 } });
    expect((await send(t, key, ev)).status).toBe(202);
    await new Promise((r) => setImmediate(r)); // xử lý ngay sau request (setImmediate)
    expect(eventRow(t, ev.event_id)!.status).toBe('PROCESSED');
    expect(t.s.ledger.goalContribution(g)).toBe(20);
    const tx = t.db.prepare("SELECT * FROM xp_transactions WHERE source_type = 'INTEGRATION_EVENT'").all() as any[];
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'TASK_REWARD', lifetime_delta: 10, source_id: ev.event_id });
    expect(t.f.activity().map((a) => a.message)).toContain('Học 20 từ vựng — Japanese Learning App (+20 vào Học 1000 từ)');
  });

  scenario('[F-32] Sự kiện nhỏ vào Pool', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    await send(t, key, envelope({ data: { count: 5 } }));
    process(t);
    expect(t.s.ledger.goalContribution(g)).toBe(5);
    expect(t.s.ledger.pool()).toBe(5);
    expect(t.f.xpTx()).toHaveLength(0);
  });

  scenario('[F-32] Dùng duration_minutes của sự kiện', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    await rule(t, appRef, g, { eventType: 'learning.session.completed', field: 'duration_minutes', factor: 1, defaultDurationMinutes: 20 });
    await send(t, key, envelope({
      type: 'learning.session.completed',
      data: { duration_minutes: 60, activity: 'mixed', started_at: '2026-11-06T08:30:00+07:00', ended_at: '2026-11-06T09:30:00+07:00' },
    }));
    process(t);
    expect(t.s.ledger.goalContribution(g)).toBe(60);
    expect(intXp(t).map((x) => x.lifetime_delta)).toEqual([60]);
  });

  scenario('[F-32] Hệ số thập phân làm tròn', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    await rule(t, appRef, g, { eventType: 'lesson.completed', field: 'duration_minutes', factor: 0.5 });
    await send(t, key, envelope({ type: 'lesson.completed', data: { title: 'Bài 3', duration_minutes: 45 } }));
    process(t);
    expect(t.s.ledger.goalContribution(g)).toBe(23);
  });

  scenario('[F-32] Quy tắc FIXED', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    await rule(t, appRef, g, { eventType: 'lesson.completed', mode: 'FIXED', field: null, factor: null, fixed: 30 });
    await send(t, key, envelope({ type: 'lesson.completed' }));
    process(t);
    expect(t.s.ledger.goalContribution(g)).toBe(30);
  });

  scenario('[F-32] Không có quy tắc', async () => {
    const { t, key } = await setupApp();
    const ev = envelope({ type: 'lesson.completed' });
    await send(t, key, ev);
    process(t);
    expect(eventRow(t, ev.event_id)).toMatchObject({ status: 'IGNORED', reason: 'Chưa có quy tắc ánh xạ' });
    expect(t.f.count('contribution_ledger')).toBe(0);
    expect(t.f.xpTx()).toHaveLength(0);
  });

  scenario('[F-32] Goal đã xóa', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    t.db.prepare('UPDATE goals SET deleted_at = ? WHERE id = ?').run(t.ctx.nowIso(), g);
    const ev = envelope();
    await send(t, key, ev);
    process(t);
    const row = eventRow(t, ev.event_id)!;
    expect(row.status).toBe('IGNORED');
    expect(row.reason).toContain('Goal');
    expect(row.reason).toContain('xóa');
  });

  scenario('[F-32] Streak theo occurred_at', async () => {
    const { t, key, appRef } = await setupApp('2026-11-09T03:00:00.000Z');
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    expect(t.s.streak.activeDays().has('2026-11-07')).toBe(false);
    await send(t, key, envelope({ occurredAt: '2026-11-07T21:00:00+07:00' }));
    process(t);
    expect(t.s.streak.activeDays().has('2026-11-07')).toBe(true);
    const tx = t.db.prepare("SELECT created_at FROM xp_transactions WHERE source_type = 'INTEGRATION_EVENT'").get() as { created_at: string };
    expect(tx.created_at).toBe(t.ctx.nowIso());
  });

  scenario('[F-32] Không cộng trùng khi thử lại', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    t.s.integrations.faultHook = (stage) => { if (stage === 'before_contribution') throw new Error('Lỗi giả lập'); };
    const ev = envelope();
    await send(t, key, ev);
    process(t);
    expect(eventRow(t, ev.event_id)!.status).toBe('FAILED');
    t.s.integrations.faultHook = null;
    const r1 = await t.api.post(`/api/v1/integrations/events/${ev.event_id}/retry`);
    const r2 = await t.api.post(`/api/v1/integrations/events/${ev.event_id}/retry`);
    expect(r1.body.status).toBe('PROCESSED');
    expect(r2.body.status).toBe('PROCESSED');
    expect(t.s.ledger.goalContribution(g)).toBe(20);
    expect(t.f.count('contribution_ledger')).toBe(1);
  });

  scenario('[F-32] Nguyên tử khi lỗi', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    t.s.integrations.faultHook = (stage) => { if (stage === 'after_contribution') throw new Error('Lỗi giả lập sau Contribution'); };
    const ev = envelope({ data: { count: 20 } });
    await send(t, key, ev);
    process(t);
    await new Promise((r) => setImmediate(r));
    const row = eventRow(t, ev.event_id)!;
    expect(row.status).toBe('FAILED');
    expect(row.reason).toBe('Lỗi giả lập sau Contribution');
    expect(t.s.ledger.goalContribution(g)).toBe(0);
    expect(t.f.xpTx()).toHaveLength(0);
  });

  scenario('[F-32] Contribution 0', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    await rule(t, appRef, g, { mode: 'FIXED', field: null, factor: null, fixed: 0 });
    const ev = envelope();
    await send(t, key, ev);
    process(t);
    expect(eventRow(t, ev.event_id)!.status).toBe('PROCESSED');
    expect(t.f.count('contribution_ledger')).toBe(0);
    expect(t.f.count('pool_ledger')).toBe(0);
    expect(t.f.xpTx()).toHaveLength(0);
  });

  scenario('[F-32] Quy tắc không hồi tố', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    const old = [envelope({ type: 'lesson.completed' }), envelope({ type: 'lesson.completed' }), envelope({ type: 'lesson.completed' })];
    for (const e of old) await send(t, key, e);
    process(t);
    await rule(t, appRef, g, { eventType: 'lesson.completed', mode: 'FIXED', field: null, factor: null, fixed: 30 });
    process(t);
    for (const e of old) expect(eventRow(t, e.event_id)!.status).toBe('IGNORED');
    const fresh = envelope({ type: 'lesson.completed' });
    await send(t, key, fresh);
    process(t);
    expect(eventRow(t, fresh.event_id)!.status).toBe('PROCESSED');
    expect(t.s.ledger.goalContribution(g)).toBe(30);
  });

  scenario('[F-32] Áp dụng cho IGNORED (Could)', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal();
    const old = [envelope({ type: 'lesson.completed' }), envelope({ type: 'lesson.completed' }), envelope({ type: 'lesson.completed' })];
    for (const e of old) await send(t, key, e);
    process(t);
    const r = await rule(t, appRef, g, { eventType: 'lesson.completed', mode: 'FIXED', field: null, factor: null, fixed: 30 });
    const res = await t.api.post(`/api/v1/integrations/rules/${r.id}/apply-ignored`);
    expect(res.body).toEqual({ processed: 3 });
    for (const e of old) expect(eventRow(t, e.event_id)!.status).toBe('PROCESSED');
    expect(t.s.ledger.goalContribution(g)).toBe(90);
  });

  scenario('[F-32] Trùng quy tắc', async () => {
    const { t, appRef } = await setupApp();
    const g = t.f.goal();
    await rule(t, appRef, g);
    const r = await t.api.post('/api/v1/integrations/rules', {
      appRef, eventType: 'vocabulary.learned', goalId: g, mode: 'FIXED', fixed: 5, defaultDurationMinutes: 20,
    });
    expect(r.status).toBe(409);
  });

  scenario('[F-32] Milestone và Goal 100%', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ', target: 1000 });
    const m = t.f.milestone(g, { threshold: 1000 });
    const task = t.f.task({ goalId: g, contribution: 990 });
    t.f.complete(task.id);
    await rule(t, appRef, g);
    await send(t, key, envelope({ data: { count: 10 } }));
    process(t);
    expect(t.s.ledger.goalContribution(g)).toBe(1000);
    expect((t.db.prepare('SELECT status FROM milestones WHERE id = ?').get(m) as { status: string }).status).toBe('COMPLETED');
    expect(t.f.xpTx('MILESTONE_REWARD').length).toBeGreaterThanOrEqual(1);
    expect(t.f.count("notifications WHERE type = 'GOAL_REACHED_100' AND object_id = ?", g)).toBe(1);
  });
});
