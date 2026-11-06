import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f01-goal-category-management.json');

const goalBody = (t: TestApp, o: Record<string, unknown> = {}) => ({
  title: 'Học 1000 từ vựng', categoryId: t.f.categoryId('Education'), targetContribution: 1000, ...o,
});

describe('F-01 Goal & Category Management', () => {
  scenario('[F-01] Tạo Goal hợp lệ', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('NOT_STARTED');
    expect(res.body.categoryName).toBe('Education');
    expect(res.body.progress.progressPercent).toBe(0);
    expect(res.body.progress.completedContribution).toBe(0);
    expect(t.f.activity().some((a) => a.type === 'GOAL_CREATED' && a.message.includes('Tạo Goal') && a.goal_id === res.body.id)).toBe(true);
  });

  scenario('[F-01] Thiếu title', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t, { title: '   ' }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error)).toContain('Title bắt buộc');
    expect(t.f.count('goals')).toBe(0);
  });

  scenario('[F-01] Title đúng 200 ký tự', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t, { title: 'a'.repeat(200) }));
    expect(res.status).toBe(201);
    expect(res.body.title).toHaveLength(200);
  });

  scenario('[F-01] Title 201 ký tự', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t, { title: 'a'.repeat(201) }));
    expect(res.status).toBe(400);
    expect(t.f.count('goals')).toBe(0);
  });

  scenario('[F-01] target_contribution ngoài phạm vi', async () => {
    const t = createTestApp();
    const statuses: number[] = [];
    for (const v of [0, 1, 1_000_000, 1_000_001]) {
      statuses.push((await t.api.post('/api/v1/goals', goalBody(t, { targetContribution: v }))).status);
    }
    expect(statuses).toEqual([400, 201, 201, 400]);
    expect(t.f.count('goals')).toBe(2);
  });

  scenario('[F-01] target_date trước start_date', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t, { startDate: '2026-12-01', targetDate: '2026-11-30' }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('target_date');
    expect(t.f.count('goals')).toBe(0);
  });

  scenario('[F-01] start_date bằng target_date', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/goals', goalBody(t, { startDate: '2026-12-01', targetDate: '2026-12-01' }));
    expect(res.status).toBe(201);
    expect([res.body.startDate, res.body.targetDate]).toEqual(['2026-12-01', '2026-12-01']);
  });

  scenario('[F-01] Đổi trạng thái thủ công', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE' });
    const events: unknown[] = [];
    t.ctx.events.on('goal.status_changed', (p) => events.push(p));
    const res = await t.api.patch(`/api/v1/goals/${g}`, { status: 'PAUSED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
    expect(t.f.activity().some((a) => a.type === 'GOAL_STATUS_CHANGED' && a.message.includes('Active → Paused'))).toBe(true);
    expect(events).toEqual([{ goalId: g, from: 'ACTIVE', to: 'PAUSED' }]);
  });

  scenario('[F-01] Không đặt Completed trực tiếp', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE' });
    const res = await t.api.patch(`/api/v1/goals/${g}`, { status: 'COMPLETED' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('GOAL_COMPLETE_VIA_ENDPOINT');
    expect(res.body.error.message).toContain('Đánh dấu hoàn thành');
    expect(t.s.goals.get(g).status).toBe('ACTIVE');
  });

  scenario('[F-01] Category mặc định', async () => {
    const t = createTestApp();
    const res = await t.api.get('/api/v1/categories');
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
      'Career', 'Education', 'Research', 'Finance', 'Business', 'Personal Development', 'Health', 'Other',
    ]);
    // Sửa và Xóa được
    const health = res.body.find((c: { name: string }) => c.name === 'Health');
    expect((await t.api.patch(`/api/v1/categories/${health.id}`, { name: 'Sức khỏe' })).body.name).toBe('Sức khỏe');
    expect((await t.api.del(`/api/v1/categories/${health.id}`)).status).toBe(200);
    expect((await t.api.get('/api/v1/categories')).body).toHaveLength(7);
  });

  scenario('[F-01] Category trùng tên', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/categories', { name: 'health' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
    expect(t.f.count('goal_categories WHERE deleted_at IS NULL')).toBe(8);
  });

  scenario('[F-01] Xóa Category đang dùng', async () => {
    const t = createTestApp();
    const research = t.f.categoryId('Research');
    for (const title of ['G1', 'G2']) {
      expect((await t.api.post('/api/v1/goals', { title, categoryId: research, targetContribution: 100 })).status).toBe(201);
    }
    const res = await t.api.del(`/api/v1/categories/${research}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    expect(res.body.error.details.goalCount).toBe(2);
    const cats = (await t.api.get('/api/v1/categories')).body as { id: string; goalCount: number }[];
    expect(cats.find((c) => c.id === research)?.goalCount).toBe(2);
  });

  scenario('[F-01] Xóa Goal (soft)', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    const tasks = [t.f.task({ goalId: g, contribution: 100 }), t.f.task({ goalId: g }), t.f.task({ goalId: g })];
    t.f.complete(tasks[0]!.id);
    const res = await t.api.del(`/api/v1/goals/${g}`);
    expect(res.status).toBe(200);
    const list = (await t.api.get('/api/v1/goals')).body as { id: string }[];
    expect(list.some((x) => x.id === g)).toBe(false);
    expect((await t.api.get(`/api/v1/goals/${g}`)).status).toBe(404);
    expect(t.f.count('tasks WHERE goal_id = ? AND deleted_at IS NULL', g)).toBe(3);
    expect(t.f.count("contribution_ledger WHERE goal_id = ? AND type = 'ADD' AND amount = 100", g)).toBe(1);
  });

  scenario('[F-01] Mở lại Goal Completed', async () => {
    const t = createTestApp();
    const g = t.f.goal({ status: 'ACTIVE', target: 100 });
    t.f.complete(t.f.task({ goalId: g, contribution: 100, estimated: 60 }).id);
    expect((await t.api.post(`/api/v1/goals/${g}/complete`, {})).status).toBe(200);
    expect(t.f.xpTx('GOAL_REWARD')[0]!.lifetime_delta).toBe(1000);
    const lifetime = t.s.ledger.balances().lifetime;
    const res = await t.api.patch(`/api/v1/goals/${g}`, { status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.goalRewardGranted).toBe(true);
    expect(t.f.xpTx('REWARD_REVERSAL')).toHaveLength(0);
    expect(t.s.ledger.balances().lifetime).toBe(lifetime);
  });
});
