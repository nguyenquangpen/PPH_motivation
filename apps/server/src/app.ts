import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode } from '@pph/shared';
import type { AppContext, AppOptions, Services } from './core/context.js';
import type { Clock } from './core/clock.js';
import type { DB } from './core/db.js';
import { DomainError } from './core/errors.js';
import { EventBus } from './core/events.js';
import { Scheduler } from './core/scheduler.js';
import { seedIfEmpty } from './core/seed.js';
import { MODULES } from './modules/index.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function buildContext(db: DB, clock: Clock, options: AppOptions = {}): AppContext {
  const ctx: AppContext = {
    db,
    clock,
    events: new EventBus(),
    scheduler: new Scheduler(db),
    services: {} as Services,
    options,
    nowIso: () => clock.now().toISOString(),
    tz: () => ctx.services.settings.get().timezone,
  };
  seedIfEmpty(db, ctx.nowIso());
  for (const m of MODULES) m.init(ctx);
  for (const m of MODULES) m.wire?.(ctx);
  return ctx;
}

export function buildApp(db: DB, clock: Clock, options: AppOptions = {}): { app: FastifyInstance; ctx: AppContext } {
  const ctx = buildContext(db, clock, options);
  const app = Fastify({ logger: false });

  // NFR-009: chỉ chấp nhận kết nối từ chính laptop
  app.addHook('onRequest', async (req, reply) => {
    if (!LOOPBACK.has(req.ip)) {
      return reply.code(403).send({ error: { code: ErrorCode.FORBIDDEN, message: 'Chỉ truy cập từ localhost' } });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.httpStatus).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: ErrorCode.VALIDATION, message: 'Dữ liệu không hợp lệ', details: { issues: err.issues } } });
    }
    const fe = err as { statusCode?: number; message: string };
    if (fe.statusCode && fe.statusCode < 500) {
      return reply.code(fe.statusCode).send({ error: { code: ErrorCode.VALIDATION, message: fe.message } });
    }
    console.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } });
  });

  app.get('/api/v1/health', async () => ({ ok: true, now: ctx.nowIso() }));
  for (const m of MODULES) m.routes?.(app, ctx);
  return { app, ctx };
}
