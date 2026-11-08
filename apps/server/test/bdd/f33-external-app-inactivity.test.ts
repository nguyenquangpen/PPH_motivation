import { describe, expect } from 'vitest';
import { bdd, envelope, send, setupApp } from './_integrations.js';

const scenario = bdd('f33-external-app-inactivity.json');

const inactive = (t: any) =>
  t.db.prepare("SELECT title FROM notifications WHERE type = 'EXTERNAL_APP_INACTIVE' ORDER BY rowid").all() as { title: string }[];

/** Gửi một sự kiện hoạt động tại thời điểm hiện tại của đồng hồ. */
async function activityNow(t: any, key: string) {
  const r = await send(t, key, envelope({ type: 'lesson.completed', occurredAt: t.ctx.nowIso() }));
  expect(r.status).toBe(202);
}

describe('F-33 External App Inactivity', () => {
  scenario('[F-33] Quá 3 ngày', async () => {
    const { t, key } = await setupApp();
    await activityNow(t, key);
    t.clock.advanceHours(3 * 24 + 1);
    t.f.tick();
    expect(inactive(t).map((n) => n.title)).toEqual(['Bạn chưa ghi nhận hoạt động từ Japanese Learning App trong 3 ngày']);
  });

  scenario('[F-33] Chưa tới ngưỡng', async () => {
    const { t, key } = await setupApp();
    await activityNow(t, key);
    t.clock.advanceHours(2 * 24 + 23);
    t.f.tick();
    expect(inactive(t)).toHaveLength(0);
  });

  scenario('[F-33] Heartbeat không tính', async () => {
    const { t, key } = await setupApp();
    await activityNow(t, key);
    t.clock.advanceHours(4 * 24 - 1);
    await t.api.call('POST', '/api/v1/integrations/events', envelope({ type: 'external_app.heartbeat', occurredAt: t.ctx.nowIso() }), { authorization: 'Bearer ' + key });
    t.clock.advanceMinutes(50);
    t.f.tick();
    expect(inactive(t)).toHaveLength(1);
  });

  scenario('[F-33] Một lần mỗi đợt', async () => {
    const { t, key } = await setupApp();
    await activityNow(t, key);
    t.clock.advanceHours(3 * 24 + 1);
    t.f.tick();
    expect(inactive(t)).toHaveLength(1);
    for (let i = 0; i < 2; i++) {
      t.clock.advanceDays(1);
      t.f.tick();
    }
    expect(inactive(t)).toHaveLength(1);
    await activityNow(t, key);
    t.f.tick();
    expect(inactive(t)).toHaveLength(1);
    t.clock.advanceHours(3 * 24 + 1);
    t.f.tick();
    t.f.tick();
    expect(inactive(t)).toHaveLength(2);
  });

  scenario('[F-33] Tần suất WEEKLY và NONE', async () => {
    const { t, key, appRef } = await setupApp();
    await activityNow(t, key);
    t.clock.advanceDays(5);
    await t.api.patch(`/api/v1/integrations/apps/${appRef}`, { expectedFrequency: 'WEEKLY' });
    t.f.tick();
    expect(inactive(t)).toHaveLength(0);
    await t.api.patch(`/api/v1/integrations/apps/${appRef}`, { expectedFrequency: 'NONE' });
    t.f.tick();
    expect(inactive(t)).toHaveLength(0);
  });

  scenario('[F-33] App chưa từng hoạt động', async () => {
    const { t } = await setupApp();
    t.clock.advanceDays(10);
    t.f.tick();
    expect(inactive(t)).toHaveLength(0);
  });
});
