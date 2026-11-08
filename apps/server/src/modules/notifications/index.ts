import { z } from 'zod';
import type { NotificationListDto } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { NotificationService } from './service.js';

/**
 * F-19. notify()/existsEver()/hideForObject() là CORE.
 * Rule: LEVEL_UP, POOL_REWARD (event xp.transaction_created); job TASK_DEADLINE_SOON.
 */
export const notificationsModule: HubModule = {
  name: 'notifications',
  init(ctx) {
    ctx.services.notifications = new NotificationService(ctx);
  },
  wire(ctx) {
    ctx.events.on('xp.transaction_created', (tx) => ctx.services.notifications.onXpTransaction(tx));
    ctx.scheduler.register({ name: 'notifications.deadline_soon', run: (nowIso) => ctx.services.notifications.runDeadlineSoon(nowIso) });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.notifications;
    app.get('/api/v1/notifications', async (req): Promise<NotificationListDto> => {
      const q = z.object({ unread: z.enum(['true', 'false']).optional() }).parse(req.query);
      return { items: svc().list({ unreadOnly: q.unread === 'true' }), unreadCount: svc().unreadCount() };
    });
    app.post('/api/v1/notifications/read-all', async () => ctx.db.transaction(() => svc().readAll())());
    app.post('/api/v1/notifications/:id/read', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      return ctx.db.transaction(() => svc().markRead(id))();
    });
  },
};
