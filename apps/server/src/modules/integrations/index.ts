import type { HubModule } from '../../core/context.js';
import { IntegrationService } from './service.js';

export const integrationsModule: HubModule = {
  name: 'integrations',
  init(ctx) {
    ctx.services.integrations = new IntegrationService(ctx);
  },
  wire(_ctx) {},
  routes(_app, _ctx) {},
};
