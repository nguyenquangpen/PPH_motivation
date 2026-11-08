import { expect } from 'vitest';
import type { SessionDto } from '@pph/shared';
import { FakeCalendarProvider } from '../../src/modules/calendar/fake-provider.js';
import { createSecretStore } from '../../src/modules/calendar/secret-store.js';
import { createTestApp, type TestApp } from '../helpers.js';

/** Giờ địa phương +07:00 → ISO UTC */
export const local = (s: string) => new Date(`${s}:00+07:00`).toISOString();
/** Thứ Hai 2026-11-09 08:00 (+07:00) */
export const MONDAY_8 = local('2026-11-09T08:00');

export type CalApp = TestApp & { fake: FakeCalendarProvider };

export function calApp(now = MONDAY_8, fake = new FakeCalendarProvider(), secretStore = createSecretStore()): CalApp {
  const t = createTestApp(now, { calendarProvider: fake, secretStore });
  return Object.assign(t, { fake });
}

/** "Google Calendar giả lập đang kết nối (ACTIVE), lịch primary trống" */
export async function connectedApp(now = MONDAY_8): Promise<CalApp> {
  const t = calApp(now);
  await t.s.calendar.connect();
  expect(t.s.calendar.status().status).toBe('ACTIVE');
  return t;
}

export async function addSession(t: TestApp, taskId: string, start: string, end: string): Promise<SessionDto> {
  const r = await t.api.post<SessionDto>(`/api/v1/tasks/${taskId}/sessions`, { start, end });
  expect(r.status).toBe(201);
  return r.body;
}

export async function moveSession(t: TestApp, sessionId: string, start: string, end: string): Promise<SessionDto> {
  const r = await t.api.patch<SessionDto>(`/api/v1/sessions/${sessionId}`, { start, end });
  expect(r.status).toBe(200);
  return r.body;
}

export const push = (t: TestApp) => t.s.calendar.pushNow();
export const pull = (t: TestApp) => t.s.calendar.pullNow();

export const mapping = (t: TestApp, sessionId: string) =>
  t.db.prepare('SELECT * FROM calendar_mappings WHERE session_id = ?').get(sessionId) as
    { status: string; event_id: string | null; pending_op: string | null } | undefined;

export const sessionRow = (t: TestApp, id: string) =>
  t.db.prepare('SELECT * FROM task_sessions WHERE id = ?').get(id) as { start: string; end: string; deleted_at: string | null };

export const notifCount = (t: TestApp, type: string) => t.f.count('notifications WHERE type = ?', type);

/** Task + phiên đã đồng bộ thành Event */
export async function syncedSession(t: CalApp, o: { title?: string; start?: string; end?: string; taskId?: string } = {}) {
  const taskId = o.taskId ?? t.f.task({ title: o.title ?? 'Viết báo cáo' }).id;
  const s = await addSession(t, taskId, o.start ?? local('2026-11-10T19:00'), o.end ?? local('2026-11-10T20:00'));
  await push(t);
  const m = mapping(t, s.id)!;
  expect(m.status).toBe('SYNCED');
  return { taskId, session: s, eventId: m.event_id! };
}
