import type { AppContext } from '../../core/context.js';
import type { ActivityItemDto, ActivityPageDto } from '@pph/shared';
import { notFound } from '../../core/errors.js';
import { newId } from '../../core/ids.js';
import { dayRangeUtc } from '../../core/time.js';

export type ActivityInput = {
  type: string;
  message: string;
  goalId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  itemId?: string | null;
  before?: unknown;
  after?: unknown;
};

export type ActivityDto = ActivityItemDto;

/**
 * F-18 Activity History.
 * log(): CORE — mọi module gọi để ghi hoạt động (entry bất biến).
 * Phần truy vấn/lọc/phân trang: Agent D hoàn thiện (list()).
 */
export class ActivityService {
  constructor(private ctx: AppContext) {}

  log(input: ActivityInput): string {
    const id = newId();
    this.ctx.db
      .prepare(
        `INSERT INTO activity_log (id, type, message, goal_id, task_id, milestone_id, item_id, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, input.type, input.message, input.goalId ?? null, input.taskId ?? null, input.milestoneId ?? null,
        input.itemId ?? null,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        this.ctx.nowIso(),
      );
    return id;
  }

  /**
   * F-18: lọc from/to (ISO datetime hoặc 'YYYY-MM-DD' theo timezone Owner, `to` dạng ngày = hết ngày đó),
   * goalId, taskId, type (một hoặc nhiều, cách nhau dấu phẩy); 50/trang; mới nhất trước.
   */
  list(f: ActivityFilters = {}): ActivityPageDto {
    const where: string[] = [];
    const args: unknown[] = [];
    const tz = this.ctx.tz();
    if (f.from) { where.push('created_at >= ?'); args.push(DATE_RE.test(f.from) ? dayRangeUtc(f.from, tz).start : new Date(f.from).toISOString()); }
    if (f.to) {
      if (DATE_RE.test(f.to)) { where.push('created_at < ?'); args.push(dayRangeUtc(f.to, tz).end); }
      else { where.push('created_at <= ?'); args.push(new Date(f.to).toISOString()); }
    }
    if (f.goalId) { where.push('goal_id = ?'); args.push(f.goalId); }
    if (f.taskId) { where.push('task_id = ?'); args.push(f.taskId); }
    if (f.type) {
      const types = f.type.split(',').map((t) => t.trim()).filter(Boolean);
      if (types.length) { where.push(`type IN (${types.map(() => '?').join(',')})`); args.push(...types); }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pageSize = PAGE_SIZE;
    const page = Math.max(Math.floor(f.page ?? 1), 1);
    const total = (this.ctx.db.prepare(`SELECT COUNT(*) c FROM activity_log ${w}`).get(...args) as { c: number }).c;
    const rows = this.ctx.db
      .prepare(`SELECT * FROM activity_log ${w} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize) as Row[];
    return { items: rows.map(toDto), page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
  }

  get(id: string): ActivityDto {
    const r = this.ctx.db.prepare('SELECT * FROM activity_log WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Activity', { id });
    return toDto(r);
  }
}

export type ActivityFilters = { from?: string; to?: string; goalId?: string; taskId?: string; type?: string; page?: number };
const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; type: string; message: string; goal_id: string | null; task_id: string | null;
  milestone_id: string | null; item_id: string | null; before_json: string | null; after_json: string | null; created_at: string;
};

export const toDto = (r: Row): ActivityDto => ({
  id: r.id, type: r.type, message: r.message, goalId: r.goal_id, taskId: r.task_id, milestoneId: r.milestone_id,
  itemId: r.item_id, before: r.before_json ? JSON.parse(r.before_json) : null,
  after: r.after_json ? JSON.parse(r.after_json) : null, createdAt: r.created_at,
});
