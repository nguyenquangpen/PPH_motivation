import { z } from 'zod';
import {
  CancelTaskSchema, CompleteTaskSchema, CreateTaskSchema, MissedReviewSchema, TaskStatus, UpdateTaskSchema,
} from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { idempotent } from '../../core/http.js';
import { TaskService } from './service.js';

export const tasksModule: HubModule = {
  name: 'tasks',
  init(ctx) {
    ctx.services.tasks = new TaskService(ctx);
  },
  routes(app, ctx) {
    const svc = () => ctx.services.tasks;
    const P = z.object({ id: z.string() });

    app.get('/api/v1/tasks', async (req) => {
      const q = z
        .object({
          status: z.enum(TaskStatus).optional(), goalId: z.string().optional(),
          missed: z.enum(['true', 'false']).optional(), due: z.literal('today').optional(),
        })
        .parse(req.query);
      return svc().list({ status: q.status, goalId: q.goalId, missed: q.missed === undefined ? undefined : q.missed === 'true', due: q.due });
    });
    app.post('/api/v1/tasks', async (req, reply) => {
      const body = CreateTaskSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().create(body))();
    });
    app.get('/api/v1/tasks/:id', async (req) => {
      const { id } = P.parse(req.params);
      return { ...svc().get(id), history: svc().history(id) };
    });
    app.patch('/api/v1/tasks/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateTaskSchema.parse(req.body);
      return ctx.db.transaction(() => svc().update(id, body))();
    });
    app.delete('/api/v1/tasks/:id', async (req) => {
      const { id } = P.parse(req.params);
      const { confirm } = z.object({ confirm: z.enum(['true', 'false']).optional() }).parse(req.query);
      return idempotent(ctx, req, () => svc().delete(id, confirm === 'true'));
    });
    app.post('/api/v1/tasks/:id/start', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().start(id))();
    });
    app.post('/api/v1/tasks/:id/complete', async (req) => {
      const { id } = P.parse(req.params);
      const body = CompleteTaskSchema.parse(req.body ?? {});
      return idempotent(ctx, req, () => svc().complete(id, body));
    });
    app.post('/api/v1/tasks/:id/undo', async (req) => {
      const { id } = P.parse(req.params);
      return idempotent(ctx, req, () => svc().undo(id));
    });
    app.post('/api/v1/tasks/:id/cancel', async (req) => {
      const { id } = P.parse(req.params);
      const body = CancelTaskSchema.parse(req.body ?? {});
      return idempotent(ctx, req, () => svc().cancel(id, body));
    });
    app.post('/api/v1/tasks/:id/missed-review', async (req) => {
      const { id } = P.parse(req.params);
      const body = MissedReviewSchema.parse(req.body);
      return idempotent(ctx, req, () => svc().missedReview(id, body));
    });
  },
};
