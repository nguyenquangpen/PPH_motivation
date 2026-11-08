import type { HubModule } from '../../core/context.js';
import { CalendarService } from './service.js';

export const calendarModule: HubModule = {
  name: 'calendar',
  init(ctx) {
    ctx.services.calendar = new CalendarService(ctx);
  },
  wire(_ctx) {},
  routes(_app, _ctx) {},
};
