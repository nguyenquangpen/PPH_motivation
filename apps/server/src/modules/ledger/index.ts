import { z } from 'zod';
import type { XpSummaryDto } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { LedgerService } from './service.js';

export const ledgerModule: HubModule = {
  name: 'ledger',
  init(ctx) {
    ctx.services.ledger = new LedgerService(ctx);
  },
  routes(app, ctx) {
    app.get('/api/v1/xp/summary', async (): Promise<XpSummaryDto> => {
      const l = ctx.services.ledger;
      const s = ctx.services.settings.get();
      const b = l.balances();
      return {
        lifetimeXp: b.lifetime, spendableXp: b.spendable, level: l.levelOf(b.lifetime), xpPerLevel: s.xpPerLevel,
        xpToday: l.xpToday(), pool: l.pool(), poolTarget: s.poolTarget,
      };
    });
    app.get('/api/v1/xp/transactions', async (req) => {
      const q = z
        .object({
          type: z.string().optional(), sourceType: z.string().optional(), sourceId: z.string().optional(),
          from: z.string().optional(), to: z.string().optional(), page: z.coerce.number().int().min(1).optional(),
        })
        .parse(req.query);
      return ctx.services.ledger.listXp(q);
    });
    app.get('/api/v1/xp/reconciliation', async () => ctx.services.ledger.reconciliation());
  },
};
