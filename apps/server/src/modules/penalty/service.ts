import { ErrorCode, type ReasonTagDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound, rule } from '../../core/errors.js';
import { newId } from '../../core/ids.js';
import { normName } from '../../core/seed.js';
import type { TaskRow } from '../tasks/service.js';

type TagRow = {
  id: string; name: string; name_norm: string; exempt: number; is_system: number; system_code: string | null;
  created_at: string; deleted_at: string | null;
};

type EvalRow = { task_id: string; deadline: string; evaluated_at: string; penalty_transaction_id: string | null };

const HOUR_MS = 3600_000;
const toTagDto = (r: TagRow): ReasonTagDto => ({ id: r.id, name: r.name, exempt: !!r.exempt, isSystem: !!r.is_system });

/**
 * F-15 Missed & Penalty, F-16 Missed Reason Tags.
 * Missed detection (isMissed), cancel, missed-review nằm trong TaskService — module này xử lý:
 *  - job đánh giá phạt (deadline + grace), catch-up idempotent qua bảng penalty_evaluations (task, deadline)
 *  - event task.cancelled (phạt ngay nếu Missed + lý do không miễn), task.reason_changed (hoàn/phạt lại)
 *  - job TASK_MISSED notification (1 lần / task / deadline)
 *  - CRUD tag /api/v1/missed-reasons
 * Bất biến: tối đa 1 PENALTY chưa đảo / (task, deadline) — PENALTY hiện hành lưu ở penalty_evaluations.penalty_transaction_id.
 */
export class PenaltyService {
  constructor(private ctx: AppContext) {}

  // ---------------- Tags (F-16) ----------------

  listTags(): ReasonTagDto[] {
    return (this.ctx.db.prepare('SELECT * FROM missed_reason_tags WHERE deleted_at IS NULL ORDER BY rowid').all() as TagRow[]).map(toTagDto);
  }

  /** Lấy tag kể cả đã xóa (để lịch sử Task vẫn hiển thị tên cũ). */
  getTag(id: string): ReasonTagDto {
    return toTagDto(this.tagRow(id, true));
  }

  createTag(input: { name: string; exempt: boolean }): ReasonTagDto {
    const name = input.name.trim();
    const norm = normName(name);
    this.assertUniqueName(norm);
    const id = newId();
    this.ctx.db
      .prepare('INSERT INTO missed_reason_tags (id, name, name_norm, exempt, is_system, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .run(id, name, norm, input.exempt ? 1 : 0, this.ctx.nowIso());
    this.ctx.services.activity.log({ type: 'REASON_TAG_CREATED', message: `Tạo lý do bỏ lỡ ${name}`, after: { id, name, exempt: input.exempt } });
    return this.getTag(id);
  }

  /** Sửa tên / cờ miễn trừ. Không hồi tố: PENALTY đã có không thay đổi. */
  updateTag(id: string, input: { name?: string; exempt?: boolean }): ReasonTagDto {
    const r = this.tagRow(id);
    const name = input.name !== undefined ? input.name.trim() : r.name;
    const norm = normName(name);
    if (norm !== r.name_norm) this.assertUniqueName(norm, id);
    const exempt = input.exempt !== undefined ? (input.exempt ? 1 : 0) : r.exempt;
    this.ctx.db.prepare('UPDATE missed_reason_tags SET name = ?, name_norm = ?, exempt = ? WHERE id = ?').run(name, norm, exempt, id);
    this.ctx.services.activity.log({
      type: 'REASON_TAG_UPDATED', message: `Cập nhật lý do bỏ lỡ ${name}`,
      before: { name: r.name, exempt: !!r.exempt }, after: { name, exempt: !!exempt },
    });
    return this.getTag(id);
  }

  /** Soft delete. Tag hệ thống không xóa được. Task đang dùng giữ tham chiếu (lịch sử hiển thị tên cũ). */
  deleteTag(id: string): { deleted: true } {
    const r = this.tagRow(id);
    if (r.is_system) throw rule(ErrorCode.SYSTEM_TAG, 'Không thể xóa tag hệ thống', { id });
    this.ctx.db.prepare('UPDATE missed_reason_tags SET deleted_at = ? WHERE id = ?').run(this.ctx.nowIso(), id);
    this.ctx.services.activity.log({ type: 'REASON_TAG_DELETED', message: `Xóa lý do bỏ lỡ ${r.name}`, before: { id, name: r.name } });
    return { deleted: true };
  }

  /** Số Task trong Missed Review queue — dùng bởi dashboard. */
  missedReviewCount(): number {
    return this.ctx.services.tasks.list({ missed: true }).length;
  }

  // ---------------- Penalty (F-15) ----------------

  /** ceil(PenaltyPercent% × NominalXP) — áp dụng cả Task nhỏ, mọi Priority. */
  penaltyAmount(t: Pick<TaskRow, 'contribution' | 'estimated_duration' | 'actual_duration'>): number {
    const s = this.ctx.services.settings.get();
    const nominal = this.ctx.services.xp.nominalXp(t.contribution, t.estimated_duration, t.actual_duration, s);
    return Math.ceil((s.penaltyPercent * nominal) / 100);
  }

  evaluation(taskId: string, deadline: string): EvalRow | undefined {
    return this.ctx.db.prepare('SELECT * FROM penalty_evaluations WHERE task_id = ? AND deadline = ?').get(taskId, deadline) as EvalRow | undefined;
  }

  /** PENALTY chưa đảo của task cho một giá trị deadline (nếu có). */
  activePenaltyId(taskId: string, deadline: string): string | null {
    const e = this.evaluation(taskId, deadline);
    if (!e?.penalty_transaction_id) return null;
    return this.ctx.services.ledger.isReversed(e.penalty_transaction_id) ? null : e.penalty_transaction_id;
  }

  /** Job: đánh giá phạt đúng 1 lần cho mỗi (task, deadline) đã qua deadline + grace. Catch-up khi khởi động. */
  evaluateDue(nowIso: string = this.ctx.nowIso()): void {
    const s = this.ctx.services.settings.get();
    const nowMs = new Date(nowIso).getTime();
    const rows = this.ctx.db
      .prepare(
        `SELECT t.* FROM tasks t
         WHERE t.status IN ('TODO','IN_PROGRESS') AND t.deleted_at IS NULL AND t.deadline IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM penalty_evaluations e WHERE e.task_id = t.id AND e.deadline = t.deadline)
         ORDER BY t.rowid`,
      )
      .all() as TaskRow[];
    for (const t of rows) {
      const deadlineMs = new Date(t.deadline!).getTime();
      if (!(nowMs > deadlineMs)) continue; // chưa Missed
      if (deadlineMs + s.gracePeriodHours * HOUR_MS > nowMs) continue; // còn trong Grace
      this.evaluate(t);
    }
  }

  /** Đánh giá một task (deadline hiện tại) và ghi dòng penalty_evaluations. */
  private evaluate(t: TaskRow): void {
    const deadline = t.deadline!;
    this.insertEvaluation(t.id, deadline);
    const s = this.ctx.services.settings.get();
    if (!s.penaltyEnabled) return;
    if (t.goal_id && this.ctx.services.goals.isPaused(t.goal_id)) {
      const sys = this.systemTagId('GOAL_PAUSED');
      if (sys) this.ctx.services.tasks.setReasonTag(t.id, sys);
      return;
    }
    if (this.isExempt(t.missed_reason_tag_id)) return;
    this.applyPenalty(t, deadline);
  }

  /** Event task.cancelled: Missed + tag không miễn → phạt ngay (không chờ Grace). */
  onCancelled(p: { taskId: string; wasMissed: boolean; reasonTagId: string | null; deadline: string | null }): void {
    if (!p.wasMissed || !p.deadline) return;
    const t = this.ctx.services.tasks.row(p.taskId, { includeDeleted: true });
    if (!this.evaluation(t.id, p.deadline)) this.insertEvaluation(t.id, p.deadline);
    if (!this.shouldPenalize(t, p.reasonTagId)) return;
    if (this.activePenaltyId(t.id, p.deadline)) return;
    this.applyPenalty(t, p.deadline);
  }

  /** Event task.reason_changed: hoàn phạt khi đổi sang tag miễn; phạt lại khi đổi về tag không miễn (đã qua đánh giá). */
  onReasonChanged(p: { taskId: string; after: string | null }): void {
    const t = this.ctx.services.tasks.row(p.taskId, { includeDeleted: true });
    if (!t.deadline) return;
    const evalRow = this.evaluation(t.id, t.deadline);
    if (!evalRow) return; // chưa đến lúc đánh giá — job sẽ dùng tag hiện tại
    const active = this.activePenaltyId(t.id, t.deadline);
    if (active) {
      if (this.isExempt(p.after)) {
        this.ctx.services.ledger.reverseXp(active, `Hoàn phạt Task ${t.title} (lý do miễn trừ)`);
        this.ctx.services.activity.log({
          type: 'TASK_PENALTY_REVERSED', message: `Hoàn phạt Task ${t.title}`, taskId: t.id, goalId: t.goal_id,
          after: { deadline: t.deadline, reversedTransactionId: active },
        });
      }
      return;
    }
    if (this.shouldPenalize(t, p.after)) this.applyPenalty(t, t.deadline);
  }

  /** Job: Notification TASK_MISSED 1 lần / task / giá trị deadline. */
  notifyMissed(nowIso: string = this.ctx.nowIso()): void {
    const rows = this.ctx.db
      .prepare(
        `SELECT * FROM tasks WHERE status IN ('TODO','IN_PROGRESS') AND deleted_at IS NULL AND deadline IS NOT NULL ORDER BY rowid`,
      )
      .all() as TaskRow[];
    const nowMs = new Date(nowIso).getTime();
    const notif = this.ctx.services.notifications;
    for (const t of rows) {
      if (!(nowMs > new Date(t.deadline!).getTime())) continue;
      const key = `TASK_MISSED:${t.id}:${t.deadline}`;
      if (notif.existsEver(key)) continue;
      notif.notify({ type: 'TASK_MISSED', objectType: 'TASK', objectId: t.id, dedupeKey: key, title: 'Task quá hạn', body: t.title });
    }
  }

  // ---------------- helpers ----------------

  private shouldPenalize(t: TaskRow, tagId: string | null): boolean {
    if (!this.ctx.services.settings.get().penaltyEnabled) return false;
    if (t.goal_id && this.ctx.services.goals.isPaused(t.goal_id)) return false;
    return !this.isExempt(tagId);
  }

  private applyPenalty(t: TaskRow, deadline: string): void {
    const amount = this.penaltyAmount(t);
    const tx = this.ctx.services.ledger.addXp({
      type: 'PENALTY', amount, sourceType: 'TASK', sourceId: t.id, reason: `Phạt Task ${t.title} (deadline ${deadline})`,
    });
    if (tx) {
      this.ctx.db.prepare('UPDATE penalty_evaluations SET penalty_transaction_id = ? WHERE task_id = ? AND deadline = ?').run(tx.id, t.id, deadline);
    }
    this.ctx.services.activity.log({
      type: 'TASK_PENALIZED', message: `Task ${t.title} bị đánh giá phạt ${amount} XP`, taskId: t.id, goalId: t.goal_id,
      after: { deadline, amount, transactionId: tx?.id ?? null },
    });
  }

  private insertEvaluation(taskId: string, deadline: string): void {
    this.ctx.db
      .prepare('INSERT OR IGNORE INTO penalty_evaluations (task_id, deadline, evaluated_at) VALUES (?, ?, ?)')
      .run(taskId, deadline, this.ctx.nowIso());
  }

  /** Cờ miễn trừ hiện tại của tag (kể cả tag đã xóa mềm). Không có tag → không miễn. */
  private isExempt(tagId: string | null): boolean {
    if (!tagId) return false;
    const r = this.ctx.db.prepare('SELECT exempt FROM missed_reason_tags WHERE id = ?').get(tagId) as { exempt: number } | undefined;
    return !!r?.exempt;
  }

  private systemTagId(code: string): string | null {
    return (this.ctx.db.prepare('SELECT id FROM missed_reason_tags WHERE system_code = ? AND deleted_at IS NULL').get(code) as { id: string } | undefined)?.id ?? null;
  }

  private tagRow(id: string, includeDeleted = false): TagRow {
    const r = this.ctx.db.prepare('SELECT * FROM missed_reason_tags WHERE id = ?').get(id) as TagRow | undefined;
    if (!r || (r.deleted_at && !includeDeleted)) throw notFound('Missed Reason tag', { id });
    return r;
  }

  private assertUniqueName(norm: string, exceptId?: string): void {
    const dup = this.ctx.db.prepare('SELECT id FROM missed_reason_tags WHERE name_norm = ? AND deleted_at IS NULL').get(norm) as { id: string } | undefined;
    if (dup && dup.id !== exceptId) throw conflict(ErrorCode.DUPLICATE_NAME, 'Tên lý do đã tồn tại', { name: norm });
  }
}
