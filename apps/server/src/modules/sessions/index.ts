import { z } from 'zod';
import { SessionInputSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { SessionService } from './service.js';

export const sessionsModule: HubModule = {
  name: 'sessions',
  init(ctx) {
    ctx.services.sessions = new SessionService(ctx);
  },
  wire(_ctx) {},
  routes(app, ctx) {
    const svc = () => ctx.services.sessions;
    const P = z.object({ id: z.string() });

    app.get('/api/v1/tasks/:id/sessions', async (req) => {
      const { id } = P.parse(req.params);
      ctx.services.tasks.row(id, { includeDeleted: true });
      return svc().listByTask(id);
    });
    app.post('/api/v1/tasks/:id/sessions', async (req, reply) => {
      const { id } = P.parse(req.params);
      const body = SessionInputSchema.parse(req.body);
      const res = ctx.db.transaction(() => svc().create(id, body))();
      reply.code(201);
      return res;
    });
    app.patch('/api/v1/sessions/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = SessionInputSchema.parse(req.body);
      return ctx.db.transaction(() => svc().update(id, body))();
    });
    app.delete('/api/v1/sessions/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().remove(id))();
    });
  },
};
