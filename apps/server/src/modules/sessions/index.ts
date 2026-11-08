import type { HubModule } from '../../core/context.js';
import { SessionService } from './service.js';

export const sessionsModule: HubModule = {
  name: 'sessions',
  init(ctx) {
    ctx.services.sessions = new SessionService(ctx);
  },
  wire(_ctx) {},
  routes(_app, _ctx) {},
};
