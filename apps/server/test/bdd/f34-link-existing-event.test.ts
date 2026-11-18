import { describe, expect } from 'vitest';
import type { ExternalEventDto, SessionDto } from '@pph/shared';
import { bdd } from '../helpers.js';
import { connectedApp, local, pull, push, sessionRow, type CalApp } from './calendar-setup.js';

const scenario = bdd('f34-link-existing-event.json');

/** Primary có Event 'Học N3' Thứ Ba 19:00–21:00 do Owner tạo; Hub đã đọc lịch. */
async function withOwnerEvent(t: CalApp) {
  const [eventId] = t.fake.addExternalEvent({ title: 'Học N3', start: local('2026-11-10T19:00'), end: local('2026-11-10T21:00') });
  t.fake.findEvent(eventId!)!.description = 'Giáo trình Soumatome';
  await pull(t);
  return eventId!;
}

async function link(t: CalApp, taskId: string, eventId: string): Promise<SessionDto> {
  const r = await t.api.post<SessionDto>(`/api/v1/tasks/${taskId}/sessions/link`, { eventId });
  expect(r.status).toBe(201);
  return r.body;
}

describe('F-34 Link Existing Google Event', () => {
  scenario('[F-34] Liên kết Event có sẵn', async () => {
    const t = await connectedApp();
    const eventId = await withOwnerEvent(t);
    const task = t.f.task({ title: 'T' });

    const list = await t.api.get<ExternalEventDto[]>(
      `/api/v1/calendar/events?from=${encodeURIComponent(local('2026-11-09T08:00'))}&to=${encodeURIComponent(local('2026-12-09T08:00'))}`,
    );
    expect(list.body.map((e) => e.title)).toEqual(['Học N3']);

    const s = await link(t, task.id, eventId);
    expect(s.source).toBe('LINKED');
    expect([s.start, s.end]).toEqual([local('2026-11-10T19:00'), local('2026-11-10T21:00')]);

    await push(t);
    await pull(t);
    const ev = t.fake.findEvent(eventId)!;
    expect(ev.title).toBe('Học N3');
    expect(ev.description).toBe('Giáo trình Soumatome');
    expect(ev.hubSessionId).toBeNull();
    expect(t.fake.countCalls('updateEvent')).toBe(0);
    expect(t.fake.countCalls('createEvent')).toBe(0);
    // Event đã liên kết không còn trong danh sách chọn
    const again = await t.api.get<ExternalEventDto[]>(
      `/api/v1/calendar/events?from=${encodeURIComponent(local('2026-11-09T08:00'))}&to=${encodeURIComponent(local('2026-12-09T08:00'))}`,
    );
    expect(again.body).toHaveLength(0);
  });

  scenario('[F-34] Gỡ liên kết không xóa Event', async () => {
    const t = await connectedApp();
    const eventId = await withOwnerEvent(t);
    const task = t.f.task({ title: 'T' });
    const s = await link(t, task.id, eventId);

    expect((await t.api.del(`/api/v1/sessions/${s.id}`)).status).toBe(200);
    await push(t);
    await pull(t);

    expect(sessionRow(t, s.id).deleted_at).not.toBeNull();
    expect(t.fake.findEvent(eventId)?.title).toBe('Học N3');
    expect(t.fake.countCalls('deleteEvent')).toBe(0);
    expect(t.db.prepare('SELECT 1 FROM calendar_mappings WHERE session_id = ?').get(s.id)).toBeUndefined();
  });

  scenario('[F-34] Google thắng với Event liên kết', async () => {
    const t = await connectedApp();
    const eventId = await withOwnerEvent(t);
    const task = t.f.task({ title: 'T' });
    const s = await link(t, task.id, eventId);

    t.fake.owner.moveEvent(eventId, local('2026-11-10T20:00'), local('2026-11-10T22:00'));
    await pull(t);

    const row = sessionRow(t, s.id);
    expect([row.start, row.end]).toEqual([local('2026-11-10T20:00'), local('2026-11-10T22:00')]);
    await push(t);
    expect(t.fake.countCalls('updateEvent')).toBe(0);
  });
});
