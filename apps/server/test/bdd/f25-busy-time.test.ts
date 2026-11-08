import { describe, expect } from 'vitest';
import { bdd } from '../helpers.js';
import { calApp, connectedApp, local, pull, syncedSession } from './calendar-setup.js';

const scenario = bdd('f25-busy-time.json');
// Thứ Ba 2026-11-10 theo +07:00
const TUE = { from: local('2026-11-10T00:00'), to: local('2026-11-11T00:00') };

describe('F-25 Busy Time', () => {
  scenario('[F-25] Event thường là bận', async () => {
    const t = await connectedApp();
    t.fake.addExternalEvent({ title: 'Họp', start: local('2026-11-10T14:00'), end: local('2026-11-10T15:00') });
    await pull(t);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([{ start: local('2026-11-10T14:00'), end: local('2026-11-10T15:00') }]);
    const r = await t.api.get(`/api/v1/calendar/busy?from=${encodeURIComponent(TUE.from)}&to=${encodeURIComponent(TUE.to)}`);
    expect(r.body).toEqual([{ start: local('2026-11-10T14:00'), end: local('2026-11-10T15:00') }]);
  });

  scenario('[F-25] Loại trừ Free, từ chối, cả ngày', async () => {
    const t = await connectedApp();
    t.fake.addExternalEvent({ title: 'Rảnh', start: local('2026-11-10T09:00'), end: local('2026-11-10T10:00'), transparency: 'transparent' });
    t.fake.addExternalEvent({ title: 'Từ chối', start: local('2026-11-10T10:00'), end: local('2026-11-10T11:00'), declined: true });
    t.fake.addExternalEvent({ title: 'Sinh nhật', start: local('2026-11-10T00:00'), end: local('2026-11-11T00:00'), allDay: true });
    await pull(t);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([]);
    expect(t.s.calendar.hasBusyData()).toBe(true);
  });

  scenario('[F-25] Không tính Event của Hub', async () => {
    const t = await connectedApp();
    await syncedSession(t);
    await pull(t);
    expect(t.fake.hubEvents()).toHaveLength(1);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([]);
  });

  scenario('[F-25] Event lặp lại', async () => {
    const t = await connectedApp();
    t.fake.addExternalEvent({ title: 'Học lái xe', start: local('2026-11-10T07:00'), end: local('2026-11-10T08:00'), dailyCount: 10 });
    await pull(t);
    const busy = t.s.calendar.busy(local('2026-11-10T00:00'), local('2026-11-13T00:00'));
    expect(busy).toEqual(['10', '11', '12'].map((d) => ({ start: local(`2026-11-${d}T07:00`), end: local(`2026-11-${d}T08:00`) })));
  });

  scenario('[F-25] Gộp khoảng chồng', async () => {
    const t = await connectedApp();
    t.fake.addExternalEvent({ start: local('2026-11-10T14:00'), end: local('2026-11-10T15:00') });
    t.fake.addExternalEvent({ start: local('2026-11-10T14:30'), end: local('2026-11-10T16:00') });
    await pull(t);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([{ start: local('2026-11-10T14:00'), end: local('2026-11-10T16:00') }]);
  });

  scenario('[F-25] Chọn lịch', async () => {
    const t = await connectedApp();
    t.fake.addCalendar('work', 'Công ty');
    t.fake.addExternalEvent({ calendarId: 'work', start: local('2026-11-10T09:00'), end: local('2026-11-10T17:00') });
    await pull(t);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([]);

    const cals = (await t.api.get('/api/v1/calendar/calendars')).body as { id: string; name: string; selectedForBusy: boolean }[];
    expect(cals.find((c) => c.name === 'Công ty')!.selectedForBusy).toBe(false);
    expect(cals.find((c) => c.id === 'primary')!.selectedForBusy).toBe(true);
    const r = await t.api.put('/api/v1/calendar/busy-calendars', { calendarIds: ['primary', 'work'] });
    expect(r.status).toBe(200);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([{ start: local('2026-11-10T09:00'), end: local('2026-11-10T17:00') }]);
  });

  scenario('[F-25] Chưa kết nối', async () => {
    const t = calApp();
    expect(t.s.calendar.hasBusyData()).toBe(false);
    expect(t.s.calendar.busy(TUE.from, TUE.to)).toEqual([]);
    const task = t.f.task({ estimated: 60 }).id;
    const r = await t.api.get(`/api/v1/tasks/${task}/suggestions`);
    expect(r.status).toBe(200);
    expect(r.body.calendarDataAvailable).toBe(false);
    expect(JSON.stringify(r.body)).toContain('Chưa có dữ liệu lịch Google');
  });
});
