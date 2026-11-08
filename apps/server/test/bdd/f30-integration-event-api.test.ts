import { describe, expect } from 'vitest';
import { bdd, envelope, eventRow, process, rule, send, setupApp } from './_integrations.js';

const scenario = bdd('f30-integration-event-api.json');

describe('F-30 Integration Event API', () => {
  scenario('[F-30] Nhận sự kiện mới', async () => {
    const { t, key } = await setupApp();
    const ev = envelope();
    const r = await send(t, key, ev);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ success: true, event_id: ev.event_id, status: 'accepted' });
    // Lưu trước khi xử lý: ngay sau phản hồi, hàng đã tồn tại (RECEIVED hoặc đã được xử lý)
    expect(eventRow(t, ev.event_id)).toBeTruthy();
  });

  scenario('[F-30] Trùng y hệt', async () => {
    const { t, key, appRef } = await setupApp();
    const g = t.f.goal({ title: 'Học 1000 từ' });
    await rule(t, appRef, g);
    const ev = envelope();
    await send(t, key, ev);
    process(t);
    const xpBefore = t.f.xpTx().length;
    const r = await send(t, key, ev);
    process(t);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('duplicate');
    expect(t.s.ledger.goalContribution(g)).toBe(20);
    expect(t.f.xpTx()).toHaveLength(xpBefore);
  });

  scenario('[F-30] Trùng id khác nội dung', async () => {
    const { t, key } = await setupApp();
    const ev = envelope({ data: { count: 20 } });
    await send(t, key, ev);
    const r = await send(t, key, { ...ev, data: { count: 30 } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONFLICT');
  });

  scenario('[F-30] Thiếu hoặc sai key', async () => {
    const { t } = await setupApp();
    const r1 = await send(t, null, envelope());
    const r2 = await send(t, 'pph_wrongwrongwrongwrongwrongwrong12', envelope());
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r1.body.error.code).toBe('UNAUTHORIZED');
    expect(r2.body.error.code).toBe('UNAUTHORIZED');
    expect(t.f.count('integration_events')).toBe(0);
  });

  scenario('[F-30] app_id không khớp key', async () => {
    const { t, key } = await setupApp();
    const r = await send(t, key, envelope({ appId: 'other-app' }));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  scenario('[F-30] Envelope sai', async () => {
    const { t, key } = await setupApp();
    const base = envelope();
    const { subject: _s, ...noSubject } = base;
    const cases: [unknown, string][] = [
      [{ ...base, event_id: 'not-a-uuid' }, 'event_id'],
      [{ ...base, schema_version: 2 }, 'schema_version'],
      [{ ...base, occurred_at: '2026-11-06T09:30:00' }, 'occurred_at'],
      [noSubject, 'subject'],
    ];
    for (const [body, field] of cases) {
      const r = await send(t, key, body);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION');
      expect(r.body.error.details.fields).toContain(field);
    }
  });

  scenario('[F-30] data sai đặc tả', async () => {
    const { t, key } = await setupApp();
    const r = await send(t, key, envelope({ data: { count: 0 } }));
    expect(r.status).toBe(400);
  });

  scenario('[F-30] occurred_at ở tương lai', async () => {
    const { t, key } = await setupApp(); // now = 10:00 +07:00
    const ok = await send(t, key, envelope({ occurredAt: '2026-11-06T10:04:00+07:00' }));
    const bad = await send(t, key, envelope({ occurredAt: '2026-11-06T10:06:00+07:00' }));
    expect(ok.status).toBe(202);
    expect(bad.status).toBe(400);
  });

  scenario('[F-30] Body quá lớn', async () => {
    const { t, key } = await setupApp();
    const r = await send(t, key, envelope({ data: { count: 1, deck: 'x'.repeat(70 * 1024) } }));
    expect(r.status).toBe(413);
    expect(t.f.count('integration_events')).toBe(0);
  });

  scenario('[F-30] Loại sự kiện mới', async () => {
    const { t, key } = await setupApp();
    const ev = envelope({ type: 'kanji.mastered', data: { count: 3 } });
    const r = await send(t, key, ev);
    expect(r.status).toBe(202);
    process(t);
    expect(eventRow(t, ev.event_id)!.status).toBe('IGNORED');
  });

  scenario('[F-30] Heartbeat', async () => {
    const { t, key, appRef } = await setupApp();
    const ev = envelope({ type: 'external_app.heartbeat' });
    const r = await send(t, key, ev);
    expect(r.status).toBe(202);
    const app = (await t.api.get(`/api/v1/integrations/apps/${appRef}`)).body;
    expect(app.lastHeartbeatAt).toBe(t.ctx.nowIso());
    expect(app.lastActivityAt).toBeNull();
    expect(eventRow(t, ev.event_id)).toMatchObject({ status: 'PROCESSED', is_activity: 0 });
    const list = (await t.api.get('/api/v1/integrations/events')).body;
    expect(list.items.map((e: any) => e.eventId)).not.toContain(ev.event_id);
  });

  scenario('[F-30] Key bị thu hồi', async () => {
    const { t, key, keyId } = await setupApp();
    expect((await t.api.del(`/api/v1/integrations/keys/${keyId}`)).status).toBe(200);
    const r = await send(t, key, envelope());
    expect(r.status).toBe(401);
  });
});
