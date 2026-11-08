import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f05-task-management.json');
const base = { title: 'Task', priority: 'MEDIUM', contribution: 10, estimatedDuration: 30 };

describe('F-05 Task Management', () => {
  scenario('[F-05] Tạo Task hợp lệ', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const res = await t.api.post('/api/v1/tasks', { title: 'Học 100 từ', priority: 'HIGH', contribution: 100, goalId: g, estimatedDuration: 120 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('TODO');
    expect(res.body.expectedXp.nominalXp).toBe(200);
    const list = await t.api.get('/api/v1/tasks');
    expect(list.body.map((x: any) => x.id)).toContain(res.body.id);
  });

  scenario('[F-05] Thiếu trường bắt buộc', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/tasks', { title: 'Chỉ có title' });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.issues.map((i: any) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['priority', 'estimatedDuration']));
  });

  scenario('[F-05] Biên Contribution', async () => {
    const t = createTestApp();
    const st = async (c: number) => (await t.api.post('/api/v1/tasks', { ...base, contribution: c })).status;
    expect([await st(-1), await st(0), await st(10000), await st(10001)]).toEqual([400, 201, 201, 400]);
  });

  scenario('[F-05] Biên Estimated Duration', async () => {
    const t = createTestApp();
    const st = async (d: number) => (await t.api.post('/api/v1/tasks', { ...base, estimatedDuration: d })).status;
    expect([await st(0), await st(1), await st(1440), await st(1441)]).toEqual([400, 201, 201, 400]);
  });

  scenario('[F-05] Preset Contribution', async () => {
    const t = createTestApp();
    expect((await t.api.get('/api/v1/settings')).body.presetMajor).toBe(100);
    const res = await t.api.post('/api/v1/tasks', { ...base, contribution: 80 });
    expect(res.body.contribution).toBe(80);
  });

  scenario('[F-05] Task không gắn Goal', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/tasks', base);
    expect(res.status).toBe(201);
    expect(res.body.goalId).toBeNull();
  });

  scenario('[F-05] Goal không hợp lệ', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    t.db.prepare('UPDATE goals SET deleted_at = ? WHERE id = ?').run(t.ctx.nowIso(), g);
    const res = await t.api.post('/api/v1/tasks', { ...base, goalId: g });
    expect(res.status).toBe(400);
    expect(t.f.count('tasks')).toBe(0);
  });

  scenario('[F-05] Milestone khác Goal', async () => {
    const t = createTestApp();
    const g1 = t.f.goal({ title: 'G1' });
    const g2 = t.f.goal({ title: 'G2' });
    const m = t.f.milestone(g2);
    const res = await t.api.post('/api/v1/tasks', { ...base, goalId: g1, milestoneIds: [m] });
    expect(res.status).toBe(422);
  });

  scenario('[F-05] Priority không ảnh hưởng XP', async () => {
    const t = createTestApp();
    const a = await t.api.post('/api/v1/tasks', { ...base, priority: 'CRITICAL', contribution: 50, estimatedDuration: 60 });
    const b = await t.api.post('/api/v1/tasks', { ...base, priority: 'LOW', contribution: 50, estimatedDuration: 60 });
    expect(a.body.expectedXp.nominalXp).toBe(50);
    expect(b.body.expectedXp.nominalXp).toBe(50);
  });

  scenario('[F-05] Deadline chỉ chọn ngày', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/tasks', { ...base, deadline: '2026-11-10' });
    expect(res.body.deadline).toBe('2026-11-10T16:59:00.000Z'); // 23:59 +07:00
  });

  scenario('[F-05] Deadline trong quá khứ', async () => {
    const t = createTestApp(); // 10:00 +07:00
    const res = await t.api.post('/api/v1/tasks', { ...base, deadline: '2026-11-06T09:00:00+07:00' });
    expect(res.status).toBe(400);
  });

  scenario('[F-05] Xóa Task chưa hoàn thành', async () => {
    const t = createTestApp();
    const task = t.f.task();
    const res = await t.api.del(`/api/v1/tasks/${task.id}`);
    expect(res.status).toBe(200);
    expect((await t.api.get('/api/v1/tasks')).body).toHaveLength(0);
    expect(t.f.count('xp_transactions') + t.f.count('contribution_ledger')).toBe(0);
  });

  scenario('[F-05] Xóa Task COMPLETED', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const task = t.f.task({ contribution: 100, estimated: 120, goalId: g });
    const penalty = t.f.xp('PENALTY', 100, 'TASK', task.id);
    t.f.complete(task.id);
    const res = await t.api.del(`/api/v1/tasks/${task.id}?confirm=true`);
    expect(res.status).toBe(200);
    expect(t.f.count("contribution_ledger WHERE type='REVERSAL' AND amount=-100")).toBe(1);
    expect(t.f.xpTx('REWARD_REVERSAL').map((x) => x.lifetime_delta)).toEqual([-200]);
    expect(t.f.count('tasks WHERE id = ? AND deleted_at IS NOT NULL', task.id)).toBe(1);
    expect(t.s.ledger.isReversed(penalty.id)).toBe(false);
  });

  scenario('[F-05] Hủy xác nhận xóa Task COMPLETED', async () => {
    const t = createTestApp();
    const task = t.f.task();
    t.f.complete(task.id);
    const txBefore = t.f.count('xp_transactions');
    const res = await t.api.del(`/api/v1/tasks/${task.id}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CONFIRM_REQUIRED');
    expect(t.s.tasks.get(task.id).status).toBe('COMPLETED');
    expect(t.f.count('xp_transactions')).toBe(txBefore);
  });
});
