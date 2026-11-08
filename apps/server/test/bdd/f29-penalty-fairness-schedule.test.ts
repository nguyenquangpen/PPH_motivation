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
const scenario = bdd('f29-penalty-fairness-schedule.json');
const SYS = 'Lịch quá tải/Assistant đề xuất sai';
const PAST_DEADLINE = '2026-11-08T00:00:00.000Z'; // 25 giờ trước MON_0800
const penalties = (t: TestApp, taskId: string) => t.f.xpTx('PENALTY').filter((p) => p.source_id === taskId);
const reasonOf = (t: TestApp, taskId: string) => t.s.tasks.get(taskId).missedReasonTagId;
/** Task quá Deadline + Grace, phiên `minutes` vào Thứ Bảy 2026-11-07 từ 09:00. */
const missedTask = (t: TestApp, est: number, minutes: number) => {
  const id = t.f.taskRaw({ estimated: est, contribution: 100, deadline: PAST_DEADLINE });
  if (minutes > 0) {
    const start = new Date(at('2026-11-07', '09:00'));
    addSession(t, id, { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() });
  }
  return id;
};

describe('F-29 Penalty Fairness for Infeasible Schedules', () => {
  scenario('[F-29] Thiếu thời gian → miễn phạt', async () => {
    const t = createTestApp(MON_0800);
    const id = missedTask(t, 120, 30);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    expect(reasonOf(t, id)).toBe(t.f.tagId(SYS));
  });

  scenario('[F-29] Ngày quá tải → miễn phạt', async () => {
    const t = createTestApp(MON_0800);
    t.f.settings({ workingHours: { ...t.s.settings.get().workingHours, sat: [{ start: '09:00', end: '10:00' }] } });
    const id = missedTask(t, 120, 120); // đủ giờ nhưng Thứ Bảy capacity 60 < load 120
    expect(t.s.scheduling.isInfeasible(id)).toBe(true);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
    expect(reasonOf(t, id)).toBe(t.f.tagId(SYS));
  });

  scenario('[F-29] Đã chấp nhận vẫn miễn', async () => {
    const t = createTestApp(MON_0800);
    const id = missedTask(t, 120, 30);
    expect((await t.api.post('/api/v1/scheduling/accept', { kind: 'TASK', ref: id })).status).toBe(200);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(0);
  });

  scenario('[F-29] Hủy Task Missed có lịch không khả thi', async () => {
    const t = createTestApp(MON_0800);
    const id = t.f.taskRaw({ estimated: 120, contribution: 100, deadline: '2026-11-09T00:00:00.000Z' }); // Missed, còn trong Grace
    addSession(t, id, ses('2026-11-08', '09:00', '09:30'));
    const r = await t.api.post(`/api/v1/tasks/${id}/cancel`, { reasonTagId: t.f.tagId('Trì hoãn') });
    expect(r.status).toBe(200);
    expect(penalties(t, id)).toHaveLength(0);
    expect(reasonOf(t, id)).toBe(t.f.tagId(SYS));
  });

  scenario('[F-29] Không có phiên → quy tắc cũ', async () => {
    const t = createTestApp(MON_0800);
    const id = missedTask(t, 120, 0);
    t.f.tick();
    expect(penalties(t, id).map((p) => p.spendable_delta)).toEqual([-100]);
  });

  scenario('[F-29] Lịch đủ, ngày không quá tải → phạt', async () => {
    const t = createTestApp(MON_0800);
    const id = missedTask(t, 120, 120);
    expect(t.s.scheduling.isInfeasible(id)).toBe(false);
    t.f.tick();
    expect(penalties(t, id)).toHaveLength(1);
  });

  scenario('[F-29] Tag hệ thống', async () => {
    const t = createTestApp(MON_0800);
    const r = await t.api.del(`/api/v1/missed-reasons/${t.f.tagId(SYS)}`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('SYSTEM_TAG');
  });
});
