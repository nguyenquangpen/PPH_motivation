import { describe, expect } from 'vitest';
import type { ActivityPageDto } from '@pph/shared';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f18-activity-history.json');

describe('F-18 Activity History', () => {
  scenario('[F-18] Ghi nhận hoàn thành Task', async () => {
    const t = createTestApp();
    const g = t.f.goal({ title: 'G', target: 1000 });
    t.db.transaction(() => t.s.ledger.addContribution(g, null, 120))();
    const task = t.f.task({ title: 'T', contribution: 20, estimated: 60, goalId: g });
    t.f.complete(task.id);
    const res = await t.api.get<ActivityPageDto>('/api/v1/activity');
    expect(res.status).toBe(200);
    const messages = res.body.items.map((i) => i.message);
    expect(messages).toContain('Hoàn thành Task T');
    expect(messages).toContain('Goal G: 12,0% → 14,0%');
    expect(messages).toContain('Nhận +20 XP');
  });

  scenario('[F-18] Lọc theo Goal', async () => {
    const t = createTestApp();
    const g1 = t.f.goal({ title: 'G1' });
    const g2 = t.f.goal({ title: 'G2' });
    const a = t.f.task({ title: 'A', goalId: g1 });
    t.f.task({ title: 'B', goalId: g2 });
    t.f.complete(a.id);
    t.s.activity.log({ type: 'GOAL_UPDATED', message: 'Sửa G2', goalId: g2 });
    const res = await t.api.get<ActivityPageDto>(`/api/v1/activity?goalId=${g1}`);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.items.every((i) => i.goalId === g1)).toBe(true);
    expect(res.body.total).toBe(t.f.count('activity_log WHERE goal_id = ?', g1));
  });

  scenario('[F-18] Lọc theo loại và thời gian', async () => {
    const t = createTestApp('2026-10-15T03:00:00.000Z');
    t.s.activity.log({ type: 'REDEMPTION_CREATED', message: 'Đổi thưởng tháng 10' });
    t.s.activity.log({ type: 'TASK_CREATED', message: 'Task tháng 10' });
    t.clock.set('2026-10-31T17:30:00.000Z'); // 01/11 00:30 +07:00
    t.s.activity.log({ type: 'REDEMPTION_CREATED', message: 'Đổi thưởng đầu tháng 11' });
    t.clock.set('2026-11-06T03:00:00.000Z');
    t.s.activity.log({ type: 'REDEMPTION_CREATED', message: 'Đổi thưởng tháng 11' });
    t.s.activity.log({ type: 'TASK_CREATED', message: 'Task tháng 11' });
    const res = await t.api.get<ActivityPageDto>('/api/v1/activity?type=REDEMPTION_CREATED&from=2026-11-01&to=2026-11-30');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.message)).toEqual(['Đổi thưởng tháng 11', 'Đổi thưởng đầu tháng 11']);
    expect(res.body.total).toBe(2);
  });

  scenario('[F-18] Phân trang', async () => {
    const t = createTestApp();
    const base = t.f.count('activity_log');
    expect(base).toBe(0);
    for (let i = 1; i <= 120; i++) {
      t.clock.advanceMinutes(1);
      t.s.activity.log({ type: 'TEST', message: `E${i}` });
    }
    const p1 = await t.api.get<ActivityPageDto>('/api/v1/activity');
    expect(p1.body.items).toHaveLength(50);
    expect(p1.body.items[0]!.message).toBe('E120');
    expect(p1.body.items[49]!.message).toBe('E71');
    expect(p1.body).toMatchObject({ page: 1, pageSize: 50, total: 120, totalPages: 3 });
    const p3 = await t.api.get<ActivityPageDto>('/api/v1/activity?page=3');
    expect(p3.body.items).toHaveLength(20);
    expect(p3.body.items.at(-1)!.message).toBe('E1');
  });

  scenario('[F-18] Bất biến', async () => {
    const t = createTestApp();
    const id = t.s.activity.log({ type: 'TEST', message: 'Gốc' });
    const patch = await t.api.patch(`/api/v1/activity/${id}`, { message: 'Sửa' });
    const del = await t.api.del(`/api/v1/activity/${id}`);
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    const detail = await t.api.get(`/api/v1/activity/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.message).toBe('Gốc');
    expect(t.f.count('activity_log')).toBe(1);
  });

  scenario('[F-18] Chi tiết before/after', async () => {
    const t = createTestApp();
    const g = t.f.goal({ target: 1000 });
    const res = await t.api.patch(`/api/v1/goals/${g}`, { targetContribution: 1500 });
    expect(res.status).toBe(200);
    const list = await t.api.get<ActivityPageDto>(`/api/v1/activity?goalId=${g}`);
    const entry = list.body.items.find((i) => JSON.stringify(i.before).includes('1000') && JSON.stringify(i.after).includes('1500'));
    expect(entry).toBeDefined();
    const detail = await t.api.get(`/api/v1/activity/${entry!.id}`);
    expect(detail.body.goalId).toBe(g);
    expect(JSON.stringify(detail.body.before)).toContain('1000');
    expect(JSON.stringify(detail.body.after)).toContain('1500');
  });
});
