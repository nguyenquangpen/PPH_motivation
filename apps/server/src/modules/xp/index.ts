import type { HubModule } from '../../core/context.js';
import { XpService } from './service.js';

export const xpModule: HubModule = {
  name: 'xp',
  init(ctx) {
    ctx.services.xp = new XpService(ctx);
  },
};
