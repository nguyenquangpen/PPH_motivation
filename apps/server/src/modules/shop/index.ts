import { z } from 'zod';
import { CreateRewardItemSchema, UpdateRewardItemSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { idempotent } from '../../core/http.js';
import { ShopService } from './service.js';

/** F-11 Reward Shop — routes /api/v1/shop/*. Trạng thái Item là dẫn xuất nên không cần nghe event. */
export const shopModule: HubModule = {
  name: 'shop',
  init(ctx) {
    ctx.services.shop = new ShopService(ctx);
  },
  wire(_ctx) {},
  routes(app, ctx) {
    const svc = () => ctx.services.shop;
    const P = z.object({ id: z.string() });

    app.get('/api/v1/shop/items', async () => svc().listItems());
    app.post('/api/v1/shop/items', async (req, reply) => {
      const body = CreateRewardItemSchema.parse(req.body);
      reply.code(201);
      return ctx.db.transaction(() => svc().createItem(body))();
    });
    app.patch('/api/v1/shop/items/:id', async (req) => {
      const { id } = P.parse(req.params);
      const body = UpdateRewardItemSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().updateItem(id, body))();
    });
    app.delete('/api/v1/shop/items/:id', async (req) => {
      const { id } = P.parse(req.params);
      return ctx.db.transaction(() => svc().deleteItem(id))();
    });
    app.post('/api/v1/shop/items/:id/redeem', async (req) => {
      const { id } = P.parse(req.params);
      return idempotent(ctx, req, () => svc().redeem(id));
    });
    app.get('/api/v1/shop/redemptions', async () => svc().listRedemptions());
    app.post('/api/v1/shop/redemptions/:id/undo', async (req) => {
      const { id } = P.parse(req.params);
      return idempotent(ctx, req, () => svc().undoRedemption(id));
    });
  },
};
