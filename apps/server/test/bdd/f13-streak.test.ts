import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f13-streak.json');

/** Thời điểm theo giờ Asia/Ho_Chi_Minh. */
const at = (date: string, time = '10:00') => `${date}T${time}:00+07:00`;

/** Đặt đồng hồ vào ngày đó và hoàn thành một Task. */
const completeOn = (t: TestApp, date: string, o: { goalId?: string; time?: string } = {}) => {
  t.clock.set(at(date, o.time));
  const task = t.f.task({ goalId: o.goalId ?? null });
  t.f.complete(task.id);
  return task.id;
};

const dayState = (t: TestApp, date: string) => t.s.streak.get().calendar.find((c) => c.date === date)?.state;

describe('F-13 Streak', () => {
  scenario('[F-13] Ngày active', () => {
    const t = createTestApp(at('2026-11-06'));
    t.f.settings({ freezesPerMonth: 0 });
    completeOn(t, '2026-11-04');
    t.clock.set(at('2026-11-06'));
    t.f.tick();
    expect(t.s.streak.get().current).toBe(0);
    completeOn(t, '2026-11-06');
    expect(t.s.streak.get().current).toBe(1);
  });

  scenario('[F-13] Chuỗi liên tiếp', async () => {
    const t = createTestApp(at('2026-11-04'));
    for (const d of ['2026-11-04', '2026-11-05', '2026-11-06']) {
      completeOn(t, d);
      t.f.tick();
    }
    const res = await t.api.get('/api/v1/streak');
    expect(res.status).toBe(200);
    expect(res.body.current).toBe(3);
  });

  scenario('[F-13] Hôm nay chưa active không đứt chuỗi', () => {
    const t = createTestApp(at('2026-11-04'));
    completeOn(t, '2026-11-04');
    completeOn(t, '2026-11-05');
    t.clock.set(at('2026-11-06', '10:00'));
    t.f.tick();
    expect(t.s.streak.get().current).toBe(2);
    expect(t.f.count('streak_freezes')).toBe(0);
  });

  scenario('[F-13] Dùng Freeze tự động', () => {
    const t = createTestApp(at('2026-10-31'));
    for (const d of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
      completeOn(t, d);
      t.f.tick();
    }
    t.clock.set(at('2026-11-05', '12:00'));
    t.f.tick();
    expect(t.s.streak.get().current).toBe(5);
    expect(t.s.streak.get().freezesLeft).toBe(2);

    // 05/11 kết thúc
    t.clock.set(at('2026-11-06', '00:01'));
    t.f.tick();
    t.f.tick(); // idempotent
    expect(t.s.streak.get().freezesLeft).toBe(1);
    expect(dayState(t, '2026-11-05')).toBe('FREEZE');
    expect(t.s.streak.get().current).toBe(5);

    completeOn(t, '2026-11-06');
    const s = t.s.streak.get();
    expect(s.freezesLeft).toBe(1);
    expect(s.current).toBe(6);
  });

  scenario('[F-13] Hết Freeze thì đứt chuỗi', () => {
    const t = createTestApp(at('2026-11-01'));
    // Dùng hết 2 Freeze của tháng 11: active 01, (02 freeze), 03, (04 freeze), 05, 06, 07 → Streak = 5
    for (const d of ['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07']) completeOn(t, d);
    t.clock.set(at('2026-11-08'));
    t.f.tick();
    let s = t.s.streak.get();
    expect(s.current).toBe(5);
    expect(s.freezesLeft).toBe(0);

    // 08/11 kết thúc không active
    t.clock.set(at('2026-11-09'));
    t.f.tick();
    s = t.s.streak.get();
    expect(s.current).toBe(0);
    expect(s.longest).toBeGreaterThanOrEqual(5);
    expect(dayState(t, '2026-11-08')).toBe('EMPTY');
  });

  scenario('[F-13] Reset Freeze hằng tháng', () => {
    const t = createTestApp(at('2026-11-01'));
    for (const d of ['2026-11-26', '2026-11-27', '2026-11-28']) completeOn(t, d);
    t.clock.set(at('2026-11-30'));
    t.f.tick(); // 29/11 dùng 1 Freeze
    expect(t.s.streak.get().freezesLeft).toBe(1);

    t.clock.set(at('2026-12-01', '00:05'));
    t.f.tick(); // 30/11 dùng Freeze còn lại của tháng 11
    const s = t.s.streak.get();
    expect(s.freezesLeft).toBe(2);
    expect(t.f.count("streak_freezes WHERE month = '2026-12'")).toBe(0);
  });

  scenario('[F-13] Hoàn tác làm mất ngày active', () => {
    const t = createTestApp(at('2026-11-04'));
    completeOn(t, '2026-11-04');
    completeOn(t, '2026-11-05');
    const tId = completeOn(t, '2026-11-06');
    t.f.tick();
    expect(t.s.streak.get().current).toBe(3);
    t.f.undo(tId);
    expect(dayState(t, '2026-11-06')).toBe('EMPTY');
    expect(t.s.streak.get().current).toBe(2);
  });

  scenario('[F-13] Missed không đứt chuỗi', () => {
    const t = createTestApp(at('2026-11-03'));
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) completeOn(t, d);
    const missedId = t.f.taskRaw({ deadline: new Date(at('2026-11-06', '08:00')).toISOString() });
    t.f.tick();
    expect(t.s.tasks.get(missedId).missed).toBe(true);
    expect(t.s.streak.get().current).toBe(4);
  });

  scenario('[F-13] Goal Streak riêng từng Goal, không dùng Freeze', () => {
    const t = createTestApp(at('2026-11-03'));
    const g1 = t.f.goal({ title: 'G1' });
    const g2 = t.f.goal({ title: 'G2' });
    for (const d of ['2026-11-03', '2026-11-04', '2026-11-05']) completeOn(t, d, { goalId: g1 });
    completeOn(t, '2026-11-06', { goalId: g2 });
    const goal = (id: string) => t.s.streak.get().goalStreaks.find((g) => g.goalId === id)?.current ?? 0;
    expect(goal(g1)).toBe(3);

    // Hôm nay kết thúc
    t.clock.set(at('2026-11-07', '00:05'));
    t.f.tick();
    expect(goal(g2)).toBe(1);
    expect(goal(g1)).toBe(0);
    expect(t.f.count('streak_freezes')).toBe(0);
    expect(t.s.streak.get().freezesLeft).toBe(2);
  });

  scenario('[F-13] Ranh giới ngày theo múi giờ', () => {
    const t = createTestApp('2026-11-05T16:30:00.000Z');
    expect(t.s.settings.get().timezone).toBe('Asia/Ho_Chi_Minh');
    const task = t.f.task();
    t.f.complete(task.id); // 2026-11-05 23:30 +07:00
    t.clock.set(at('2026-11-06'));
    expect(dayState(t, '2026-11-05')).toBe('ACTIVE');
    expect(dayState(t, '2026-11-06')).toBe('EMPTY');
  });

  scenario('[F-13] Longest Streak', async () => {
    const t = createTestApp(at('2026-10-01'));
    t.f.settings({ freezesPerMonth: 0 });
    for (let d = 1; d <= 10; d++) completeOn(t, `2026-10-${String(d).padStart(2, '0')}`);
    for (const d of ['2026-11-04', '2026-11-05', '2026-11-06']) completeOn(t, d);
    t.f.tick();
    const res = await t.api.get('/api/v1/streak');
    expect(res.body.current).toBe(3);
    expect(res.body.longest).toBe(10);
  });

  scenario('[F-13] Lịch hoạt động', async () => {
    const t = createTestApp(at('2026-11-01'));
    completeOn(t, '2026-11-01');
    completeOn(t, '2026-11-02');
    completeOn(t, '2026-11-04');
    t.clock.set(at('2026-11-06'));
    t.f.tick(); // 03/11 freeze; 05/11 freeze
    const res = await t.api.get('/api/v1/streak');
    const cal = res.body.calendar as { date: string; state: string }[];
    expect(cal).toHaveLength(84);
    expect(cal[0]!.date).toBe('2026-08-15');
    expect(cal[83]!.date).toBe('2026-11-06');
    const m = Object.fromEntries(cal.map((c) => [c.date, c.state]));
    expect(m['2026-11-01']).toBe('ACTIVE');
    expect(m['2026-11-02']).toBe('ACTIVE');
    expect(m['2026-11-03']).toBe('FREEZE');
    expect(m['2026-11-04']).toBe('ACTIVE');
    expect(m['2026-11-05']).toBe('FREEZE');
    expect(m['2026-11-06']).toBe('EMPTY');
    expect(m['2026-10-31']).toBe('EMPTY');
  });
});
