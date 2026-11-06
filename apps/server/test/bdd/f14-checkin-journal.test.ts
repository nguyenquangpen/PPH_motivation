import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f14-checkin-journal.json');
const TODAY = '2026-11-06'; // DEFAULT_NOW = 10:00 Asia/Ho_Chi_Minh

describe('F-14 Check-in Journal', () => {
  scenario('[F-14] Tạo Check-in', async () => {
    const t = createTestApp();
    expect(t.f.count('checkins')).toBe(0);
    const res = await t.api.put('/api/v1/checkins/today', { mood: 4, note: 'Học tốt' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: TODAY, mood: 4, note: 'Học tốt' });
    const list = await t.api.get(`/api/v1/checkins?from=${TODAY}&to=${TODAY}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ date: TODAY, mood: 4, note: 'Học tốt' });
  });

  scenario('[F-14] Tối đa 1 entry mỗi ngày', async () => {
    const t = createTestApp();
    await t.api.put('/api/v1/checkins/today', { mood: 4 });
    const res = await t.api.put('/api/v1/checkins/today', { mood: 2 });
    expect(res.status).toBe(200);
    expect(t.f.count('checkins WHERE date = ?', TODAY)).toBe(1);
    const list = await t.api.get('/api/v1/checkins');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].mood).toBe(2);
  });

  scenario('[F-14] Note quá dài', async () => {
    const t = createTestApp();
    const res = await t.api.put('/api/v1/checkins/today', { mood: 3, note: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(t.f.count('checkins')).toBe(0);
    const ok = await t.api.put('/api/v1/checkins/today', { note: 'a'.repeat(2000) });
    expect(ok.status).toBe(200);
  });

  scenario('[F-14] Không ảnh hưởng Streak và XP', async () => {
    const t = createTestApp();
    expect(t.s.streak.get().current).toBe(0);
    const res = await t.api.put('/api/v1/checkins/today', { mood: 5, note: 'Ổn' });
    expect(res.status).toBe(200);
    t.f.tick();
    expect(t.s.streak.get().current).toBe(0);
    expect(t.s.streak.get().calendar.at(-1)!.state).toBe('EMPTY');
    expect(t.f.xpTx()).toHaveLength(0);
    expect(t.s.ledger.balances().lifetime).toBe(0);
  });

  scenario('[F-14] Không sửa ngày cũ', async () => {
    const t = createTestApp('2026-11-05T03:00:00.000Z');
    await t.api.put('/api/v1/checkins/today', { mood: 3, note: 'Hôm qua' });
    t.clock.advanceDays(1);
    const res = await t.api.put('/api/v1/checkins/2026-11-05', { mood: 1, note: 'Sửa' });
    expect(res.status).toBe(422);
    const list = await t.api.get('/api/v1/checkins?from=2026-11-05&to=2026-11-05');
    expect(list.body[0]).toMatchObject({ mood: 3, note: 'Hôm qua' });
  });
});
