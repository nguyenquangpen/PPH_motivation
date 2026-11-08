import type { HubModule } from '../../core/context.js';
import { SchedulingService } from './service.js';

export const schedulingModule: HubModule = {
  name: 'scheduling',
  init(ctx) {
    ctx.services.scheduling = new SchedulingService(ctx);
  },
  wire(_ctx) {},
  routes(_app, _ctx) {},
};
