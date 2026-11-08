import { describe, expect } from 'vitest';
import type { NotificationListDto } from '@pph/shared';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f19-in-app-notification.json');
const local = (s: string) => new Date(`${s}:00+07:00`).toISOString();

const unread = async (t: TestApp) => (await t.api.get<NotificationListDto>('/api/v1/notifications?unread=true')).body;
const soonCount = (t: TestApp, taskId: string) => t.f.count("notifications WHERE type='TASK_DEADLINE_SOON' AND object_id = ?", taskId);

describe('F-19 In-app Notification', () => {
  scenario('[F-19] Đánh dấu đã đọc', async () => {
    const t = createTestApp();
    const ids = [1, 2, 3].map((i) => t.s.notifications.notify({ type: 'LEVEL_UP', dedupeKey: `k${i}`, title: `N${i}` })!);
    expect((await unread(t)).items).toHaveLength(3);
    const r1 = await t.api.post(`/api/v1/notifications/${ids[0]}/read`);
    expect(r1.status).toBe(200);
    expect(r1.body.read).toBe(true);
    const after1 = await unread(t);
    expect(after1.items).toHaveLength(2);
    expect(after1.unreadCount).toBe(2);
    const r2 = await t.api.post('/api/v1/notifications/read-all');
    expect(r2.status).toBe(200);
    expect((await unread(t)).items).toHaveLength(0);
    const all = await t.api.get<NotificationListDto>('/api/v1/notifications');
    expect(all.body.items).toHaveLength(3);
    expect(all.body.items.every((n) => n.read)).toBe(true);
    expect((await t.api.post('/api/v1/notifications/nope/read')).status).toBe(404);
  });

  scenario('[F-19] Chống trùng', () => {
    const t = createTestApp();
    const deadline = local('2026-11-05T17:00');
    const id = t.f.taskRaw({ deadline });
    const key = `TASK_MISSED:${id}:${deadline}`;
    expect(t.s.notifications.notify({ type: 'TASK_MISSED', objectType: 'TASK', objectId: id, dedupeKey: key, title: 'Task quá hạn' })).not.toBeNull();
    // Hệ thống kiểm tra Missed lần nữa
    expect(t.s.notifications.notify({ type: 'TASK_MISSED', objectType: 'TASK', objectId: id, dedupeKey: key, title: 'Task quá hạn' })).toBeNull();
    t.f.tick();
    t.f.tick();
    expect(t.f.count("notifications WHERE type='TASK_MISSED' AND object_id = ?", id)).toBe(1);
  });

  scenario('[F-19] Nhắc trước deadline 24 giờ', () => {
    const t = createTestApp(local('2026-11-06T10:00'));
    const task = t.f.task({ deadline: local('2026-11-07T17:00') });
    t.f.tick();
    expect(soonCount(t, task.id)).toBe(0); // còn > 24 giờ
    t.clock.set(local('2026-11-06T17:00'));
    t.f.tick();
    expect(soonCount(t, task.id)).toBe(1);
    // đã đọc rồi kiểm tra tiếp vẫn không tạo thêm
    t.s.notifications.readAll();
    for (let i = 0; i < 5; i++) {
      t.clock.advanceHours(2);
      t.f.tick();
    }
    expect(soonCount(t, task.id)).toBe(1);
  });

  scenario('[F-19] Đổi deadline tạo nhắc mới', async () => {
    const t = createTestApp(local('2026-11-06T10:00'));
    const task = t.f.task({ deadline: local('2026-11-07T08:00') });
    t.f.tick();
    expect(soonCount(t, task.id)).toBe(1);
    const res = await t.api.patch(`/api/v1/tasks/${task.id}`, { deadline: local('2026-11-10T08:00') });
    expect(res.status).toBe(200);
    t.f.tick();
    expect(soonCount(t, task.id)).toBe(1);
    t.clock.set(local('2026-11-09T08:00'));
    t.f.tick();
    t.f.tick();
    expect(soonCount(t, task.id)).toBe(2);
  });

  scenario('[F-19] Không nhắc Task đã hoàn thành', async () => {
    const t = createTestApp(local('2026-11-06T10:00'));
    const task = t.f.task({ deadline: local('2026-11-06T20:00') });
    t.f.tick();
    expect((await unread(t)).items.some((n) => n.type === 'TASK_DEADLINE_SOON' && n.objectId === task.id)).toBe(true);
    t.f.complete(task.id);
    expect((await unread(t)).items.some((n) => n.objectId === task.id)).toBe(false);
    t.clock.set(local('2026-11-07T10:00'));
    t.f.tick();
    expect(t.f.count("notifications WHERE type='TASK_MISSED' AND object_id = ?", task.id)).toBe(0);
    expect(soonCount(t, task.id)).toBe(1);
  });

  scenario('[F-19] Thông báo thành tựu', async () => {
    const t = createTestApp();
    t.f.balances(950, 950);
    t.f.pool(95);
    const task = t.f.task({ contribution: 10 });
    t.f.complete(task.id);
    const items = (await unread(t)).items;
    expect(items.filter((n) => n.type === 'POOL_REWARD')).toHaveLength(1);
    const lvl = items.filter((n) => n.type === 'LEVEL_UP');
    expect(lvl).toHaveLength(1);
    expect(lvl[0]!.title).toBe('Lên Level 2');
  });

  scenario('[F-19] Lưu trữ 90 ngày', async () => {
    const t = createTestApp();
    t.clock.advanceDays(-89);
    const id = t.s.notifications.notify({ type: 'LEVEL_UP', dedupeKey: 'old', title: 'Cũ' })!;
    t.s.notifications.markRead(id);
    t.clock.advanceDays(89);
    t.f.tick();
    const res = await t.api.get<NotificationListDto>('/api/v1/notifications');
    expect(res.body.items.map((n) => n.id)).toContain(id);
  });
});
