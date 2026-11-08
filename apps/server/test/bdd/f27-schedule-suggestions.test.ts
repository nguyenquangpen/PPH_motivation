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
const scenario = bdd('f27-schedule-suggestions.json');
const sug = async (t: TestApp, taskId: string) => (await t.api.get(`/api/v1/tasks/${taskId}/suggestions`)).body;
/** Spec §7.3: khoảng trống Thứ Tư 14–16, Thứ Năm 09–10 và 14–15 (dựng bằng giờ làm việc). */
const specExample = (t: TestApp) => {
  connectCalendar(t);
  hours(t, { wed: [{ start: '14:00', end: '16:00' }], thu: [{ start: '09:00', end: '10:00' }, { start: '14:00', end: '15:00' }] });
  return t.f.task({ estimated: 120, deadline: '2026-11-13' });
};

describe('F-27 Schedule Suggestions', () => {
  scenario('[F-27] Ví dụ spec §7.3', async () => {
    const t = createTestApp(MON_0800);
    const task = specExample(t);
    const r = await sug(t, task.id);
    expect(r.options).toHaveLength(2);
    expect(r.options[0]).toMatchObject({ kind: 'CONTIGUOUS', complete: true, sessions: [{ start: at('2026-11-11', '14:00'), end: at('2026-11-11', '16:00') }] });
    expect(r.options[1]).toMatchObject({
      kind: 'SPLIT', complete: true, totalMinutes: 120,
      sessions: [{ start: at('2026-11-12', '09:00'), end: at('2026-11-12', '10:00') }, { start: at('2026-11-12', '14:00'), end: at('2026-11-12', '15:00') }],
    });
  });

  scenario('[F-27] Tối đa 3 phương án liền sớm nhất', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t);
    const task = t.f.task({ estimated: 60 });
    const r = await sug(t, task.id);
    expect(r.options).toHaveLength(3);
    expect(r.options.every((o: any) => o.kind === 'CONTIGUOUS' && o.sessions.length === 1 && o.totalMinutes === 60)).toBe(true);
    expect(r.options.map((o: any) => o.sessions[0].start)).toEqual([at('2026-11-09', '08:00'), at('2026-11-10', '08:00'), at('2026-11-11', '08:00')]);
  });

  scenario('[F-27] Làm tròn 15 phút', async () => {
    const t = createTestApp(at('2026-11-09', '09:07'));
    connectCalendar(t);
    const task = t.f.task({ estimated: 30 });
    expect((await sug(t, task.id)).options[0].sessions[0].start).toBe(at('2026-11-09', '09:15'));
  });

  scenario('[F-27] Tránh giờ bận và phiên khác', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t, [[at('2026-11-09', '08:00'), at('2026-11-09', '12:00')]]);
    const other = t.f.task({ title: 'Other' });
    addSession(t, other.id, ses('2026-11-09', '12:00', '13:00'));
    const task = t.f.task({ estimated: 60 });
    expect((await sug(t, task.id)).options[0].sessions[0].start).toBe(at('2026-11-09', '13:00'));
  });

  scenario('[F-27] Chỉ thời lượng còn thiếu', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t);
    const task = t.f.task({ estimated: 120 });
    addSession(t, task.id, ses('2026-11-09', '20:00', '21:00'));
    const r = await sug(t, task.id);
    expect(r.remainingMinutes).toBe(60);
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) expect(o.totalMinutes).toBe(60);
  });

  scenario('[F-27] Đã đủ thời gian', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task({ estimated: 60 });
    addSession(t, task.id, ses('2026-11-09', '20:00', '21:00'));
    const r = await sug(t, task.id);
    expect(r.message).toBe('Task đã đủ thời gian');
    expect(r.options).toEqual([]);
  });

  scenario('[F-27] Phiên chia ≥ 30 phút', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t);
    hours(t, { mon: [{ start: '10:00', end: '10:20' }, { start: '13:00', end: '14:00' }, { start: '16:00', end: '16:30' }] });
    const task = t.f.task({ estimated: 90, deadline: '2026-11-09' });
    const r = await sug(t, task.id);
    const split = r.options.find((o: any) => o.kind === 'SPLIT');
    expect(split.sessions).toEqual([
      { start: at('2026-11-09', '13:00'), end: at('2026-11-09', '14:00') },
      { start: at('2026-11-09', '16:00'), end: at('2026-11-09', '16:30') },
    ]);
  });

  scenario('[F-27] Không đủ chỗ', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t);
    hours(t, { mon: [{ start: '13:00', end: '14:00' }, { start: '16:00', end: '16:40' }] });
    const task = t.f.task({ estimated: 180, deadline: '2026-11-09' });
    const r = await sug(t, task.id);
    expect(r.message).toBe('Không đủ thời gian trống trước Deadline: thiếu 80 phút');
    expect(r.options).toHaveLength(1);
    expect(r.options[0]).toMatchObject({ kind: 'SPLIT', totalMinutes: 100, complete: false });
  });

  scenario('[F-27] Chọn phương án', async () => {
    const t = createTestApp(MON_0800);
    const task = specExample(t);
    const ops: string[] = [];
    t.ctx.events.on('session.changed', (p) => ops.push(p.op));
    const opt = (await sug(t, task.id)).options[1];
    const r = await t.api.post(`/api/v1/tasks/${task.id}/suggestions/apply`, { sessions: opt.sessions });
    expect(r.status).toBe(201);
    expect(t.s.sessions.listByTask(task.id).map((x) => ({ start: x.start, end: x.end }))).toEqual(opt.sessions);
    expect(ops).toEqual(['CREATE', 'CREATE']); // calendar module đẩy 2 Event từ các event này
  });

  scenario('[F-27] Khung bị chiếm khi chọn', async () => {
    const t = createTestApp(MON_0800);
    const task = specExample(t);
    const opt = (await sug(t, task.id)).options[0];
    const other = t.f.task({ title: 'Other' });
    addSession(t, other.id, ses('2026-11-11', '14:00', '15:00'));
    const r = await t.api.post(`/api/v1/tasks/${task.id}/suggestions/apply`, { sessions: opt.sessions });
    expect(r.status).toBe(409);
    expect(t.s.sessions.listByTask(task.id)).toHaveLength(0);
  });

  scenario('[F-27] Không tự xếp lịch', async () => {
    const t = createTestApp(MON_0800);
    connectCalendar(t);
    const task = t.f.task({ estimated: 60, deadline: '2026-11-10' });
    await sug(t, task.id);
    t.f.tick();
    expect(t.s.sessions.listByTask(task.id)).toHaveLength(0);
  });

  scenario('[F-27] Task đã xong', async () => {
    const t = createTestApp(MON_0800);
    const task = t.f.task();
    t.f.complete(task.id);
    expect((await t.api.get(`/api/v1/tasks/${task.id}/suggestions`)).status).toBe(422);
  });
});
