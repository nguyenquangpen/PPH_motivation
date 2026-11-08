import { describe, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { bdd } from '../helpers.js';
import {
  addSession, calApp, connectedApp, local, mapping, moveSession, notifCount, push, sessionRow, syncedSession,
} from './calendar-setup.js';
import { createSecretStore } from '../../src/modules/calendar/secret-store.js';

const scenario = bdd('f23-push-to-google.json');
const T19 = local('2026-11-10T19:00');
const T20 = local('2026-11-10T20:00');

describe('F-23 Push Hub → Google', () => {
  scenario('[F-23] Tạo phiên tạo Event', async () => {
    const t = await connectedApp();
    const goalId = t.f.goal({ title: 'Nghiên cứu' });
    const task = t.f.task({ title: 'Viết báo cáo', goalId, priority: 'HIGH', contribution: 100 }).id;
    const s = await addSession(t, task, T19, T20);
    t.clock.advanceMinutes(0.5); // worker chạy trong vòng ≤ 60 giây
    await push(t);

    const events = t.fake.hubEvents();
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect([e.start, e.end]).toEqual([T19, T20]);
    expect(e.title).toBe('Viết báo cáo');
    expect(e.description).toContain('Nghiên cứu');
    expect(e.description).toContain('HIGH');
    expect(e.description).toContain('100');
    expect(e.description).toContain('Quản lý bởi Productivity Hub');
    expect(mapping(t, s.id)!.status).toBe('SYNCED');
  });

  scenario('[F-23] Sửa giờ phiên', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await moveSession(t, session.id, local('2026-11-10T20:00'), local('2026-11-10T21:00'));
    await push(t);
    const e = t.fake.findEvent(eventId)!;
    expect([e.start, e.end]).toEqual([local('2026-11-10T20:00'), local('2026-11-10T21:00')]);
    expect(t.fake.hubEvents()).toHaveLength(1);
  });

  scenario('[F-23] Xóa phiên', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    expect((await t.api.del(`/api/v1/sessions/${session.id}`)).status).toBe(200);
    await push(t);
    expect(t.fake.findEvent(eventId)).toBeUndefined();
    expect(mapping(t, session.id)).toBeUndefined();
  });

  scenario('[F-23] Đổi tiêu đề Task', async () => {
    const t = await connectedApp();
    const { taskId } = await syncedSession(t);
    await syncedSession(t, { taskId, start: local('2026-11-11T19:00'), end: local('2026-11-11T20:00') });
    expect((await t.api.patch(`/api/v1/tasks/${taskId}`, { title: 'Báo cáo v2' })).status).toBe(200);
    await push(t);
    const events = t.fake.hubEvents();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.title)).toEqual(['Báo cáo v2', 'Báo cáo v2']);
  });

  scenario('[F-23] Hoàn thành Task', async () => {
    const t = await connectedApp();
    const { taskId, eventId } = await syncedSession(t);
    t.f.complete(taskId);
    await push(t);
    expect(t.fake.findEvent(eventId)!.title).toBe('✓ Viết báo cáo');
  });

  scenario('[F-23] Hoàn tác Task', async () => {
    const t = await connectedApp();
    const { taskId, eventId } = await syncedSession(t);
    t.f.complete(taskId);
    await push(t);
    expect(t.fake.findEvent(eventId)!.title).toBe('✓ Viết báo cáo');
    t.f.undo(taskId);
    await push(t);
    expect(t.fake.findEvent(eventId)!.title).toBe('Viết báo cáo');
  });

  scenario('[F-23] Hủy hoặc xóa Task', async () => {
    const t = await connectedApp();
    const a = await syncedSession(t, { title: 'A' });
    const a2 = await syncedSession(t, { taskId: a.taskId, start: local('2026-11-11T19:00'), end: local('2026-11-11T20:00') });
    const b = await syncedSession(t, { title: 'B', start: local('2026-11-12T19:00'), end: local('2026-11-12T20:00') });
    const b2 = await syncedSession(t, { taskId: b.taskId, start: local('2026-11-13T19:00'), end: local('2026-11-13T20:00') });
    expect(t.fake.hubEvents()).toHaveLength(4);

    expect((await t.api.post(`/api/v1/tasks/${a.taskId}/cancel`, {})).status).toBe(200);
    expect((await t.api.del(`/api/v1/tasks/${b.taskId}`)).status).toBe(200);
    await push(t);

    for (const id of [a.eventId, a2.eventId, b.eventId, b2.eventId]) expect(t.fake.findEvent(id)).toBeUndefined();
    expect(t.fake.hubEvents()).toHaveLength(0);
  });

  scenario('[F-23] Không chờ Google', async () => {
    const t = await connectedApp();
    t.fake.setLatency(300); // thay cho 30 giây
    const task = t.f.task().id;
    const started = Date.now();
    const s = await addSession(t, task, T19, T20);
    const pushing = push(t);
    // thao tác khác trong Hub vẫn phản hồi ngay khi Google còn đang chậm
    expect((await t.api.patch(`/api/v1/tasks/${task}`, { title: 'Đổi tên' })).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(250);
    expect(t.fake.hubEvents()).toHaveLength(0);
    await pushing;
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(1);
    expect(t.fake.hubEvents()[0]!.title).toBe('Đổi tên');
    expect(mapping(t, s.id)!.status).toBe('SYNCED');
  });

  scenario('[F-23] Gộp thay đổi liên tiếp', async () => {
    const t = await connectedApp();
    t.fake.failNext(Infinity, 'transient');
    const task = t.f.task().id;
    const s = await addSession(t, task, T19, T20);
    await push(t);
    await moveSession(t, s.id, local('2026-11-10T21:00'), local('2026-11-10T22:00'));
    await push(t);
    t.fake.clearFailures();
    t.clock.advanceMinutes(16);
    await push(t);

    const events = t.fake.hubEvents();
    expect(events).toHaveLength(1);
    expect([events[0]!.start, events[0]!.end]).toEqual([local('2026-11-10T21:00'), local('2026-11-10T22:00')]);
  });

  scenario('[F-23] Hàng đợi bền qua khởi động lại', async () => {
    const secrets = createSecretStore();
    const t = calApp(undefined, undefined, secrets);
    await t.s.calendar.connect();
    t.fake.failNext(Infinity, 'transient');
    const s = await addSession(t, t.f.task().id, T19, T20);
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(0);

    // Hub khởi động lại: cùng database, provider mới chưa nạp token
    t.fake.useTokens(null);
    t.fake.clearFailures();
    t.clock.advanceMinutes(5);
    const { ctx } = buildApp(t.db, t.clock, { calendarProvider: t.fake, secretStore: secrets });
    await ctx.services.calendar.pushNow();

    expect(t.fake.hubEvents()).toHaveLength(1);
    expect(t.fake.hubEvents()[0]!.hubSessionId).toBe(s.id);
    expect(t.fake.countCalls('createEvent')).toBe(2); // 1 lần lỗi + 1 lần thành công
    expect(mapping(t, s.id)!.status).toBe('SYNCED');
  });

  scenario('[F-23] Retry lỗi tạm thời', async () => {
    const t = await connectedApp();
    t.fake.failNext(3, 'transient');
    const s = await addSession(t, t.f.task().id, T19, T20);
    const delays: string[] = [];
    for (let i = 0; i < 20 && mapping(t, s.id)!.status !== 'SYNCED'; i++) {
      await push(t);
      const m = t.db.prepare('SELECT next_attempt_at FROM calendar_mappings WHERE session_id = ?').get(s.id) as { next_attempt_at: string | null };
      if (m.next_attempt_at) delays.push(m.next_attempt_at);
      t.clock.advanceMinutes(0.5);
    }
    expect(mapping(t, s.id)!.status).toBe('SYNCED');
    expect(t.fake.hubEvents()).toHaveLength(1);
    // 3 lần 503 (create + các lần findHubEvent kiểm tra trước khi tạo lại) rồi thành công
    expect(t.fake.countCalls('createEvent') + t.fake.countCalls('findHubEvent')).toBe(4 + 1);
    expect(notifCount(t, 'CALENDAR_SYNC_ERROR')).toBe(0);
    expect(t.s.calendar.status().status).toBe('ACTIVE');
    // khoảng chờ tăng dần
    const gaps = [...new Set(delays)].map((d, i, arr) => (i === 0 ? 0 : new Date(d).getTime() - new Date(arr[i - 1]!).getTime()));
    expect(gaps.slice(1).every((g, i, arr) => i === 0 || g >= arr[i - 1]!)).toBe(true);
  });

  scenario('[F-23] Lỗi kéo dài', async () => {
    const t = await connectedApp();
    t.fake.failNext(Infinity, 'transient');
    const task = t.f.task().id;
    await addSession(t, task, T19, T20);
    for (let i = 0; i < 45; i++) {
      await push(t);
      t.clock.advanceMinutes(1);
      t.f.tick();
      await t.s.calendar.idle();
    }
    expect(t.s.calendar.status().status).toBe('ERROR');
    expect(notifCount(t, 'CALENDAR_SYNC_ERROR')).toBe(1);
    // Hub vẫn hoạt động
    expect((await t.api.patch(`/api/v1/tasks/${task}`, { title: 'Vẫn sửa được' })).status).toBe(200);
    expect((await t.api.post('/api/v1/tasks', { title: 'Task mới', priority: 'LOW', contribution: 10, estimatedDuration: 30 })).status).toBe(201);
  });

  scenario('[F-23] Không trùng khi mất phản hồi', async () => {
    const t = await connectedApp();
    t.fake.failNext(1, 'lostResponse');
    const s = await addSession(t, t.f.task().id, T19, T20);
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(1); // Google đã tạo nhưng Hub không biết
    expect(mapping(t, s.id)!.status).toBe('ERROR');
    t.clock.advanceMinutes(1);
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(1);
    expect(t.fake.countCalls('findHubEvent')).toBe(1);
    expect(mapping(t, s.id)!.status).toBe('SYNCED');
  });

  scenario('[F-23] Phiên quá khứ không đẩy', async () => {
    const t = await connectedApp();
    const s = await addSession(t, t.f.task().id, local('2026-11-08T19:00'), local('2026-11-08T20:00'));
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(0);
    expect(t.fake.countCalls('createEvent')).toBe(0);
    expect(mapping(t, s.id)).toBeUndefined();
  });

  scenario('[F-23] Không đụng Event của Owner', async () => {
    const t = await connectedApp();
    const [meeting] = t.fake.addExternalEvent({ title: 'Họp nhóm', start: local('2026-11-10T09:00'), end: local('2026-11-10T10:00') });
    const { taskId, eventId } = await syncedSession(t);
    expect((await t.api.del(`/api/v1/tasks/${taskId}`)).status).toBe(200);
    await push(t);
    expect(t.fake.findEvent(meeting!)!.title).toBe('Họp nhóm');
    expect(t.fake.findEvent(eventId)).toBeUndefined();
    expect(t.fake.calls.filter((c) => c.eventId === meeting)).toHaveLength(0);
  });

  scenario('[F-23] Cập nhật Event đã bị xóa trên Google', async () => {
    const t = await connectedApp();
    const { taskId, session, eventId } = await syncedSession(t);
    t.fake.owner.deleteEvent(eventId);
    await moveSession(t, session.id, local('2026-11-10T21:00'), local('2026-11-10T22:00'));
    await push(t);

    expect(sessionRow(t, session.id).deleted_at).not.toBeNull();
    expect((await t.api.get(`/api/v1/tasks/${taskId}/sessions`)).body).toHaveLength(0);
    expect(mapping(t, session.id)!.status).toBe('DETACHED');
    expect(notifCount(t, 'CALENDAR_EVENT_DELETED')).toBe(1);
    await push(t);
    expect(t.fake.hubEvents()).toHaveLength(0);
    expect(t.fake.countCalls('createEvent')).toBe(1);
  });
});
