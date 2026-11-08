import { z } from 'zod';
import {
  CompleteGoalSchema, CreateCategorySchema, CreateGoalSchema, GoalStatus, UpdateCategorySchema, UpdateGoalSchema,
} from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { validation } from '../../core/errors.js';
import { idempotent } from '../../core/http.js';
import { GoalService } from './service.js';

/** F-01…F-04: routes /api/v1/categories*, /api/v1/goals*, event handlers, job GOAL warnings. */
export const goalsModule: HubModule = {
  name: 'goals',
  init(ctx) {
    ctx.services.goals = new GoalService(ctx);
  },
  wire(ctx) {
    ctx.events.on('goal.contribution_changed', (p) => ctx.services.goals.onContributionChanged(p));
    ctx.scheduler.register({ name: 'goal-warnings', run: () => void ctx.services.goals.evaluateWarnings() });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.goals;
    const P = z.object({ id: z.string() });

    // ---------- Categories ----------
    app.get('/api/v1/categories', async () => svc().listCategories());
    app.post('/api/v1/categories', async (req, reply) => {
      const body = CreateCategorySchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().createCategory(body))();
    });
    app.patch('/api/v1/categories/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateCategorySchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().updateCategory(id, body))();
    });
    app.delete('/api/v1/categories/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().deleteCategory(id))();
    });

    // ---------- Goals ----------
    app.get('/api/v1/goals', async (req) => {
      const { status } = z.object({ status: z.union([z.string(), z.array(z.string())]).optional() }).parse(req.query);
      const raw = (Array.isArray(status) ? status : status ? [status] : []).flatMap((s) => s.split(',')).filter(Boolean);
      const parsed = z.array(z.enum(GoalStatus)).safeParse(raw);
      if (!parsed.success) throw validation('status không hợp lệ', { status: raw });
      return svc().list({ status: parsed.data });
    });
    app.post('/api/v1/goals', async (req, reply) => {
      const body = CreateGoalSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().create(body))();
    });
    app.get('/api/v1/goals/:id', async (req) => {
      const { id } = P.parse(req.params);
      return svc().detail(id);
    });
    app.patch('/api/v1/goals/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateGoalSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().update(id, body))();
    });
    app.delete('/api/v1/goals/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().delete(id))();
    });
    app.post('/api/v1/goals/:id/complete', async (req) => {
      const { id } = P.parse(req.params);
      const body = CompleteGoalSchema.parse(req.body ?? {});
      return idempotent(ctx, req, () => svc().complete(id, body));
    });
  },
};
