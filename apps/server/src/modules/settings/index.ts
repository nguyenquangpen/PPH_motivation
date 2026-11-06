import { z } from 'zod';
import type { HubModule } from '../../core/context.js';
import { SettingsService } from './service.js';

export const settingsModule: HubModule = {
  name: 'settings',
  init(ctx) {
    ctx.services.settings = new SettingsService(ctx);
  },
  routes(app, ctx) {
    app.get('/api/v1/settings', async () => ctx.services.settings.get());
    app.put('/api/v1/settings', async (req) => ctx.db.transaction(() => ctx.services.settings.update(req.body))());
    app.post('/api/v1/settings/reset', async (req) => {
      const { group } = z.object({ group: z.string() }).parse(req.body);
      return ctx.db.transaction(() => ctx.services.settings.resetGroup(group))();
    });
  },
};
