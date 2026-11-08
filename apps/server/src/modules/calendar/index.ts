import { z } from 'zod';
import { BusyCalendarsSchema, LinkEventSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { validation } from '../../core/errors.js';
import { CalendarService } from './service.js';

const Range = z.object({ from: z.string().min(1), to: z.string().min(1) });
const OauthClient = z.object({ clientId: z.string().trim().min(1), clientSecret: z.string().trim().min(1).optional() });

export const calendarModule: HubModule = {
  name: 'calendar',
  init(ctx) {
    ctx.services.calendar = new CalendarService(ctx);
  },
  wire(ctx) {
    ctx.services.calendar.wire();
  },
  routes(app, ctx) {
    const svc = () => ctx.services.calendar;
    const range = (q: unknown) => {
      const r = Range.parse(q);
      if (Number.isNaN(Date.parse(r.from)) || Number.isNaN(Date.parse(r.to))) throw validation('from/to không hợp lệ');
      return r;
    };

    app.get('/api/v1/calendar/status', async () => svc().status());
    app.get('/api/v1/calendar/oauth-client', async () => svc().getOauthClient());
    app.put('/api/v1/calendar/oauth-client', async (req) => {
      const b = OauthClient.parse(req.body);
      return svc().setOauthClient(b.clientId, b.clientSecret);
    });
    app.post('/api/v1/calendar/connect', async () => svc().startConnect());
    app.post('/api/v1/calendar/disconnect', async () => svc().disconnect());
    app.get('/api/v1/calendar/calendars', async () => svc().listCalendars());
    app.put('/api/v1/calendar/busy-calendars', async (req) => svc().setBusyCalendars(BusyCalendarsSchema.parse(req.body).calendarIds));
    app.post('/api/v1/calendar/sync', async () => svc().syncFromUi());
    app.get('/api/v1/calendar/busy', async (req) => {
      const r = range(req.query);
      return svc().busy(r.from, r.to);
    });
    // F-34
    app.get('/api/v1/calendar/events', async (req) => {
      const r = range(req.query);
      return svc().externalEvents(r.from, r.to);
    });
    app.post('/api/v1/tasks/:id/sessions/link', async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const { eventId } = LinkEventSchema.parse(req.body);
      const res = ctx.db.transaction(() => svc().linkEvent(id, eventId))();
      reply.code(201);
      return res;
    });
  },
};
