import { describe, expect } from 'vitest';
import { bdd } from '../helpers.js';
import {
  addSession, connectedApp, local, mapping, moveSession, notifCount, pull, push, sessionRow, syncedSession,
} from './calendar-setup.js';

const scenario = bdd('f24-pull-from-google.json');
const taskStatus = (t: Awaited<ReturnType<typeof connectedApp>>, id: string) =>
  (t.db.prepare('SELECT status, deleted_at FROM tasks WHERE id = ?').get(id) as { status: string; deleted_at: string | null });

describe('F-24 Pull changes from Google (Google wins)', () => {
  scenario('[F-24] Đổi giờ trên Google', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await pull(t);
    t.fake.owner.moveEvent(eventId, local('2026-11-10T21:00'), local('2026-11-10T22:00'));
    await pull(t);

    const s = sessionRow(t, session.id);
    expect([s.start, s.end]).toEqual([local('2026-11-10T21:00'), local('2026-11-10T22:00')]);
    const msg = t.f.activity().map((a) => a.message).find((m) => m.startsWith('Giờ cập nhật từ Google Calendar'));
    expect(msg).toBeDefined();
    expect(msg).toMatch(/19:00–20:00 → .*21:00–22:00/);
    // không đẩy ngược lại
    await push(t);
    expect(t.fake.countCalls('updateEvent')).toBe(0);
  });

  scenario('[F-24] Google thắng thay đổi chưa đẩy', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await pull(t);
    t.fake.failNext(Infinity, 'transient');
    await moveSession(t, session.id, local('2026-11-10T20:00'), local('2026-11-10T21:00'));
    await push(t);
    t.fake.owner.moveEvent(eventId, local('2026-11-10T18:00'), local('2026-11-10T19:00'));
    t.fake.clearFailures();
    t.clock.advanceMinutes(1);
    await pull(t);
    await push(t);

    const s = sessionRow(t, session.id);
    expect([s.start, s.end]).toEqual([local('2026-11-10T18:00'), local('2026-11-10T19:00')]);
    const e = t.fake.findEvent(eventId)!;
    expect([e.start, e.end]).toEqual([local('2026-11-10T18:00'), local('2026-11-10T19:00')]);
    expect(mapping(t, session.id)!.pending_op).toBeNull();
  });

  scenario('[F-24] Bỏ qua ràng buộc chồng phiên', async () => {
    const t = await connectedApp();
    const p1 = await syncedSession(t);
    const p2 = await syncedSession(t, { taskId: p1.taskId, start: local('2026-11-10T21:00'), end: local('2026-11-10T22:00') });
    await pull(t);
    t.fake.owner.moveEvent(p2.eventId, local('2026-11-10T19:30'), local('2026-11-10T20:30'));
    await pull(t);
    const s = sessionRow(t, p2.session.id);
    expect([s.start, s.end]).toEqual([local('2026-11-10T19:30'), local('2026-11-10T20:30')]);
  });

  scenario('[F-24] Xóa Event trên Google', async () => {
    const t = await connectedApp();
    const { taskId, session, eventId } = await syncedSession(t, { title: 'T' });
    await pull(t);
    t.fake.owner.deleteEvent(eventId);
    await pull(t);
    await push(t);

    expect(taskStatus(t, taskId)).toEqual({ status: 'TODO', deleted_at: null });
    expect(sessionRow(t, session.id).deleted_at).not.toBeNull();
    expect(mapping(t, session.id)!.status).toBe('DETACHED');
    const n = t.db.prepare("SELECT title FROM notifications WHERE type = 'CALENDAR_EVENT_DELETED'").all() as { title: string }[];
    expect(n.map((x) => x.title)).toEqual(['Lịch của Task T đã bị xóa trên Google Calendar']);
    expect(t.fake.countCalls('createEvent')).toBe(1);
  });

  scenario('[F-24] Đổi thành sự kiện cả ngày', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await pull(t);
    t.fake.convertToAllDay(eventId);
    await pull(t);
    expect(sessionRow(t, session.id).deleted_at).not.toBeNull();
    expect(notifCount(t, 'CALENDAR_EVENT_DELETED')).toBe(1);
  });

  scenario('[F-24] Chuyển sang lịch khác', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await pull(t);
    t.fake.moveToCalendar(eventId, 'Gia đình');
    await pull(t);
    expect(sessionRow(t, session.id).deleted_at).not.toBeNull();
    expect(mapping(t, session.id)!.status).toBe('DETACHED');
    expect(notifCount(t, 'CALENDAR_EVENT_DELETED')).toBe(1);
  });

  scenario('[F-24] Sửa tiêu đề trên Google', async () => {
    const t = await connectedApp();
    const { taskId, eventId } = await syncedSession(t);
    await pull(t);
    t.fake.renameEvent(eventId, 'abc');
    await pull(t);
    expect((t.db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId) as { title: string }).title).toBe('Viết báo cáo');
    expect((await t.api.patch(`/api/v1/tasks/${taskId}`, { priority: 'HIGH' })).status).toBe(200);
    await push(t);
    expect(t.fake.findEvent(eventId)!.title).toBe('Viết báo cáo');
  });

  scenario('[F-24] Event kết thúc không hoàn thành Task', async () => {
    const t = await connectedApp();
    const task = t.f.task().id;
    await addSession(t, task, local('2026-11-09T08:30'), local('2026-11-09T09:00'));
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(1);
    t.clock.set(local('2026-11-09T10:00')); // phiên kết thúc 1 giờ trước
    await pull(t);
    expect(taskStatus(t, task).status).toBe('TODO');
  });

  scenario('[F-24] Task đã xong vẫn nhận giờ', async () => {
    const t = await connectedApp();
    const { taskId, session, eventId } = await syncedSession(t);
    t.f.complete(taskId);
    await push(t);
    expect(t.fake.findEvent(eventId)!.title).toBe('✓ Viết báo cáo');
    await pull(t);
    t.fake.owner.moveEvent(eventId, local('2026-11-10T15:00'), local('2026-11-10T16:00'));
    await pull(t);
    const s = sessionRow(t, session.id);
    expect([s.start, s.end]).toEqual([local('2026-11-10T15:00'), local('2026-11-10T16:00')]);
    expect(taskStatus(t, taskId).status).toBe('COMPLETED');
  });

  scenario('[F-24] Nhịp đọc thay đổi', async () => {
    const t = await connectedApp();
    const pulls = () => t.fake.countCalls('listChanges');
    // Hub khởi động: tick catch-up
    t.f.tick();
    await t.s.calendar.idle();
    expect(pulls()).toBe(1);
    const at: number[] = [];
    for (let m = 1; m <= 10; m++) {
      t.clock.advanceMinutes(1);
      const before = pulls();
      t.f.tick();
      await t.s.calendar.idle();
      if (pulls() > before) at.push(m);
    }
    expect(at).toEqual([5, 10]);

    // focus 3 lần trong cùng 1 phút
    t.clock.advanceMinutes(2);
    const before = pulls();
    const r = [];
    for (let i = 0; i < 3; i++) {
      r.push((await t.api.post('/api/v1/calendar/sync')).body);
      t.clock.advanceMinutes(0.2);
    }
    await t.s.calendar.idle();
    expect(pulls() - before).toBe(1);
    expect(r.map((x) => x.pulled)).toEqual([true, false, false]);
  });
});
