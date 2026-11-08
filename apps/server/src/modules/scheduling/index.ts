import { z } from 'zod';
import { AcceptWarningSchema, ApplySuggestionSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { SchedulingService } from './service.js';

export const schedulingModule: HubModule = {
  name: 'scheduling',
  init(ctx) {
    ctx.services.scheduling = new SchedulingService(ctx);
  },
  wire(_ctx) {},
  routes(app, ctx) {
    const svc = () => ctx.services.scheduling;
    const P = z.object({ id: z.string() });

    app.get('/api/v1/scheduling/working-hours', async () => svc().workingHours());
    app.put('/api/v1/scheduling/working-hours', async (req) => ctx.db.transaction(() => svc().setWorkingHours(req.body))());

    app.get('/api/v1/tasks/:id/suggestions', async (req) => {
      const { id } = P.parse(req.params);
      return svc().suggestions(id);
    });
    app.post('/api/v1/tasks/:id/suggestions/apply', async (req, reply) => {
      const { id } = P.parse(req.params);
      const body = ApplySuggestionSchema.parse(req.body);
      const res = ctx.db.transaction(() => svc().applySuggestion(id, body.sessions))();
      reply.code(201);
      return res;
    });

    app.get('/api/v1/scheduling/warnings', async () => svc().warnings());
    app.post('/api/v1/scheduling/accept', async (req) => {
      const body = AcceptWarningSchema.parse(req.body);
      return ctx.db.transaction(() => svc().accept(body.kind, body.ref))();
    });
  },
};
