import { describe, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@pph/shared';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f10-settings.json');

describe('F-10 Settings', () => {
  scenario('[F-10] Giá trị mặc định', async () => {
    const t = createTestApp();
    const res = await t.api.get('/api/v1/settings');
    expect(res.body).toEqual({
      multiplier: 1.0, refDuration: 60, minFactor: 0.5, maxFactor: 2.0, smallThreshold: 20, poolTarget: 100, poolRewardXp: 120,
      defaultMilestoneXp: 300, defaultGoalXp: 1000, xpPerLevel: 1000, penaltyEnabled: true, penaltyPercent: 50, gracePeriodHours: 24,
      freezesPerMonth: 2, behindMargin: 15, nearDueDays: 14, presetMajor: 100, presetMedium: 50, presetMinor: 10,
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  scenario('[F-10] Thay đổi không hồi tố', () => {
    const t = createTestApp();
    t.f.pool(90);
    t.f.complete(t.f.task({ contribution: 10 }).id);
    t.f.settings({ poolRewardXp: 200 });
    for (let i = 0; i < 10; i++) t.f.complete(t.f.task({ contribution: 10 }).id);
    const pr = t.f.xpTx('POOL_REWARD').map((x) => x.lifetime_delta);
    expect(pr).toEqual([120, 200]);
  });

  scenario('[F-10] Ràng buộc liên trường', async () => {
    const t = createTestApp();
    const res = await t.api.put('/api/v1/settings', { minFactor: 3.0, maxFactor: 2.0, poolTarget: 150 });
    expect(res.status).toBe(400);
    const s = t.s.settings.get();
    expect([s.minFactor, s.maxFactor, s.poolTarget]).toEqual([0.5, 2.0, 100]);
  });

  scenario('[F-10] Biên PenaltyPercent', async () => {
    const t = createTestApp();
    expect((await t.api.put('/api/v1/settings', { penaltyPercent: 0 })).status).toBe(200);
    expect((await t.api.put('/api/v1/settings', { penaltyPercent: 100 })).status).toBe(200);
    expect((await t.api.put('/api/v1/settings', { penaltyPercent: 101 })).status).toBe(400);
    expect(t.s.settings.get().penaltyPercent).toBe(100);
  });

  scenario('[F-10] Ghi lịch sử thay đổi', async () => {
    const t = createTestApp();
    await t.api.put('/api/v1/settings', { gracePeriodHours: 48 });
    expect(t.f.activity().some((a) => a.message === 'GracePeriodHours: 24 → 48')).toBe(true);
  });

  scenario('[F-10] Khôi phục mặc định theo nhóm', async () => {
    const t = createTestApp();
    t.f.settings({ multiplier: 2.0, penaltyPercent: 80 });
    const res = await t.api.post('/api/v1/settings/reset', { group: 'xp' });
    expect(res.status).toBe(200);
    expect(res.body.multiplier).toBe(1.0);
    expect(res.body.penaltyPercent).toBe(80);
  });

  scenario('[F-10] Múi giờ không hợp lệ', async () => {
    const t = createTestApp();
    const res = await t.api.put('/api/v1/settings', { timezone: 'Mars/Base' });
    expect(res.status).toBe(400);
    expect(t.s.settings.get().timezone).toBe(DEFAULT_SETTINGS.timezone);
  });

  scenario('[F-10] Đổi Preset không ảnh hưởng Task cũ', async () => {
    const t = createTestApp();
    const task = t.f.task({ contribution: 100 });
    await t.api.put('/api/v1/settings', { presetMajor: 150 });
    expect(t.s.tasks.get(task.id).contribution).toBe(100);
    expect((await t.api.get('/api/v1/settings')).body.presetMajor).toBe(150);
  });

  scenario('[F-10] Đổi múi giờ không đổi lịch sử', async () => {
    const t = createTestApp('2026-11-05T16:30:00.000Z');
    const task = t.f.task();
    t.f.complete(task.id);
    const before = t.s.tasks.get(task.id).completedAt;
    await t.api.put('/api/v1/settings', { timezone: 'Asia/Tokyo' });
    expect(t.s.tasks.get(task.id).completedAt).toBe(before);
    expect(t.f.activity().some((a) => a.message.startsWith('Timezone:'))).toBe(true);
  });
});
