import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorkingHours } from '@pph/shared';
import { createTestApp, type TestApp } from '../helpers.js';

// helpers.bdd() chỉ đọc thư mục BDD Release 1 → bản cục bộ cho thư mục Release 2.
const R2 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'requirements', '2026-11-07-pph-release-2-bdd');
const bdd = (file: string) => {
  const names = new Set((JSON.parse(readFileSync(join(R2, file), 'utf8')) as { bdd: { scenario: string }[] }[]).flatMap((f) => f.bdd.map((s) => s.scenario)));
  return (name: string, fn: () => void | Promise<void>) => {
    if (!names.has(name)) throw new Error(`Scenario không có trong ${file}: "${name}"`);
    it(name, fn);
  };
};

const MON_0800 = '2026-11-09T01:00:00.000Z'; // Thứ Hai 08:00 +07:00
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const ses = (date: string, from: string, to: string) => ({ start: `${date}T${from}:00+07:00`, end: `${date}T${to}:00+07:00` });
const EMPTY: WorkingHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const hours = (t: TestApp, patch: Partial<WorkingHours>, base: WorkingHours = EMPTY) => t.f.settings({ workingHours: { ...base, ...patch } });
/** Kết nối Google giả lập ACTIVE + Event bận trong lịch primary (calendar.busy đọc từ cache). */
const connectCalendar = (t: TestApp, busy: [string, string][] = []) => {
  t.db.prepare(`UPDATE calendar_connection SET status='ACTIVE', last_pull_at=?, busy_calendar_ids='["primary"]', account_email='owner@example.com' WHERE id=1`).run(t.ctx.nowIso());
  busy.forEach(([start, end], i) =>
    t.db.prepare(`INSERT INTO calendar_events_cache (event_id, calendar_id, start, end, all_day, transparency, declined, hub_session_id, title)
      VALUES (?, 'primary', ?, ?, 0, 'opaque', 0, NULL, 'Busy')`).run(`busy-${i}`, start, end));
};
const addSession = (t: TestApp, taskId: string, s: { start: string; end: string }) => t.db.transaction(() => t.s.sessions.create(taskId, s))();
const scenario = bdd('f28-feasibility-warnings.json');
const warn = async (t: TestApp) => (await t.api.get('/api/v1/scheduling/warnings')).body;
const insuff = (w: any, taskId: string) => w.tasks.find((x: any) => x.kind === 'INSUFFICIENT' && x.taskId === taskId);
/** Task estimated `est` có phiên dài `minutes` (Thứ Ba từ 08:00). */
const taskWith = (t: TestApp, est: number, minutes: number, o: { contribution?: number; title?: string } = {}) => {
  const task = t.f.task({ estimated: est, contribution: o.contribution ?? 10, title: o.title });
  const start = new Date(at('2026-11-10', '08:00'));
  if (minutes > 0) addSession(t, task.id, { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() });
  return task;
};

describe('F-28 Feasibility Warnings', () => {
  scenario('[F-28] Thiếu thời gian', async () => {
    const t = createTestApp(MON_0800);
    const task = taskWith(t, 120, 30);
    expect(insuff(await warn(t), task.id)).toMatchObject({ estimatedMinutes: 120, scheduledMinutes: 30, missingMinutes: 90, accepted: false });
  });

  scenario('[F-28] Biên thiếu 15 phút', async () => {
    const t = createTestApp(MON_0800);
    const a = taskWith(t, 120, 105, { title: 'A' });
    const b = taskWith(t, 120, 106, { title: 'B' });
    const w = await warn(t);
    expect(insuff(w, a.id)).toBeTruthy();
    expect(insuff(w, b.id)).toBeUndefined();
  });

  scenario('[F-28] Biên phần trăm', async () => {
    const t = createTestApp(MON_0800);
    const task = taskWith(t, 300, 280);
    expect(insuff(await warn(t), task.id)).toBeUndefined();
  });

  scenario('[F-28] Chưa có phiên', async () => {
    const t = createTestApp(MON_0800);
    const task = taskWith(t, 120, 0);
    expect(insuff(await warn(t), task.id)).toBeUndefined();
  });

  scenario('[F-28] Task lớn chưa đủ giờ (Should)', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task({ contribution: 100, estimated: 180, deadline: '2026-11-12' });
    const w = await warn(t);
    expect(w.tasks.find((x: any) => x.kind === 'BIG_TASK_UNDER_SCHEDULED' && x.taskId === task.id)).toMatchObject({ scheduledMinutes: 0, missingMinutes: 180 });
  });

  scenario('[F-28] Ngày quá tải', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t, [[at('2026-11-10', '19:00'), at('2026-11-10', '21:00')]]);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, tue: [{ start: '19:00', end: '23:00' }] } });
    const task = t.f.task({ estimated: 150 });
    addSession(t, task.id, ses('2026-11-10', '21:00', '23:30'));
    expect((await warn(t)).days.find((d: any) => d.date === '2026-11-10')).toMatchObject({ capacityMinutes: 240, loadMinutes: 270 });
  });

  scenario('[F-28] Biên quá tải', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t, [[at('2026-11-10', '19:00'), at('2026-11-10', '21:00')]]);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, tue: [{ start: '19:00', end: '23:00' }] } });
    const task = t.f.task({ estimated: 120 });
    addSession(t, task.id, ses('2026-11-10', '21:00', '23:00'));
    expect((await warn(t)).days.find((d: any) => d.date === '2026-11-10')).toBeUndefined();
  });

  scenario('[F-28] Ngày nghỉ có phiên', async () => {
    const t = createTestApp(MON_0800);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, sun: [] } });
    const task = t.f.task({ estimated: 60 });
    addSession(t, task.id, ses('2026-11-15', '10:00', '11:00'));
    expect((await warn(t)).days.find((d: any) => d.date === '2026-11-15')).toMatchObject({ capacityMinutes: 0, loadMinutes: 60 });
  });

  scenario('[F-28] Cảnh báo khi xếp vào ngày quá tải', async () => {
    const t = createTestApp(MON_0800);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, tue: [{ start: '19:00', end: '20:00' }] } });
    const other = t.f.task({ title: 'Other', estimated: 120 });
    addSession(t, other.id, ses('2026-11-10', '19:00', '21:00'));
    const task = t.f.task({ estimated: 60 });
    const r = await t.api.post(`/api/v1/tasks/${task.id}/sessions`, ses('2026-11-10', '21:00', '22:00'));
    expect(r.status).toBe(201);
    expect((await warn(t)).days.find((d: any) => d.date === '2026-11-10')).toMatchObject({ loadMinutes: 180, accepted: false });
  });

  scenario('[F-28] Chấp nhận lịch', async () => {
    const t = createTestApp(MON_0800);
    const task = taskWith(t, 120, 30);
    const r = await t.api.post('/api/v1/scheduling/accept', { kind: 'TASK', ref: task.id });
    expect(r.status).toBe(200);
    expect(insuff(r.body, task.id).accepted).toBe(true);
    await t.api.post(`/api/v1/tasks/${task.id}/sessions`, ses('2026-11-11', '08:00', '08:10'));
    expect(insuff(await warn(t), task.id)).toMatchObject({ accepted: false, missingMinutes: 80 });
  });

  scenario('[F-28] Không thông báo đẩy', async () => {
    const t = createTestApp(MON_0800);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, tue: [{ start: '19:00', end: '20:00' }] } });
    const task = taskWith(t, 600, 30);
    addSession(t, task.id, ses('2026-11-10', '19:00', '21:00'));
    const w = await warn(t);
    expect(insuff(w, task.id)).toBeTruthy();
    expect(w.days.some((d: any) => d.date === '2026-11-10')).toBe(true);
    const notifBefore = t.f.count('notifications');
    const sessionsBefore = JSON.stringify(t.s.sessions.listByTask(task.id));
    t.f.tick();
    expect(t.f.count('notifications')).toBe(notifBefore);
    expect(JSON.stringify(t.s.sessions.listByTask(task.id))).toBe(sessionsBefore);
  });

  scenario('[F-28] Ngưỡng cấu hình được', async () => {
    const t = createTestApp(MON_0800);
    const task = taskWith(t, 120, 110);
    expect(insuff(await warn(t), task.id)).toBeUndefined();
    t.f.settings({ insufficientMinMinutes: 10, insufficientMinPercent: 5 });
    expect(insuff(await warn(t), task.id)).toMatchObject({ missingMinutes: 10 });
  });
});
