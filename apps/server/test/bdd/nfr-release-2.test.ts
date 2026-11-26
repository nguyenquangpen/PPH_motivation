import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { FixedClock } from '../../src/core/clock.js';
import { backupDb } from '../../src/core/backup.js';
import type { SecretStore } from '../../src/modules/calendar/provider.js';
import { FakeCalendarProvider } from '../../src/modules/calendar/fake-provider.js';
import { createSecretStore } from '../../src/modules/calendar/secret-store.js';
import type { CalendarService } from '../../src/modules/calendar/service.js';
import { bdd, type TestApp } from '../helpers.js';
import { addSession, calApp, connectedApp, local, mapping, moveSession, pull, push, sessionRow, syncedSession } from './calendar-setup.js';
import { APP_ID, envelope, eventRow, rule, send, setupApp } from './_integrations.js';

const scenario = bdd('nfr-release-2.json');
const REPO_DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'data');

const elapsed = async <T>(fn: () => Promise<T>): Promise<{ ms: number; r: T }> => {
  const t0 = performance.now();
  const r = await fn();
  return { ms: performance.now() - t0, r };
};
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]!;
const tickMs = () => new Promise((r) => setImmediate(r));

const pendingCount = (db: TestApp['db']) =>
  (db.prepare('SELECT COUNT(*) c FROM calendar_mappings WHERE pending_op IS NOT NULL').get() as { c: number }).c;

describe('NFR Release 2', () => {
  afterEach(() => vi.restoreAllMocks());

  // ======================= performance =======================

  scenario('[NFR-R2] Đẩy lên Google ≤ 60 giây', async () => {
    const t = await connectedApp();
    const task = t.f.task({ title: 'Viết báo cáo' }).id;
    const createdAt = new Map<string, number>();
    const arrivedAt = new Map<string, number>();
    const observe = () => {
      for (const e of t.fake.hubEvents()) if (!arrivedAt.has(e.hubSessionId!)) arrivedAt.set(e.hubSessionId!, t.clock.now().getTime());
    };
    // 20 phiên liên tiếp, mỗi 2 giây một phiên; timer đẩy của Hub chạy mỗi 10 giây (PUSH_TIMER_MS)
    let sinceTimer = 0;
    for (let i = 0; i < 20; i++) {
      const start = local(`2026-11-1${i % 9 + 1}T${String(6 + Math.floor(i / 9)).padStart(2, '0')}:00`);
      const s = await addSession(t, task, start, new Date(new Date(start).getTime() + 30 * 60_000).toISOString());
      createdAt.set(s.id, t.clock.now().getTime());
      t.clock.advanceMinutes(2 / 60);
      sinceTimer += 2;
      if (sinceTimer >= 10) {
        sinceTimer = 0;
        await push(t);
        observe();
      }
    }
    for (let i = 0; i < 6 && arrivedAt.size < 20; i++) {
      t.clock.advanceMinutes(10 / 60);
      await push(t);
      observe();
    }
    expect(t.fake.hubEvents()).toHaveLength(20);
    for (const [id, c] of createdAt) {
      expect(arrivedAt.has(id)).toBe(true);
      expect(arrivedAt.get(id)! - c).toBeLessThanOrEqual(60_000);
      expect(mapping(t, id)!.status).toBe('SYNCED');
    }
  });

  scenario('[NFR-R2] Đọc từ Google ≤ 5 phút', async () => {
    const t = await connectedApp();
    const { session, eventId } = await syncedSession(t);
    await pull(t); // lần đọc vừa xong → trường hợp xấu nhất: Owner đổi ngay sau đó
    const newStart = local('2026-11-10T21:00');
    const newEnd = local('2026-11-10T22:00');
    t.fake.owner.moveEvent(eventId, newStart, newEnd);
    const changedAt = t.clock.now().getTime();
    let seenAt: number | null = null;
    // scheduler tick mỗi 60 giây (job calendar.pull tự quyết khi nào đọc)
    for (let i = 0; i < 10 && seenAt === null; i++) {
      t.clock.advanceMinutes(1);
      t.f.tick();
      await t.s.calendar.idle();
      if (sessionRow(t, session.id).start === newStart) seenAt = t.clock.now().getTime();
    }
    expect(seenAt).not.toBeNull();
    expect(seenAt! - changedAt).toBeLessThanOrEqual(5 * 60_000);
    expect(sessionRow(t, session.id).end).toBe(newEnd);
  });

  scenario('[NFR-R2] Tiếp nhận sự kiện', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ', target: 1000 });
    await rule(t, appRef, g); // PER_UNIT count × 1, defaultDurationMinutes 20
    const durations: number[] = [];
    const receivedAt = new Map<string, number>();
    const processedAt = new Map<string, number>();
    const stamp = () => {
      const rows = t.db.prepare("SELECT event_id FROM integration_events WHERE status = 'PROCESSED'").all() as { event_id: string }[];
      const now = performance.now();
      for (const r of rows) if (!processedAt.has(r.event_id)) processedAt.set(r.event_id, now);
    };
    for (let i = 0; i < 100; i++) {
      const ev = envelope({ data: { count: 5, level: 'N3' } }); // 100 × 5 = 500 < 1000: Goal không hoàn thành giữa chừng
      const { ms, r } = await elapsed(() => send(t, key, ev));
      expect(r.status).toBe(202);
      durations.push(ms);
      receivedAt.set(ev.event_id, performance.now());
      stamp();
    }
    const deadline = performance.now() + 5000;
    while (processedAt.size < 100 && performance.now() < deadline) {
      await tickMs();
      stamp();
    }
    expect(p95(durations)).toBeLessThanOrEqual(200);
    expect(processedAt.size).toBe(100);
    for (const [id, recv] of receivedAt) {
      expect(eventRow(t, id)!.status).toBe('PROCESSED');
      expect(processedAt.get(id)! - recv).toBeLessThanOrEqual(5000);
    }
    expect(t.s.ledger.goalContribution(g)).toBe(500);
  });

  scenario('[NFR-R2] UI không chờ Google', async () => {
    const t = await connectedApp();
    const other = await syncedSession(t, { title: 'Task khác' }); // Task khác có Event → hoàn thành sẽ phải sửa Event
    t.fake.setLatency(30_000);
    t.s.calendar.startBackground(); // như Hub thật: "đánh thức" worker ngay sau mỗi thay đổi
    try {
      const created = await elapsed(() => t.api.post('/api/v1/tasks', { title: 'Task có phiên', priority: 'HIGH', contribution: 100, estimatedDuration: 60 }));
      expect(created.r.status).toBe(201);
      const withSession = await elapsed(() =>
        t.api.post(`/api/v1/tasks/${created.r.body.id}/sessions`, { start: local('2026-11-11T19:00'), end: local('2026-11-11T20:00') }));
      expect(withSession.r.status).toBe(201);
      await tickMs(); // để worker nền kịp bắt đầu gọi Google (đang treo 30 giây)
      const completed = await elapsed(() => t.api.post(`/api/v1/tasks/${other.taskId}/complete`, {}));
      expect(completed.r.status).toBe(200);

      expect(created.ms).toBeLessThanOrEqual(500);
      expect(withSession.ms).toBeLessThanOrEqual(500);
      expect(completed.ms).toBeLessThanOrEqual(500);
      // Google thật sự đang được gọi (chậm) ở nền, không nằm trên đường request
      expect(t.fake.countCalls('createEvent')).toBeGreaterThanOrEqual(2);
      // Đã ghi vào hàng đợi bền để đẩy sau
      expect(mapping(t, withSession.r.body.id)!.pending_op).toBe('CREATE');
      expect(mapping(t, other.session.id)!.pending_op).toBe('UPDATE');
    } finally {
      t.s.calendar.stopBackground();
    }
  });

  // ======================= reliability =======================

  scenario('[NFR-R2] Không trùng Event', async () => {
    const fake = new FakeCalendarProvider();
    const secrets = createSecretStore();
    const t = calApp(local('2026-11-09T08:00'), fake, secrets);
    await t.s.calendar.connect();
    const db = t.db;
    const clock = t.clock;
    let calendar: CalendarService = t.s.calendar;
    let hubApp = t.app;
    const task = t.f.task({ title: 'Viết báo cáo' }).id;

    const drain = async (rounds = 20) => {
      for (let i = 0; i < rounds && pendingCount(db) > 0; i++) {
        clock.advanceMinutes(16); // > BACKOFF_MAX
        await calendar.pushNow();
      }
    };
    const restart = () => {
      const r = buildApp(db, clock, { calendarProvider: fake, secretStore: secrets });
      calendar = r.ctx.services.calendar;
      hubApp = r.app;
    };

    // 1) tạo 10 phiên; 5 phiên đầu đẩy được, lần tạo thứ 3 mất phản hồi (Event đã tạo trên Google nhưng Hub không biết)
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const day = String(10 + i).padStart(2, '0');
      ids.push((await addSession(t, task, local(`2026-11-${day}T19:00`), local(`2026-11-${day}T20:00`))).id);
      if (i === 4) {
        fake.failNext(2, 'transient');
        fake.failNext(1, 'lostResponse');
        await push(t);
      }
    }
    // 2) mất mạng
    fake.clearFailures();
    fake.failNext(10_000, 'transient');
    await drain(2);
    // 3) sửa 5 phiên (cả đã đồng bộ lẫn chưa), xóa 1 phiên
    for (const id of [ids[0]!, ids[2]!, ids[4]!, ids[6]!, ids[8]!]) {
      const r = sessionRow(t, id);
      await moveSession(t, id, new Date(new Date(r.start).getTime() + 3600_000).toISOString(), new Date(new Date(r.end).getTime() + 3600_000).toISOString());
    }
    expect((await t.api.del(`/api/v1/sessions/${ids[9]}`)).status).toBe(200);
    await drain(2);
    // 4) mạng chập chờn: mất phản hồi giữa chừng
    fake.clearFailures();
    fake.failNext(3, 'lostResponse');
    fake.failNext(10_000, 'transient');
    await drain(3);
    // 5) khởi động lại Hub 2 lần (vẫn mất mạng), có sửa thêm sau lần khởi động đầu
    restart();
    await drain(2);
    const r1 = sessionRow(t, ids[1]!);
    const moved = await hubApp.inject({ method: 'PATCH', url: `/api/v1/sessions/${ids[1]}`, payload: {
      start: new Date(new Date(r1.start).getTime() + 1800_000).toISOString(), end: new Date(new Date(r1.end).getTime() + 1800_000).toISOString(),
    } });
    expect(moved.statusCode).toBe(200);
    restart();
    await drain(2);
    // 6) có mạng lại
    fake.clearFailures();
    await drain();
    await calendar.pullNow();
    await drain();

    expect(pendingCount(db)).toBe(0);
    expect(fake.countCalls('findHubEvent')).toBeGreaterThan(0); // nhánh "mất phản hồi → tìm trước khi tạo lại" đã chạy
    const alive = (db.prepare('SELECT id FROM task_sessions WHERE deleted_at IS NULL').all() as { id: string }[]).map((r) => r.id);
    expect(alive).toHaveLength(9);
    const hub = fake.hubEvents();
    for (const id of alive) {
      const evs = hub.filter((e) => e.hubSessionId === id);
      expect(evs, `phiên ${id}`).toHaveLength(1);
      const s = sessionRow(t, id);
      expect([evs[0]!.start, evs[0]!.end]).toEqual([s.start, s.end]);
      expect(mapping(t, id)!.event_id).toBe(evs[0]!.id);
    }
    // không có Event mồ côi của Hub
    expect(hub.filter((e) => !alive.includes(e.hubSessionId!))).toEqual([]);
    expect(hub).toHaveLength(9);
  });

  // ======================= security =======================

  scenario('[NFR-R2] Bí mật không lộ', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); });
    }
    const fake = new FakeCalendarProvider();
    const secrets: SecretStore = createSecretStore();
    const rawTokens = JSON.stringify({ email: 'owner@example.com', access_token: 'fake-token-owner@example.com' });
    const clientSecret = 'GOCSPX-nfr-test-client-secret-1234567890';
    const t = calApp(local('2026-11-09T08:00'), fake, secrets);
    const responses: { url: string; body: unknown }[] = [];
    const rec = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => {
      const r = await t.api.call(method, url, body);
      responses.push({ url: `${method} ${url}`, body: r.body });
      return r;
    };

    // Given: Calendar ACTIVE (+ OAuth client secret của Owner)
    await rec('PUT', '/api/v1/calendar/oauth-client', { clientId: 'nfr-client.apps.googleusercontent.com', clientSecret });
    await rec('POST', '/api/v1/calendar/connect');
    await t.s.calendar.connect();
    expect(t.s.calendar.status().status).toBe('ACTIVE');
    // Given: App + API key K (response tạo key là nơi DUY NHẤT được hiện key gốc)
    const app = (await rec('POST', '/api/v1/integrations/apps', { name: 'Japanese Learning App', appId: APP_ID })).body;
    const keyRes = await t.api.post(`/api/v1/integrations/apps/${app.id}/keys`, { name: 'Laptop' });
    const apiKey = keyRes.body.key as string;
    expect(apiKey).toMatch(/^pph_/);
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, app.id, g);

    // dùng hệ thống: phiên, đẩy/đọc, sự kiện hợp lệ + key sai + lỗi Google
    const task = t.f.task({ title: 'Viết báo cáo' }).id;
    const s = await addSession(t, task, local('2026-11-10T19:00'), local('2026-11-10T20:00'));
    await push(t);
    await pull(t);
    const ev = envelope({ data: { count: 20 } });
    responses.push({ url: 'POST events', body: (await send(t, apiKey, ev)).body });
    responses.push({ url: 'POST events (bad key)', body: (await send(t, apiKey + 'x', envelope())).body });
    responses.push({ url: 'POST events (dup)', body: (await send(t, apiKey, ev)).body });
    await tickMs();
    t.s.integrations.processPending();
    fake.failNext(1, 'transient');
    await moveSession(t, s.id, local('2026-11-10T20:00'), local('2026-11-10T21:00'));
    await push(t);
    t.f.tick();
    await t.s.calendar.idle();

    // When: mọi response API (GET liệt kê được)
    const from = encodeURIComponent(local('2026-11-09T00:00'));
    const to = encodeURIComponent(local('2026-11-20T00:00'));
    const gets = [
      '/api/v1/health', '/api/v1/settings', '/api/v1/dashboard', '/api/v1/categories', '/api/v1/goals', `/api/v1/goals/${g}`,
      '/api/v1/tasks', `/api/v1/tasks/${task}`, `/api/v1/tasks/${task}/sessions`, `/api/v1/tasks/${task}/suggestions`,
      '/api/v1/activity', '/api/v1/notifications', '/api/v1/xp/summary', '/api/v1/xp/transactions', '/api/v1/xp/reconciliation',
      '/api/v1/milestones', '/api/v1/missed-reasons', '/api/v1/shop/items', '/api/v1/shop/redemptions', '/api/v1/streak', '/api/v1/checkins',
      '/api/v1/scheduling/working-hours', '/api/v1/scheduling/warnings',
      '/api/v1/calendar/status', '/api/v1/calendar/oauth-client', '/api/v1/calendar/calendars',
      `/api/v1/calendar/busy?from=${from}&to=${to}`, `/api/v1/calendar/events?from=${from}&to=${to}`,
      '/api/v1/integrations/apps', `/api/v1/integrations/apps/${app.id}`, '/api/v1/integrations/rules',
      '/api/v1/integrations/events', `/api/v1/integrations/events/${ev.event_id}`,
    ];
    for (const u of gets) await rec('GET', u);
    await rec('POST', '/api/v1/calendar/sync');

    const secretsList = [rawTokens, 'fake-token-owner@example.com', apiKey, apiKey.slice(4), clientSecret];
    const leaks: string[] = [];
    const check = (where: string, text: string) => {
      for (const sec of secretsList) if (text.includes(sec)) leaks.push(`${where} chứa "${sec.slice(0, 12)}…"`);
    };
    for (const r of responses) check(`response ${r.url}`, JSON.stringify(r.body ?? null));
    expect(responses.filter((r) => r.url.startsWith('GET')).length).toBe(gets.length);

    // database: mọi cột text của mọi bảng (gồm activity_log, notifications, integration_events)
    const tables = (t.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['activity_log', 'notifications', 'calendar_connection', 'integration_keys', 'integration_events']));
    for (const name of tables) {
      for (const row of t.db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]) {
        for (const [col, v] of Object.entries(row)) {
          if (typeof v === 'string') check(`${name}.${col}`, v);
          else if (Buffer.isBuffer(v)) check(`${name}.${col}`, v.toString('latin1'));
        }
      }
    }
    // token lưu mã hóa, key lưu băm
    const conn = t.db.prepare('SELECT tokens_enc, oauth_client_secret_enc FROM calendar_connection WHERE id = 1').get() as Record<string, string>;
    expect(conn.tokens_enc).toMatch(/^v1:/);
    expect(conn.oauth_client_secret_enc).toMatch(/^v1:/);
    expect(secrets.decrypt(conn.tokens_enc!)).toBe(rawTokens);

    // log
    for (const l of logs) check('console', l);

    // file backup
    const dir = join(REPO_DATA, `nfr-r2-backup-${randomUUID()}`);
    try {
      const file = await backupDb(t.db, dir, '2026-11-09');
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      check('backup', bytes.toString('latin1'));
      check('backup(utf8)', bytes.toString('utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(leaks).toEqual([]);
  });
});
