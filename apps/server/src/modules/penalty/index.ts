import { z } from 'zod';
import { CreateReasonTagSchema, UpdateReasonTagSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { PenaltyService } from './service.js';

/** F-15 Missed & Penalty, F-16 Missed Reason Tags: routes /api/v1/missed-reasons*, event handlers, scheduler jobs. */
export const penaltyModule: HubModule = {
  name: 'penalty',
  init(ctx) {
    ctx.services.penalty = new PenaltyService(ctx);
  },
  wire(ctx) {
    const svc = () => ctx.services.penalty;
    ctx.events.on('task.cancelled', (p) => svc().onCancelled(p));
    ctx.events.on('task.reason_changed', (p) => svc().onReasonChanged(p));
    ctx.scheduler.register({ name: 'penalty.task_missed_notification', run: (now) => svc().notifyMissed(now) });
    ctx.scheduler.register({ name: 'penalty.evaluate', run: (now) => svc().evaluateDue(now) });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.penalty;
    const P = z.object({ id: z.string() });

    app.get('/api/v1/missed-reasons', async () => svc().listTags());
    app.get('/api/v1/missed-reasons/:id', async (req) => {
      const { id } = P.parse(req.params);
      return svc().getTag(id);
    });
    app.post('/api/v1/missed-reasons', async (req, reply) => {
      const body = CreateReasonTagSchema.parse(req.body);
      const res = ctx.db.transaction(() => svc().createTag(body))();
      reply.code(201);
      return res;
    });
    app.patch('/api/v1/missed-reasons/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateReasonTagSchema.parse(req.body);
      return ctx.db.transaction(() => svc().updateTag(id, body))();
    });
    app.delete('/api/v1/missed-reasons/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().deleteTag(id))();
    });
  },
};
