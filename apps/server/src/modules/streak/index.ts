import { z } from 'zod';
import { CheckinDateParamSchema, CheckinSchema } from '@pph/shared';
import type { HubModule } from '../../core/context.js';
import { StreakService } from './service.js';

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** F-13 Streak (+job Freeze), F-14 Check-in. */
export const streakModule: HubModule = {
  name: 'streak',
  init(ctx) {
    ctx.services.streak = new StreakService(ctx);
  },
  wire(ctx) {
    ctx.scheduler.register({ name: 'streak.freeze', run: (nowIso) => ctx.services.streak.processEndedDays(nowIso) });
  },
  routes(app, ctx) {
    const svc = () => ctx.services.streak;
    app.get('/api/v1/streak', async () => svc().get());

    app.get('/api/v1/checkins', async (req) => {
      const q = z.object({ from: DateStr.optional(), to: DateStr.optional() }).parse(req.query);
      return svc().listCheckins(q.from, q.to);
    });
    app.put('/api/v1/checkins/today', async (req) => {
      const body = CheckinSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().upsertTodayCheckin(body))();
    });
    /** Chỉ chấp nhận ngày hôm nay; ngày cũ → 422 (F-14: không sửa ngày cũ). */
    app.put('/api/v1/checkins/:date', async (req) => {
      const { date } = CheckinDateParamSchema.parse(req.params);
      const body = CheckinSchema.parse(req.body ?? {});
      return ctx.db.transaction(() => svc().upsertCheckin(date, body))();
    });
  },
};
