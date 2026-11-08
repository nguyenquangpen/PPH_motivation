import { z } from 'zod';
import { CreateIntegrationAppSchema, CreateKeySchema, CreateRuleSchema, UpdateIntegrationAppSchema, UpdateRuleSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { HttpError, IntegrationService } from './service.js';

const BODY_LIMIT = 64 * 1024;

/** F-30…F-33: /api/v1/integrations/* */
export const integrationsModule: HubModule = {
  name: 'integrations',
  init(ctx) {
    ctx.services.integrations = new IntegrationService(ctx);
  },
  wire(ctx) {
    // Fallback: sự kiện RECEIVED chưa được xử lý (vd. Hub tắt ngay sau khi nhận)
    ctx.scheduler.register({ name: 'integration-process-pending', run: () => void ctx.services.integrations.processPending() });
    ctx.scheduler.register({ name: 'integration-inactivity', run: (now) => ctx.services.integrations.runInactivity(now) });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.integrations;
    const P = z.object({ id: z.string() });

    // ---------- F-30 nhận sự kiện (Bearer key) ----------
    app.post('/api/v1/integrations/events', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
      try {
        const r = svc().ingest(req.headers.authorization, req.body);
        if (r.needsProcessing) {
          setImmediate(() => {
            try { svc().processOne(r.eventId); } catch (err) { console.error('[integrations] process failed', (err as Error).message); }
          });
        }
        return reply.code(r.httpStatus).send({ success: true, event_id: r.eventId, status: r.status });
      } catch (e) {
        if (e instanceof HttpError) {
          return reply.code(e.httpStatus).send({ error: { code: e.code, message: e.message, details: e.details } });
        }
        throw e;
      }
    });

    // ---------- F-31 apps & keys ----------
    app.get('/api/v1/integrations/apps', async () => svc().listApps());
    app.get('/api/v1/integrations/apps/:id', async (req) => svc().getApp(P.parse(req.params).id));
    app.post('/api/v1/integrations/apps', async (req, reply) => {
      const body = CreateIntegrationAppSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().createApp(body))();
    });
    app.patch('/api/v1/integrations/apps/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateIntegrationAppSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().updateApp(id, body))();
    });
    app.delete('/api/v1/integrations/apps/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().deleteApp(id))();
    });
    app.post('/api/v1/integrations/apps/:id/keys', async (req, reply) => {
      const { id } = P.parse(req.params);
      const body = CreateKeySchema.parse(req.body ?? {});
      reply.code(201);
      return ctx.db.transaction(() => svc().createKey(id, body))();
    });
    app.delete('/api/v1/integrations/keys/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().revokeKey(id))();
    });

    // ---------- F-32 rules ----------
    app.get('/api/v1/integrations/rules', async (req) => {
      const { appRef } = z.object({ appRef: z.string().optional() }).parse(req.query);
      return svc().listRules(appRef);
    });
    app.post('/api/v1/integrations/rules', async (req, reply) => {
      const body = CreateRuleSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().createRule(body))();
    });
    app.patch('/api/v1/integrations/rules/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateRuleSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().updateRule(id, body))();
    });
    app.delete('/api/v1/integrations/rules/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().deleteRule(id))();
    });
    app.post('/api/v1/integrations/rules/:id/apply-ignored', async (req) => {
      const { id } = P.parse(req.params);
      return svc().applyToIgnored(id);
    });

    // ---------- F-31 event history ----------
    app.get('/api/v1/integrations/events', async (req) => {
      const q = z.object({
        appRef: z.string().optional(), status: z.string().optional(), eventType: z.string().optional(),
        from: z.string().optional(), to: z.string().optional(), includeHeartbeat: z.enum(['true', 'false']).optional(),
      }).parse(req.query);
      return svc().listEvents({ ...q, includeHeartbeat: q.includeHeartbeat === 'true' });
    });
    app.get('/api/v1/integrations/events/:id', async (req) => svc().getEvent(P.parse(req.params).id));
    app.post('/api/v1/integrations/events/:id/retry', async (req) => svc().retry(P.parse(req.params).id));
  },
};
