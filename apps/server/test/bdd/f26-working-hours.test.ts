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
const scenario = bdd('f26-working-hours.json');
const DEFAULT_DAY = [{ start: '08:00', end: '22:00' }];

describe('F-26 Working Hours', () => {
  scenario('[F-26] Mặc định', async () => {
    const t = createTestApp(MON_0800);
    const r = await t.api.get('/api/v1/scheduling/working-hours');
    expect(r.status).toBe(200);
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) expect(r.body[d]).toEqual(DEFAULT_DAY);
  });

  scenario('[F-26] Nhiều khung một ngày', async () => {
    const t = createTestApp(MON_0800);
    const cur = (await t.api.get('/api/v1/scheduling/working-hours')).body;
    const mon = [{ start: '06:00', end: '07:30' }, { start: '19:00', end: '23:00' }];
    const r = await t.api.put('/api/v1/scheduling/working-hours', { ...cur, mon });
    expect(r.status).toBe(200);
    expect(r.body.mon).toEqual(mon);
    expect(t.s.settings.get().workingHours.mon).toEqual(mon);
    expect(t.f.activity().some((a) => a.type === 'SETTINGS_CHANGED' && a.message.startsWith('WorkingHours'))).toBe(true);
  });

  scenario('[F-26] Ngày nghỉ', async () => {
    const t = createTestApp('2026-11-14T16:00:00.000Z'); // Thứ Bảy 23:00 +07:00
    const cur = (await t.api.get('/api/v1/scheduling/working-hours')).body;
    expect((await t.api.put('/api/v1/scheduling/working-hours', { ...cur, sun: [] })).body.sun).toEqual([]);
    const task = t.f.task({ estimated: 60 });
    const sg = await t.api.get(`/api/v1/tasks/${task.id}/suggestions`);
    expect(sg.body.options.length).toBeGreaterThan(0);
    for (const o of sg.body.options) for (const x of o.sessions) expect(new Date(x.start).getTime() >= new Date(at('2026-11-16', '00:00')).getTime()).toBe(true);
    expect(sg.body.options[0].sessions[0].start).toBe(at('2026-11-16', '08:00'));
  });

  scenario('[F-26] Khung không hợp lệ', async () => {
    const t = createTestApp(MON_0800);
    const cur = (await t.api.get('/api/v1/scheduling/working-hours')).body;
    const r = await t.api.put('/api/v1/scheduling/working-hours', {
      ...cur, tue: [{ start: '19:00', end: '18:00' }], wed: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }],
    });
    expect(r.status).toBe(400);
    const r2 = await t.api.put('/api/v1/scheduling/working-hours', { ...cur, wed: [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }] });
    expect(r2.status).toBe(400);
    expect((await t.api.get('/api/v1/scheduling/working-hours')).body).toEqual(cur);
  });

  scenario('[F-26] Biên 24:00', async () => {
    const t = createTestApp(MON_0800);
    const cur = (await t.api.get('/api/v1/scheduling/working-hours')).body;
    const r = await t.api.put('/api/v1/scheduling/working-hours', { ...cur, fri: [{ start: '20:00', end: '24:00' }] });
    expect(r.status).toBe(200);
    expect(r.body.fri).toEqual([{ start: '20:00', end: '24:00' }]);
  });
});
