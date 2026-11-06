import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f20-goal-task-detail.json');

describe('F-20 Goal & Task Detail', () => {
  scenario('[F-20] Goal Detail', async () => {
    const t = createTestApp();
    const created = await t.api.post('/api/v1/goals', {
      title: 'Học 1000 từ vựng', description: 'Mô tả Goal', categoryId: t.f.categoryId('Education'),
      targetContribution: 1000, startDate: '2026-11-01', targetDate: '2026-12-31',
    });
    const g = created.body.id as string;
    const m1 = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'Nửa chặng', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 500 })).body;
    const m2 = (await t.api.post(`/api/v1/goals/${g}/milestones`, { title: 'Về đích sớm', conditionType: 'CONTRIBUTION_THRESHOLD', threshold: 5000 })).body;
    const done1 = t.f.task({ goalId: g, contribution: 1000, title: 'Done 1' });
    const done2 = t.f.task({ goalId: g, contribution: 120, title: 'Done 2' });
    const doing = t.f.task({ goalId: g, contribution: 50, title: 'Doing' });
    const todo = t.f.task({ goalId: g, contribution: 30, title: 'Todo' });
    const cancelled = t.f.task({ goalId: g, contribution: 20, title: 'Cancelled' });
    t.f.complete(done1.id);
    t.f.complete(done2.id);
    t.f.start(doing.id);
    await t.api.post(`/api/v1/tasks/${cancelled.id}/cancel`, {});

    const res = await t.api.get(`/api/v1/goals/${g}`);
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.description).toBe('Mô tả Goal');
    expect(d.targetDate).toBe('2026-12-31');
    expect(d.progress).toMatchObject({
      completedContribution: 1120, displayPercent: 100, overflowContribution: 120, remainingContribution: 0,
    });
    expect(d.milestones.map((m: { id: string; status: string }) => [m.id, m.status])).toEqual([
      [m1.id, 'COMPLETED'], [m2.id, 'PENDING'],
    ]);
    const ids = (s: string) => (d.tasksByStatus[s] ?? []).map((x: { id: string }) => x.id).sort();
    expect(ids('COMPLETED')).toEqual([done1.id, done2.id].sort());
    expect(ids('IN_PROGRESS')).toEqual([doing.id]);
    expect(ids('TODO')).toEqual([todo.id]);
    expect(ids('CANCELLED')).toEqual([cancelled.id]);
    const msgs = (d.activity ?? []).map((a: { message: string }) => a.message);
    expect(msgs).toContain('Tạo Goal Học 1000 từ vựng');
    expect(msgs).toContain('Goal Học 1000 từ vựng: 100,0% → 112,0%');
  });

  scenario('[F-20] Task Detail Task lớn', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const task = t.f.task({ goalId: g, contribution: 100, estimated: 120, title: 'Viết báo cáo' });
    t.f.start(task.id);
    t.f.complete(task.id, 45);
    const res = await t.api.get(`/api/v1/tasks/${task.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Viết báo cáo', priority: 'MEDIUM', contribution: 100, goalId: g, estimatedDuration: 120,
      actualDuration: 45, status: 'COMPLETED', xpReceived: 75,
    });
    expect(res.body.history.map((h: { fromStatus: string | null; toStatus: string }) => [h.fromStatus, h.toStatus])).toEqual([
      [null, 'TODO'], ['TODO', 'IN_PROGRESS'], ['IN_PROGRESS', 'COMPLETED'],
    ]);
  });

  scenario('[F-20] Task Detail Task nhỏ Missed', async () => {
    const t = createTestApp();
    const tag = t.f.tagId('Trì hoãn');
    const id = t.f.taskRaw({ contribution: 10, estimated: 30, deadline: '2026-11-05T10:00:00.000Z', reasonTagId: tag });
    const res = await t.api.get(`/api/v1/tasks/${id}`);
    expect(res.status).toBe(200);
    // '0 XP + 10 vào Pool'
    expect(res.body.expectedXp).toMatchObject({ isSmall: true, immediateXp: 0, poolContribution: 10 });
    expect(res.body.missed).toBe(true);
    // Lý do 'Trì hoãn' (TaskDto trả id tag; UI tra tên qua /missed-reasons)
    expect(res.body.missedReasonTagId).toBe(tag);
  });
});
