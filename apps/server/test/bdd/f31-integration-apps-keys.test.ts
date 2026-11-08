import { describe, expect } from 'vitest';
import { createTestApp } from '../helpers.js';
import { APP_ID, bdd, envelope, process, rule, send, setupApp } from './_integrations.js';

const scenario = bdd('f31-integration-apps-keys.json');

describe('F-31 Integration Apps & API Keys', () => {
  scenario('[F-31] Đăng ký app', async () => {
    const t = createTestApp();
    const r = await t.api.post('/api/v1/integrations/apps', { name: 'Japanese Learning App', appId: APP_ID });
    expect(r.status).toBe(201);
    const list = (await t.api.get('/api/v1/integrations/apps')).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Japanese Learning App', appId: APP_ID, status: 'NO_DATA' });
  });

  scenario('[F-31] app_id không hợp lệ hoặc trùng', async () => {
    const t = createTestApp();
    await t.api.post('/api/v1/integrations/apps', { name: 'A', appId: APP_ID });
    const bad = await t.api.post('/api/v1/integrations/apps', { name: 'B', appId: 'Japanese App!' });
    const dup = await t.api.post('/api/v1/integrations/apps', { name: 'C', appId: APP_ID });
    expect(bad.status).toBe(400);
    expect(dup.status).toBe(409);
    expect((await t.api.get('/api/v1/integrations/apps')).body).toHaveLength(1);
  });

  scenario('[F-31] Key hiển thị một lần', async () => {
    const { t, appRef } = await setupApp();
    const created = await t.api.post(`/api/v1/integrations/apps/${appRef}/keys`, { name: 'Laptop' });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^pph_[A-Za-z0-9]{32}$/);
    expect(created.body.last4).toBe(created.body.key.slice(-4));
    const app = (await t.api.get(`/api/v1/integrations/apps/${appRef}`)).body;
    const k = app.keys.find((x: any) => x.id === created.body.id);
    expect(k).toEqual({ id: created.body.id, name: 'Laptop', last4: created.body.last4, createdAt: expect.any(String), revokedAt: null });
    expect(JSON.stringify(app)).not.toContain(created.body.key);
    const rows = t.db.prepare('SELECT * FROM integration_keys').all();
    expect(JSON.stringify(rows)).not.toContain(created.body.key);
  });

  scenario('[F-31] Nhiều key', async () => {
    const { t, appRef } = await setupApp();
    const k1 = (await t.api.post(`/api/v1/integrations/apps/${appRef}/keys`, { name: 'K1' })).body;
    const k2 = (await t.api.post(`/api/v1/integrations/apps/${appRef}/keys`, { name: 'K2' })).body;
    await t.api.del(`/api/v1/integrations/keys/${k1.id}`);
    expect((await send(t, k1.key, envelope())).status).toBe(401);
    expect((await send(t, k2.key, envelope())).status).toBe(202);
  });

  scenario('[F-31] Xóa app', async () => {
    const { t, key, appRef } = await setupApp();
    const k2 = (await t.api.post(`/api/v1/integrations/apps/${appRef}/keys`, { name: 'K2' })).body;
    for (let i = 0; i < 10; i++) expect((await send(t, key, envelope())).status).toBe(202);
    expect((await t.api.del(`/api/v1/integrations/apps/${appRef}`)).status).toBe(200);
    expect((await send(t, key, envelope())).status).toBe(401);
    expect((await send(t, k2.key, envelope())).status).toBe(401);
    const list = (await t.api.get(`/api/v1/integrations/events?appRef=${appRef}`)).body;
    expect(list.items).toHaveLength(10);
  });

  scenario('[F-31] Danh sách app', async () => {
    const { t, key, appRef } = await setupApp();
    // 48 sự kiện bình thường (sự kiện gần nhất 2 giờ trước) + 2 FAILED
    for (let i = 0; i < 50; i++) {
      const hoursAgo = i === 0 ? 2 : 3 + i;
      const occ = new Date(Date.parse(t.ctx.nowIso()) - hoursAgo * 3600_000).toISOString();
      expect((await send(t, key, envelope({ occurredAt: occ }))).status).toBe(202);
    }
    process(t);
    const ids = (t.db.prepare('SELECT event_id FROM integration_events LIMIT 2').all() as { event_id: string }[]).map((r) => r.event_id);
    for (const id of ids) t.db.prepare("UPDATE integration_events SET status='FAILED', reason='x' WHERE event_id = ?").run(id);
    // heartbeat 5 phút trước
    t.db.prepare('UPDATE integration_apps SET last_heartbeat_at = ? WHERE id = ?')
      .run(new Date(Date.parse(t.ctx.nowIso()) - 5 * 60_000).toISOString(), appRef);
    const app = (await t.api.get('/api/v1/integrations/apps')).body[0];
    expect(app.status).toBe('ACTIVE');
    expect(app.lastActivityAt).toBe(new Date(Date.parse(t.ctx.nowIso()) - 2 * 3600_000).toISOString());
    expect(app.lastHeartbeatAt).toBeTruthy();
    expect(app.eventCount).toBe(50);
    expect(app.failedCount).toBe(2);
  });

  scenario('[F-31] Lịch sử sự kiện có lọc', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    await send(t, key, envelope()); // PROCESSED
    await send(t, key, envelope({ type: 'lesson.completed' })); // IGNORED
    process(t);
    t.s.integrations.faultHook = (stage) => { if (stage === 'before_contribution') throw new Error('Lỗi giả lập'); };
    const failed = envelope();
    await send(t, key, failed);
    process(t);
    t.s.integrations.faultHook = null;
    const list = (await t.api.get('/api/v1/integrations/events?status=FAILED')).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0].status).toBe('FAILED');
    const detail = (await t.api.get(`/api/v1/integrations/events/${failed.event_id}`)).body;
    expect(detail.payload).toEqual(failed);
    expect(detail.reason).toBe('Lỗi giả lập');
  });
});
