import type { NotificationDto, NotificationType } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { newId } from '../../core/ids.js';
import { notFound } from '../../core/errors.js';
import { addHoursIso } from '../../core/time.js';

export type NotifyInput = {
  type: NotificationType;
  objectType?: string | null;
  objectId?: string | null;
  /** Khóa chống trùng: không tạo mới nếu đã có notification cùng khóa chưa đọc và chưa ẩn. */
  dedupeKey: string;
  title: string;
  body?: string | null;
};

export type { NotificationDto };

/**
 * F-19 In-app Notification.
 * notify()/hideForObject(): CORE — mọi module dùng.
 * Agent D hoàn thiện: list, markRead, readAll, các rule (LEVEL_UP, POOL_REWARD, TASK_DEADLINE_SOON, TASK_MISSED...).
 */
export class NotificationService {
  constructor(private ctx: AppContext) {}

  /** Trả về id notification mới, hoặc null nếu bị chặn do trùng. */
  notify(input: NotifyInput): string | null {
    const dup = this.ctx.db
      .prepare('SELECT 1 FROM notifications WHERE dedupe_key = ? AND read_at IS NULL AND hidden_at IS NULL')
      .get(input.dedupeKey);
    if (dup) return null;
    const id = newId();
    this.ctx.db
      .prepare(
        `INSERT INTO notifications (id, type, object_type, object_id, dedupe_key, title, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.type, input.objectType ?? null, input.objectId ?? null, input.dedupeKey, input.title, input.body ?? null, this.ctx.nowIso());
    return id;
  }

  /** Có notification với dedupeKey này (kể cả đã đọc) hay chưa — dùng cho rule "1 lần / ...". */
  existsEver(dedupeKey: string): boolean {
    return !!this.ctx.db.prepare('SELECT 1 FROM notifications WHERE dedupe_key = ?').get(dedupeKey);
  }

  /** Ẩn các notification chưa đọc của một đối tượng (ví dụ Task đã hoàn thành). */
  hideForObject(objectType: string, objectId: string, types?: NotificationType[]): void {
    const rows = this.ctx.db
      .prepare('SELECT id, type FROM notifications WHERE object_type = ? AND object_id = ? AND read_at IS NULL AND hidden_at IS NULL')
      .all(objectType, objectId) as { id: string; type: NotificationType }[];
    const upd = this.ctx.db.prepare('UPDATE notifications SET hidden_at = ? WHERE id = ?');
    for (const r of rows) if (!types || types.includes(r.type)) upd.run(this.ctx.nowIso(), r.id);
  }

  // ---------------- query / read state (Agent D) ----------------

  /** unreadOnly → chưa đọc và chưa ẩn; ngược lại toàn bộ lịch sử (giữ ≥ 90 ngày, không purge). Mới nhất trước. */
  list(opts: { unreadOnly?: boolean } = {}): NotificationDto[] {
    const w = opts.unreadOnly ? 'WHERE read_at IS NULL AND hidden_at IS NULL' : '';
    return (this.ctx.db.prepare(`SELECT * FROM notifications ${w} ORDER BY created_at DESC, rowid DESC`).all() as Row[]).map(toDto);
  }

  unreadCount(): number {
    return (this.ctx.db.prepare('SELECT COUNT(*) c FROM notifications WHERE read_at IS NULL AND hidden_at IS NULL').get() as { c: number }).c;
  }

  markRead(id: string): NotificationDto {
    const r = this.ctx.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Notification', { id });
    if (!r.read_at) this.ctx.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(this.ctx.nowIso(), id);
    return toDto(this.ctx.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Row);
  }

  readAll(): { updated: number } {
    const r = this.ctx.db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND hidden_at IS NULL').run(this.ctx.nowIso());
    return { updated: r.changes };
  }

  // ---------------- rules (Agent D) ----------------

  /** LEVEL_UP và POOL_REWARD từ event xp.transaction_created. */
  onXpTransaction(tx: { transactionId: string; type: string; lifetimeDelta: number; levelBefore: number; levelAfter: number }): void {
    if (tx.type === 'POOL_REWARD') {
      this.notify({
        type: 'POOL_REWARD', objectType: 'XP_TRANSACTION', objectId: tx.transactionId, dedupeKey: `POOL_REWARD:${tx.transactionId}`,
        title: `Pool Reward +${tx.lifetimeDelta} XP`, body: 'Pool tích lũy đã đạt ngưỡng',
      });
    }
    if (tx.levelAfter > tx.levelBefore) {
      this.notify({
        type: 'LEVEL_UP', objectType: 'LEVEL', objectId: String(tx.levelAfter), dedupeKey: `LEVEL_UP:${tx.levelAfter}`,
        title: `Lên Level ${tx.levelAfter}`, body: null,
      });
    }
  }

  /** Job TASK_DEADLINE_SOON: Task mở, now < deadline ≤ now + 24h; 1 lần / Task / giá trị deadline. */
  runDeadlineSoon(nowIso: string): void {
    const until = addHoursIso(nowIso, 24);
    const tasks = this.ctx.services.tasks
      .list()
      .filter((t) => (t.status === 'TODO' || t.status === 'IN_PROGRESS') && !!t.deadline && t.deadline > nowIso && t.deadline <= until);
    for (const t of tasks) {
      const key = `TASK_DEADLINE_SOON:${t.id}:${t.deadline}`;
      if (this.existsEver(key)) continue;
      this.notify({ type: 'TASK_DEADLINE_SOON', objectType: 'TASK', objectId: t.id, dedupeKey: key, title: 'Task sắp đến hạn', body: t.title });
    }
  }
}

type Row = {
  id: string; type: NotificationType; object_type: string | null; object_id: string | null; dedupe_key: string;
  title: string; body: string | null; read_at: string | null; hidden_at: string | null; created_at: string;
};

const toDto = (r: Row): NotificationDto => ({
  id: r.id, type: r.type, objectType: r.object_type, objectId: r.object_id, title: r.title, body: r.body,
  read: !!r.read_at, createdAt: r.created_at,
});
