import { z } from 'zod';
import { CreateMilestoneSchema, UpdateMilestoneSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { MilestoneService } from './service.js';

/** F-12: routes /api/v1/goals/:goalId/milestones, /api/v1/milestones/:id; event handlers đánh giá điều kiện. */
export const milestonesModule: HubModule = {
  name: 'milestones',
  init(ctx) {
    ctx.services.milestones = new MilestoneService(ctx);
  },
  wire(ctx) {
    const svc = () => ctx.services.milestones;
    // Tăng Contribution: chỉ có thể làm thỏa. Giảm do Undo được xử lý (mở lại) ở task.undone.
    ctx.events.on('goal.contribution_changed', (p) =>
      svc().evaluateFor({ goalId: p.goalId }, { allowReopen: false, onlyCondition: 'CONTRIBUTION_THRESHOLD' }));
    ctx.events.on('task.completed', (p) => svc().evaluateFor(p, { allowReopen: false }));
    ctx.events.on('task.cancelled', (p) => svc().evaluateFor(p, { allowReopen: false }));
    ctx.events.on('task.undone', (p) => svc().evaluateFor(p, { allowReopen: true }));
    // Liên kết đã bị xóa trước khi phát event → đánh giá theo Goal của Task.
    ctx.events.on('task.deleted', (p) => svc().evaluateFor(p, { allowReopen: true }));
    ctx.events.on('task.links_changed', (p) => {
      svc().evaluateFor(p, { allowReopen: false });
      svc().evaluatePendingLinked();
    });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.milestones;
    const G = z.object({ goalId: z.string() });
    const P = z.object({ id: z.string() });

    app.get('/api/v1/goals/:goalId/milestones', async (req) => {
      const { goalId } = G.parse(req.params);
      ctx.services.goals.get(goalId); // 404 nếu Goal không tồn tại / đã xóa
      return svc().listByGoal(goalId);
    });
    app.post('/api/v1/goals/:goalId/milestones', async (req, reply) => {
      const { goalId } = G.parse(req.params);
      const body = CreateMilestoneSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().create(goalId, body))();
    });
    app.get('/api/v1/milestones/:id', async (req) => {
      const { id } = P.parse(req.params);
      return svc().get(id);
    });
    app.patch('/api/v1/milestones/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateMilestoneSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().update(id, body))();
    });
    app.delete('/api/v1/milestones/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().delete(id))();
    });
  },
};
