import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers.js';

// helpers.bdd() chỉ đọc thư mục BDD Release 1 → bản cục bộ cho thư mục Release 2.
const R2 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'requirements', '2026-11-07-pph-release-2-bdd');
const bdd = (file: string) => {
  const names = new Set((JSON.parse(readFileSync(join(R2, file), 'utf8')) as { bdd: { scenario: string }[] }[]).flatMap((f) => f.bdd.map((s) => s.scenario)));
  return (name: string, fn: () => void | Promise<void>) => {
    if (!names.has(name)) throw new Error(`Scenario không có trong ${file}: "${name}"`);
    it(name, fn);
  };
};
const scenario = bdd('f21-task-work-sessions.json');

const MON_0800 = '2026-11-09T01:00:00.000Z'; // Thứ Hai 08:00 +07:00
const s = (date: string, from: string, to: string) => ({ start: `${date}T${from}:00+07:00`, end: `${date}T${to}:00+07:00` });

describe('F-21 Task Work Sessions', () => {
  scenario('[F-21] Thêm phiên hợp lệ', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task({ estimated: 120 });
    const events: unknown[] = [];
    t.ctx.events.on('session.changed', (p) => events.push(p));
    const res = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    expect(res.status).toBe(201);
    expect(res.body.start).toBe('2026-11-10T12:00:00.000Z');
    expect(res.body.minutes).toBe(60);
    const list = await t.api.get(`/api/v1/tasks/${task.id}/sessions`);
    expect(list.body).toHaveLength(1);
    expect(t.s.sessions.totalMinutes(task.id)).toBe(60);
    expect(t.f.activity().some((a) => a.type === 'SESSION_CREATED')).toBe(true);
    expect(events).toEqual([{ sessionId: res.body.id, taskId: task.id, op: 'CREATE' }]);
    // sửa + xóa cũng phát session.changed
    const u = await t.api.patch(`/api/v1/sessions/${res.body.id}`, s('2026-11-10', '20:00', '21:30'));
    expect(u.body.minutes).toBe(90);
    expect((await t.api.del(`/api/v1/sessions/${res.body.id}`)).status).toBe(200);
    expect(events.map((e: any) => e.op)).toEqual(['CREATE', 'UPDATE', 'DELETE']);
  });

  scenario('[F-21] Nhiều phiên', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task({ estimated: 120 });
    await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-11', '19:00', '20:30'));
    expect(r.status).toBe(201);
    expect(t.s.sessions.listByTask(task.id)).toHaveLength(2);
    expect(t.s.sessions.totalMinutes(task.id)).toBe(150);
  });

  scenario('[F-21] Kết thúc trước bắt đầu', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '20:00', '19:00'));
    expect(r.status).toBe(400);
    expect(t.s.sessions.listByTask(task.id)).toHaveLength(0);
  });

  scenario('[F-21] Biên độ dài phiên', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    const ok = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, { start: '2026-11-10T00:00:00+07:00', end: '2026-11-11T00:00:00+07:00' });
    expect(ok.status).toBe(201);
    expect(ok.body.minutes).toBe(1440);
    const bad = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, { start: '2026-11-12T00:00:00+07:00', end: '2026-11-13T00:01:00+07:00' });
    expect(bad.status).toBe(400);
  });

  scenario('[F-21] Chồng phiên cùng Task', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '19:30', '20:30'));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('CONFLICT');
  });

  scenario('[F-21] Chạm đầu mút', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '10:00', '11:00'));
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '11:00', '12:00'));
    expect(r.status).toBe(201);
  });

  scenario('[F-21] Chồng phiên khác Task', async () => {
    const t = createTestApp(MON_0800);
    const a = t.f.task({ title: 'A' });
    const b = t.f.task({ title: 'B' });
    await t.api.post(`/api/v1/tasks/${a.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    const r = await t.api.post(`/api/v1/tasks/${b.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    expect(r.status).toBe(201);
  });

  scenario('[F-21] Task đã khóa', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    t.f.complete(task.id);
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-10', '19:00', '20:00'));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('TASK_LOCKED');
  });

  scenario('[F-21] Phiên trong quá khứ', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-08', '19:00', '20:00'));
    expect(r.status).toBe(201);
    expect(t.f.count('calendar_mappings WHERE event_id IS NOT NULL')).toBe(0);
  });

  scenario('[F-21] Phiên không đổi Deadline', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task({ deadline: '2026-11-12' });
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, s('2026-11-13', '19:00', '20:00'));
    expect(r.status).toBe(201);
    expect(t.s.tasks.get(task.id).deadline).toBe(task.deadline);
  });

});
