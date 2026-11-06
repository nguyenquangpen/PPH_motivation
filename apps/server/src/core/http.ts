import type { FastifyRequest } from 'fastify';
import type { AppContext } from './context.js';
import { withOperation } from './idempotency.js';

/** Header Idempotency-Key của request (nếu có). */
export const idemKey = (req: FastifyRequest): string | undefined => {
  const h = req.headers['idempotency-key'];
  return typeof h === 'string' && h.length > 0 ? h : undefined;
};

/** Chạy fn trong transaction + idempotency theo header Idempotency-Key. */
export function idempotent<T>(ctx: AppContext, req: FastifyRequest, fn: () => T): T {
  return ctx.db.transaction(() => withOperation(ctx.db, idemKey(req), ctx.nowIso(), fn))();
}
