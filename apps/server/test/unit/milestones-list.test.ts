import { describe, expect, it } from 'vitest';
import type { MilestoneDto } from '@pph/shared';
import { createTestApp } from '../helpers.js';

function setup() {
  const t = createTestApp();
  const { f, db } = t;
  const g1 = f.goal({ title: 'Goal 1' });
  const g2 = f.goal({ title: 'Goal 2' });
  const gDeleted = f.goal({ title: 'Goal deleted' });
  // Interleave creation so ordering by goal is observable.
  const m2a = f.milestone(g2, { title: 'G2 A' });
  const m1a = f.milestone(g1, { title: 'G1 A' });
  const m1b = f.milestone(g1, { title: 'G1 B', status: 'COMPLETED' });
  const m2b = f.milestone(g2, { title: 'G2 B (deleted)' });
  const mOrphan = f.milestone(gDeleted, { title: 'On deleted goal' });
  db.prepare('UPDATE milestones SET deleted_at = ? WHERE id = ?').run(t.ctx.nowIso(), m2b);
  db.prepare('UPDATE goals SET deleted_at = ? WHERE id = ?').run(t.ctx.nowIso(), gDeleted);
  return { ...t, g1, g2, gDeleted, m1a, m1b, m2a, m2b, mOrphan };
}

describe('GET /api/v1/milestones', () => {
  it('lists non-deleted milestones of non-deleted goals, ordered by goal then created_at', async () => {
    const { api, g1, g2, m1a, m1b, m2a } = setup();
    const r = await api.get<MilestoneDto[]>('/api/v1/milestones');
    expect(r.status).toBe(200);
    expect(r.body.map((m) => m.id)).toEqual([m1a, m1b, m2a]);
    expect(r.body.map((m) => m.goalId)).toEqual([g1, g1, g2]);
    expect(r.body[0]).toMatchObject({ title: 'G1 A', status: 'PENDING', conditionType: 'CONTRIBUTION_THRESHOLD', linkedTaskIds: [] });
    expect(typeof r.body[0]!.effectiveRewardXp).toBe('number');
  });

  it('filters by goalId and status', async () => {
    const { api, g1, g2, gDeleted, m1b, m2a } = setup();
    expect((await api.get<MilestoneDto[]>(`/api/v1/milestones?goalId=${g2}`)).body.map((m) => m.id)).toEqual([m2a]);
    expect((await api.get<MilestoneDto[]>('/api/v1/milestones?status=COMPLETED')).body.map((m) => m.id)).toEqual([m1b]);
    expect((await api.get<MilestoneDto[]>(`/api/v1/milestones?goalId=${g1}&status=PENDING`)).body.map((m) => m.title)).toEqual(['G1 A']);
    expect((await api.get<MilestoneDto[]>(`/api/v1/milestones?goalId=${gDeleted}`)).body).toEqual([]);
    expect((await api.get<MilestoneDto[]>('/api/v1/milestones?goalId=&status=')).body).toHaveLength(3);
  });

  it('rejects an unknown status', async () => {
    const { api } = setup();
    expect((await api.get('/api/v1/milestones?status=DONE')).status).toBe(400);
  });

  it('does not shadow GET /api/v1/milestones/:id', async () => {
    const { api, m1a } = setup();
    const r = await api.get<MilestoneDto>(`/api/v1/milestones/${m1a}`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(m1a);
  });
});
