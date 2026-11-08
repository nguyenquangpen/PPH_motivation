import type { HubModule } from '../../core/context.js';
import { DashboardService } from './service.js';

/** F-17: GET /api/v1/dashboard. */
export const dashboardModule: HubModule = {
  name: 'dashboard',
  init(ctx) {
    ctx.services.dashboard = new DashboardService(ctx);
  },
  routes(app, ctx) {
    app.get('/api/v1/dashboard', async () => ctx.services.dashboard.get());
  },
};
