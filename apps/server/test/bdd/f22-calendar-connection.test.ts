import { describe, expect } from 'vitest';
import { bdd } from '../helpers.js';
import { addSession, calApp, connectedApp, local, mapping, moveSession, push, syncedSession } from './calendar-setup.js';

const scenario = bdd('f22-calendar-connection.json');

describe('F-22 Calendar Connection', () => {
  scenario('[F-22] Kết nối lần đầu đẩy phiên tương lai', async () => {
    const t = calApp();
    const a = t.f.task({ title: 'A' }).id;
    const b = t.f.task({ title: 'B' }).id;
    const c = t.f.task({ title: 'C' }).id;
    const sa = await addSession(t, a, local('2026-11-10T19:00'), local('2026-11-10T20:00'));
    await addSession(t, b, local('2026-11-08T19:00'), local('2026-11-08T20:00'));
    await addSession(t, c, local('2026-11-10T09:00'), local('2026-11-10T10:00'));
    t.f.complete(c);

    await t.s.calendar.connect();
    await push(t);

    expect(t.s.calendar.status().status).toBe('ACTIVE');
    const events = t.fake.hubEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.hubSessionId).toBe(sa.id);
    expect(events[0]!.start).toBe(local('2026-11-10T19:00'));
  });

  scenario('[F-22] Trạng thái hiển thị', async () => {
    const t = await connectedApp();
    const r = await t.api.get('/api/v1/calendar/status');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ACTIVE');
    expect(r.body.accountEmail).toBe('owner@example.com');
    expect(r.body.lastSuccessAt).toBe(t.ctx.nowIso());
    expect(r.body.error).toBeNull();
  });

  scenario('[F-22] Token bị thu hồi', async () => {
    const t = await connectedApp();
    t.fake.failNext(Infinity, 'auth');
    const task = t.f.task().id;
    const s = await addSession(t, task, local('2026-11-10T19:00'), local('2026-11-10T20:00'));
    await push(t);

    const st = (await t.api.get('/api/v1/calendar/status')).body;
    expect(st.status).toBe('ERROR');
    expect(st.error).toBe('Cần kết nối lại');
    expect((await t.api.get(`/api/v1/tasks/${task}/sessions`)).body.map((x: { id: string }) => x.id)).toEqual([s.id]);
    // Dừng đồng bộ: không gọi Google thêm
    const before = t.fake.calls.length;
    await push(t);
    await t.s.calendar.pullNow();
    expect(t.fake.calls.length).toBe(before);
    expect(t.f.count("notifications WHERE type = 'CALENDAR_SYNC_ERROR'")).toBe(1);
  });

  scenario('[F-22] Ngắt kết nối', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    const r = await t.api.post('/api/v1/calendar/disconnect');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('NOT_CONNECTED');
    expect(t.fake.findEvent(eventId)).toBeDefined();
    expect(mapping(t, session.id)!.status).toBe('INACTIVE');
    const conn = t.db.prepare('SELECT tokens_enc, account_email FROM calendar_connection').get() as { tokens_enc: string | null };
    expect(conn.tokens_enc).toBeNull();
  });

  scenario('[F-22] Kết nối lại cùng tài khoản', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await t.api.post('/api/v1/calendar/disconnect');
    await moveSession(t, session.id, local('2026-11-10T21:00'), local('2026-11-10T22:00'));
    await push(t);
    expect(t.fake.findEvent(eventId)!.start).toBe(local('2026-11-10T19:00'));

    await t.s.calendar.connect();
    await push(t);

    const e = t.fake.findEvent(eventId)!;
    expect(e.start).toBe(local('2026-11-10T21:00'));
    expect(e.end).toBe(local('2026-11-10T22:00'));
    expect(t.fake.hubEvents()).toHaveLength(1);
    expect(t.fake.countCalls('createEvent')).toBe(1);
    expect(mapping(t, session.id)!.status).toBe('SYNCED');
  });

  scenario('[F-22] Kết nối tài khoản khác', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    const xEvent = { ...t.fake.findEvent(eventId, 'owner@example.com')! };
    await t.api.post('/api/v1/calendar/disconnect');

    t.fake.nextConnectEmail = 'y@example.com';
    await t.s.calendar.connect();
    await push(t);

    const yEvents = t.fake.hubEvents('primary', 'y@example.com');
    expect(yEvents).toHaveLength(1);
    expect(yEvents[0]!.hubSessionId).toBe(session.id);
    expect(t.fake.findEvent(eventId, 'owner@example.com')).toEqual(xEvent);
    expect(t.fake.hubEvents('primary', 'owner@example.com')).toHaveLength(1);
  });

  scenario('[F-22] Bảo mật token', async () => {
    const t = await connectedApp();
    await t.api.put('/api/v1/calendar/oauth-client', { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'SECRET-XYZ' });
    await syncedSession(t);
    const responses = await Promise.all([
      t.api.get('/api/v1/calendar/status'), t.api.get('/api/v1/calendar/oauth-client'), t.api.get('/api/v1/settings'),
      t.api.get('/api/v1/activity'), t.api.get('/api/v1/notifications'),
    ]);
    const oc = responses[1]!.body;
    expect(oc).toEqual({ clientId: 'cid.apps.googleusercontent.com', hasSecret: true });
    for (const r of responses) {
      expect(JSON.stringify(r.body)).not.toContain('fake-token');
      expect(JSON.stringify(r.body)).not.toContain('SECRET-XYZ');
    }
    // Toàn bộ database: không có token/secret dạng đọc được
    const tables = (t.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((x) => x.name);
    for (const name of tables) {
      const dump = JSON.stringify(t.db.prepare(`SELECT * FROM "${name}"`).all());
      expect(dump).not.toContain('fake-token');
      expect(dump).not.toContain('SECRET-XYZ');
    }
    const conn = t.db.prepare('SELECT tokens_enc FROM calendar_connection').get() as { tokens_enc: string };
    expect(conn.tokens_enc.startsWith('v1:')).toBe(true);
  });
});
