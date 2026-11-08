import { z } from 'zod';
import type { HubModule } from '../../core/context.js';
import { ActivityService } from './service.js';

const DateOrIso = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)), 'Ngày/giờ không hợp lệ');

/** log() là CORE. F-18: GET /api/v1/activity (lọc + phân trang 50). Entry bất biến: không có route sửa/xóa. */
export const activityModule: HubModule = {
  name: 'activity',
  init(ctx) {
    ctx.services.activity = new ActivityService(ctx);
  },
  routes(app, ctx) {
    app.get('/api/v1/activity', async (req) => {
      const q = z
        .object({
          from: DateOrIso.optional(), to: DateOrIso.optional(), goalId: z.string().optional(), taskId: z.string().optional(),
          type: z.string().optional(), page: z.coerce.number().int().min(1).optional(),
        })
        .parse(req.query);
      return ctx.services.activity.list(q);
    });
    app.get('/api/v1/activity/:id', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      return ctx.services.activity.get(id);
    });
  },
};
