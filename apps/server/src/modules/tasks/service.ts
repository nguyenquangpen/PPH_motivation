import {
  ErrorCode, type CreateTaskInput, type Priority, type TaskDto, type TaskHistoryDto, type TaskStatus, type UpdateTaskInput,
  type MissedReviewAction,
} from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { notFound, rule, validation } from '../../core/errors.js';
import { newId } from '../../core/ids.js';
import { dayRangeUtc, localDate, normalizeDeadline } from '../../core/time.js';

export type TaskRow = {
  id: string; title: string; description: string | null; priority: Priority; contribution: number;
  goal_id: string | null; estimated_duration: number; actual_duration: number | null; deadline: string | null;
  status: TaskStatus; completed_at: string | null; missed_reason_tag_id: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

type CompletionRow = {
  id: string; task_id: string; completed_at: string; contribution: number; goal_id: string | null; is_small: number;
  contribution_entry_id: string | null; xp_transaction_id: string | null; pool_entry_id: string | null; undone_at: string | null;
};

export type TaskFilters = { status?: TaskStatus; goalId?: string; missed?: boolean; due?: 'today'; includeDeleted?: boolean };

const OPEN: TaskStatus[] = ['TODO', 'IN_PROGRESS'];

/**
 * F-05 Task Management + F-06 Task Lifecycle (CORE).
 * Mọi method ghi phải được gọi trong transaction (routes đã bọc).
 */
export class TaskService {
  constructor(private ctx: AppContext) {}

  // ---------------- read ----------------

  row(id: string, opts: { includeDeleted?: boolean } = {}): TaskRow {
    const r = this.ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!r || (r.deleted_at && !opts.includeDeleted)) throw notFound('Task', { id });
    return r;
  }

  isMissed(r: Pick<TaskRow, 'status' | 'deadline'>, nowIso: string = this.ctx.nowIso()): boolean {
    return OPEN.includes(r.status) && !!r.deadline && nowIso > r.deadline;
  }

  milestoneIds(taskId: string): string[] {
    return (this.ctx.db.prepare('SELECT milestone_id FROM task_milestones WHERE task_id = ? ORDER BY milestone_id').all(taskId) as {
      milestone_id: string;
    }[]).map((r) => r.milestone_id);
  }

  activeCompletion(taskId: string): CompletionRow | undefined {
    return this.ctx.db
      .prepare('SELECT * FROM task_completions WHERE task_id = ? AND undone_at IS NULL ORDER BY rowid DESC LIMIT 1')
      .get(taskId) as CompletionRow | undefined;
  }

  toDto(r: TaskRow): TaskDto {
    const completion = r.status === 'COMPLETED' ? this.activeCompletion(r.id) : undefined;
    let xpReceived: number | null = null;
    if (completion) {
      if (completion.xp_transaction_id && !this.ctx.services.ledger.isReversed(completion.xp_transaction_id)) {
        xpReceived = this.ctx.services.ledger.getXp(completion.xp_transaction_id)?.lifetimeDelta ?? 0;
      } else xpReceived = 0;
    }
    return {
      id: r.id, title: r.title, description: r.description, priority: r.priority, contribution: r.contribution,
      goalId: r.goal_id, milestoneIds: this.milestoneIds(r.id), estimatedDuration: r.estimated_duration,
      actualDuration: r.actual_duration, deadline: r.deadline, status: r.status, completedAt: r.completed_at,
      missed: this.isMissed(r), missedReasonTagId: r.missed_reason_tag_id,
      missedReasonTagName: r.missed_reason_tag_id ? this.tagName(r.missed_reason_tag_id) : null,
      expectedXp: this.ctx.services.xp.expected(r.contribution, r.estimated_duration, r.actual_duration),
      xpReceived, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  get(id: string): TaskDto {
    return this.toDto(this.row(id));
  }

  list(f: TaskFilters = {}): TaskDto[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (!f.includeDeleted) where.push('deleted_at IS NULL');
    if (f.status) { where.push('status = ?'); args.push(f.status); }
    if (f.goalId) { where.push('goal_id = ?'); args.push(f.goalId); }
    if (f.due === 'today') {
      const tz = this.ctx.tz();
      const { start, end } = dayRangeUtc(localDate(this.ctx.nowIso(), tz), tz);
      where.push('deadline >= ? AND deadline < ?');
      args.push(start, end);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let rows = this.ctx.db.prepare(`SELECT * FROM tasks ${w} ORDER BY created_at, rowid`).all(...args) as TaskRow[];
    if (f.missed !== undefined) rows = rows.filter((r) => this.isMissed(r) === f.missed);
    return rows.map((r) => this.toDto(r));
  }

  history(id: string): TaskHistoryDto[] {
    this.row(id, { includeDeleted: true });
    return (this.ctx.db.prepare('SELECT * FROM task_status_history WHERE task_id = ? ORDER BY rowid').all(id) as {
      from_status: TaskStatus | null; to_status: TaskStatus; reason: string | null; at: string;
    }[]).map((h) => ({ fromStatus: h.from_status, toStatus: h.to_status, reason: h.reason, at: h.at }));
  }

  // ---------------- write ----------------

  create(input: CreateTaskInput): TaskDto {
    const now = this.ctx.nowIso();
    const goalId = input.goalId ?? null;
    if (goalId) this.ensureGoal(goalId);
    const milestoneIds = input.milestoneIds ?? [];
    this.ensureMilestones(milestoneIds, goalId);
    const deadline = input.deadline ? this.parseFutureDeadline(input.deadline) : null;
    const id = newId();
    this.ctx.db
      .prepare(
        `INSERT INTO tasks (id, title, description, priority, contribution, goal_id, estimated_duration, deadline, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO', ?, ?)`,
      )
      .run(id, input.title.trim(), input.description ?? null, input.priority, input.contribution, goalId, input.estimatedDuration, deadline, now, now);
    this.setMilestones(id, milestoneIds);
    this.addHistory(id, null, 'TODO', null);
    this.ctx.services.activity.log({ type: 'TASK_CREATED', message: `Tạo Task ${input.title.trim()}`, taskId: id, goalId });
    return this.get(id);
  }

  update(id: string, input: UpdateTaskInput): TaskDto {
    const r = this.row(id);
    const now = this.ctx.nowIso();
    if (r.status === 'COMPLETED') {
      const locked: string[] = [];
      if (input.contribution !== undefined && input.contribution !== r.contribution) locked.push('contribution');
      if (input.goalId !== undefined && (input.goalId ?? null) !== r.goal_id) locked.push('goalId');
      if (input.estimatedDuration !== undefined && input.estimatedDuration !== r.estimated_duration) locked.push('estimatedDuration');
      if (input.actualDuration !== undefined && (input.actualDuration ?? null) !== r.actual_duration) locked.push('actualDuration');
      if (input.milestoneIds !== undefined && [...input.milestoneIds].sort().join() !== this.milestoneIds(id).join()) locked.push('milestoneIds');
      if (locked.length) throw rule(ErrorCode.TASK_LOCKED, 'Task đã hoàn thành — hãy hoàn tác trước khi sửa', { fields: locked });
    }
    const next = {
      title: input.title !== undefined ? input.title.trim() : r.title,
      description: input.description !== undefined ? input.description ?? null : r.description,
      priority: input.priority ?? r.priority,
      contribution: input.contribution ?? r.contribution,
      goal_id: input.goalId !== undefined ? input.goalId ?? null : r.goal_id,
      estimated_duration: input.estimatedDuration ?? r.estimated_duration,
      actual_duration: input.actualDuration !== undefined ? input.actualDuration ?? null : r.actual_duration,
      deadline: r.deadline,
    };
    if (input.goalId !== undefined && next.goal_id && next.goal_id !== r.goal_id) this.ensureGoal(next.goal_id);
    const milestoneIds = input.milestoneIds ?? (next.goal_id === r.goal_id ? this.milestoneIds(id) : []);
    this.ensureMilestones(milestoneIds, next.goal_id);
    if (input.deadline !== undefined) next.deadline = input.deadline ? this.parseFutureDeadline(input.deadline) : null;

    this.ctx.db
      .prepare(
        `UPDATE tasks SET title=?, description=?, priority=?, contribution=?, goal_id=?, estimated_duration=?, actual_duration=?, deadline=?, updated_at=?
         WHERE id=?`,
      )
      .run(next.title, next.description, next.priority, next.contribution, next.goal_id, next.estimated_duration, next.actual_duration, next.deadline, now, id);
    const linksChanged = next.goal_id !== r.goal_id || milestoneIds.slice().sort().join() !== this.milestoneIds(id).join();
    this.setMilestones(id, milestoneIds);
    this.ctx.services.activity.log({
      type: 'TASK_UPDATED', message: `Cập nhật Task ${next.title}`, taskId: id, goalId: next.goal_id,
      before: { contribution: r.contribution, goalId: r.goal_id, deadline: r.deadline, priority: r.priority },
      after: { contribution: next.contribution, goalId: next.goal_id, deadline: next.deadline, priority: next.priority },
    });
    if (next.deadline !== r.deadline) this.ctx.events.emit('task.deadline_changed', { taskId: id, before: r.deadline, after: next.deadline });
    if (linksChanged) this.ctx.events.emit('task.links_changed', { taskId: id, goalId: next.goal_id });
    return this.get(id);
  }

  /** Xóa (soft). Task COMPLETED cần confirm → Undo nguyên tử rồi soft delete. Penalty giữ nguyên. */
  delete(id: string, confirm: boolean): { deleted: true } {
    const r = this.row(id);
    if (r.status === 'COMPLETED') {
      if (!confirm) throw rule(ErrorCode.CONFIRM_REQUIRED, 'Xóa Task đã hoàn thành sẽ đảo ngược Contribution và XP — cần xác nhận');
      this.undo(id);
    }
    this.ctx.db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(this.ctx.nowIso(), this.ctx.nowIso(), id);
    this.ctx.db.prepare('DELETE FROM task_milestones WHERE task_id = ?').run(id);
    this.ctx.services.notifications.hideForObject('TASK', id);
    this.ctx.services.activity.log({ type: 'TASK_DELETED', message: `Xóa Task ${r.title}`, taskId: id, goalId: r.goal_id });
    this.ctx.events.emit('task.deleted', { taskId: id, goalId: r.goal_id });
    return { deleted: true };
  }

  start(id: string): TaskDto {
    const r = this.row(id);
    this.assertFrom(r, ['TODO'], 'start');
    this.setStatus(r, 'IN_PROGRESS', null);
    return this.get(id);
  }

  complete(id: string, opts: { actualDuration?: number } = {}): TaskDto {
    const r = this.row(id);
    this.assertFrom(r, OPEN, 'complete');
    const now = this.ctx.nowIso();
    const ledger = this.ctx.services.ledger;
    const s = this.ctx.services.settings.get();
    const actual = opts.actualDuration ?? r.actual_duration;
    if (opts.actualDuration !== undefined) {
      this.ctx.db.prepare('UPDATE tasks SET actual_duration = ? WHERE id = ?').run(opts.actualDuration, id);
    }
    this.ctx.db.prepare("UPDATE tasks SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=?").run(now, now, id);
    this.addHistory(id, r.status, 'COMPLETED', null);
    this.ctx.services.activity.log({ type: 'TASK_COMPLETED', message: `Hoàn thành Task ${r.title}`, taskId: id, goalId: r.goal_id });

    const small = this.ctx.services.xp.isSmall(r.contribution, s);
    const contributionEntryId = r.goal_id && r.contribution > 0 ? ledger.addContribution(r.goal_id, id, r.contribution) : null;
    let xpTxId: string | null = null;
    let poolEntryId: string | null = null;
    if (small) {
      if (r.contribution > 0) poolEntryId = ledger.poolAdd(id, r.contribution);
    } else {
      const amount = this.ctx.services.xp.nominalXp(r.contribution, r.estimated_duration, actual, s);
      xpTxId = ledger.addXp({ type: 'TASK_REWARD', amount, sourceType: 'TASK', sourceId: id, reason: `Hoàn thành Task ${r.title}` })?.id ?? null;
    }
    const completionId = newId();
    this.ctx.db
      .prepare(
        `INSERT INTO task_completions (id, task_id, completed_at, contribution, goal_id, is_small, contribution_entry_id, xp_transaction_id, pool_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(completionId, id, now, r.contribution, r.goal_id, small ? 1 : 0, contributionEntryId, xpTxId, poolEntryId);
    this.ctx.services.notifications.hideForObject('TASK', id, ['TASK_DEADLINE_SOON', 'TASK_MISSED']);
    this.ctx.events.emit('task.status_changed', { taskId: id, from: r.status, to: 'COMPLETED' });
    this.ctx.events.emit('task.completed', { taskId: id, goalId: r.goal_id, completionId });
    return this.get(id);
  }

  undo(id: string): TaskDto {
    const r = this.row(id);
    this.assertFrom(r, ['COMPLETED'], 'undo');
    const c = this.activeCompletion(id);
    const ledger = this.ctx.services.ledger;
    const now = this.ctx.nowIso();
    this.ctx.db.prepare("UPDATE tasks SET status='IN_PROGRESS', completed_at=NULL, updated_at=? WHERE id=?").run(now, id);
    this.addHistory(id, 'COMPLETED', 'IN_PROGRESS', 'Hoàn tác');
    this.ctx.services.activity.log({ type: 'TASK_UNDONE', message: `Hoàn tác Task ${r.title}`, taskId: id, goalId: r.goal_id });
    if (c) {
      if (c.contribution_entry_id) ledger.reverseContribution(c.contribution_entry_id);
      if (c.xp_transaction_id && !ledger.isReversed(c.xp_transaction_id)) ledger.reverseXp(c.xp_transaction_id, `Hoàn tác Task ${r.title}`);
      if (c.pool_entry_id) ledger.poolDeduct(id, c.contribution);
      this.ctx.db.prepare('UPDATE task_completions SET undone_at = ? WHERE id = ?').run(now, c.id);
    }
    this.ctx.events.emit('task.status_changed', { taskId: id, from: 'COMPLETED', to: 'IN_PROGRESS' });
    this.ctx.events.emit('task.undone', { taskId: id, goalId: r.goal_id, completionId: c?.id ?? '' });
    return this.get(id);
  }

  /** Cancel: trước deadline không cần lý do; khi Missed bắt buộc lý do. Phạt do module penalty xử lý qua event. */
  cancel(id: string, opts: { reasonTagId?: string } = {}): TaskDto {
    const r = this.row(id);
    this.assertFrom(r, OPEN, 'cancel');
    const wasMissed = this.isMissed(r);
    if (wasMissed && !opts.reasonTagId) throw rule(ErrorCode.REASON_REQUIRED, 'Task đã quá hạn — cần chọn lý do khi hủy');
    const tagId = opts.reasonTagId ?? r.missed_reason_tag_id;
    if (opts.reasonTagId) this.ensureTag(opts.reasonTagId);
    const now = this.ctx.nowIso();
    this.ctx.db.prepare("UPDATE tasks SET status='CANCELLED', missed_reason_tag_id=?, updated_at=? WHERE id=?").run(tagId, now, id);
    this.addHistory(id, r.status, 'CANCELLED', tagId ? this.tagName(tagId) : null);
    this.ctx.services.activity.log({ type: 'TASK_CANCELLED', message: `Hủy Task ${r.title}`, taskId: id, goalId: r.goal_id });
    this.ctx.services.notifications.hideForObject('TASK', id, ['TASK_DEADLINE_SOON', 'TASK_MISSED']);
    this.ctx.events.emit('task.status_changed', { taskId: id, from: r.status, to: 'CANCELLED' });
    this.ctx.events.emit('task.cancelled', { taskId: id, goalId: r.goal_id, wasMissed, reasonTagId: tagId, deadline: r.deadline });
    return this.get(id);
  }

  /** Missed review (F-15 rule 3). Task CANCELLED chỉ được đổi lý do (action KEEP). */
  missedReview(id: string, input: { reasonTagId: string; action: MissedReviewAction; newDeadline?: string }): TaskDto {
    const r = this.row(id);
    this.ensureTag(input.reasonTagId);
    if (r.status === 'CANCELLED') {
      if (input.action !== 'KEEP') throw rule(ErrorCode.TASK_INVALID_TRANSITION, 'Task đã hủy chỉ có thể đổi lý do');
      this.setReasonTag(id, input.reasonTagId);
      return this.get(id);
    }
    if (!this.isMissed(r)) throw rule(ErrorCode.CONFLICT, 'Task không ở trạng thái Missed');
    if (input.action === 'CANCEL') return this.cancel(id, { reasonTagId: input.reasonTagId });
    let newDeadline: string | null = null;
    if (input.action === 'RESCHEDULE') {
      if (!input.newDeadline) throw validation('Cần newDeadline khi dời deadline');
      newDeadline = this.parseFutureDeadline(input.newDeadline);
    }
    this.setReasonTag(id, input.reasonTagId);
    if (newDeadline) {
      this.ctx.db.prepare('UPDATE tasks SET deadline=?, updated_at=? WHERE id=?').run(newDeadline, this.ctx.nowIso(), id);
      this.ctx.services.activity.log({
        type: 'TASK_RESCHEDULED', message: `Dời deadline Task ${r.title}`, taskId: id, goalId: r.goal_id,
        before: { deadline: r.deadline }, after: { deadline: newDeadline },
      });
      this.ctx.events.emit('task.deadline_changed', { taskId: id, before: r.deadline, after: newDeadline });
    }
    return this.get(id);
  }

  /** Đặt Missed Reason tag (dùng bởi review và module penalty). Phát task.reason_changed nếu đổi. */
  setReasonTag(id: string, tagId: string | null): void {
    const r = this.row(id, { includeDeleted: true });
    if (r.missed_reason_tag_id === tagId) return;
    this.ctx.db.prepare('UPDATE tasks SET missed_reason_tag_id=?, updated_at=? WHERE id=?').run(tagId, this.ctx.nowIso(), id);
    this.ctx.services.activity.log({
      type: 'TASK_REASON_CHANGED', message: `Lý do bỏ lỡ Task ${r.title}: ${tagId ? this.tagName(tagId) : '—'}`,
      taskId: id, goalId: r.goal_id, before: { reasonTagId: r.missed_reason_tag_id }, after: { reasonTagId: tagId },
    });
    this.ctx.events.emit('task.reason_changed', { taskId: id, before: r.missed_reason_tag_id, after: tagId });
  }

  // ---------------- helpers ----------------

  private assertFrom(r: TaskRow, allowed: TaskStatus[], action: string): void {
    if (!allowed.includes(r.status)) {
      throw rule(ErrorCode.TASK_INVALID_TRANSITION, `Không thể ${action} Task ở trạng thái ${r.status}`, { status: r.status, action });
    }
  }

  private setStatus(r: TaskRow, to: TaskStatus, reason: string | null): void {
    this.ctx.db.prepare('UPDATE tasks SET status=?, updated_at=? WHERE id=?').run(to, this.ctx.nowIso(), r.id);
    this.addHistory(r.id, r.status, to, reason);
    this.ctx.events.emit('task.status_changed', { taskId: r.id, from: r.status, to });
  }

  private addHistory(taskId: string, from: TaskStatus | null, to: TaskStatus, reason: string | null): void {
    this.ctx.db
      .prepare('INSERT INTO task_status_history (id, task_id, from_status, to_status, reason, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId(), taskId, from, to, reason, this.ctx.nowIso());
  }

  private setMilestones(taskId: string, ids: string[]): void {
    this.ctx.db.prepare('DELETE FROM task_milestones WHERE task_id = ?').run(taskId);
    const ins = this.ctx.db.prepare('INSERT INTO task_milestones (task_id, milestone_id) VALUES (?, ?)');
    for (const m of new Set(ids)) ins.run(taskId, m);
  }

  private parseFutureDeadline(input: string): string {
    const d = normalizeDeadline(input, this.ctx.tz());
    if (d <= this.ctx.nowIso()) throw validation('Deadline phải sau thời điểm hiện tại', { deadline: d });
    return d;
  }

  // Đọc bảng của module khác CHỈ để validate tham chiếu (ngoại lệ được ghi trong design doc).
  private ensureGoal(goalId: string): void {
    const g = this.ctx.db.prepare('SELECT 1 FROM goals WHERE id = ? AND deleted_at IS NULL').get(goalId);
    if (!g) throw validation('Goal không hợp lệ', { goalId });
  }

  private ensureMilestones(ids: string[], goalId: string | null): void {
    if (!ids.length) return;
    if (!goalId) throw rule(ErrorCode.CONFLICT, 'Task phải gắn Goal để gắn Milestone');
    for (const m of ids) {
      const row = this.ctx.db.prepare('SELECT goal_id FROM milestones WHERE id = ? AND deleted_at IS NULL').get(m) as { goal_id: string } | undefined;
      if (!row) throw validation('Milestone không hợp lệ', { milestoneId: m });
      if (row.goal_id !== goalId) throw rule(ErrorCode.CONFLICT, 'Milestone phải thuộc cùng Goal với Task', { milestoneId: m });
    }
  }

  private ensureTag(tagId: string): void {
    const t = this.ctx.db.prepare('SELECT 1 FROM missed_reason_tags WHERE id = ? AND deleted_at IS NULL').get(tagId);
    if (!t) throw validation('Lý do không hợp lệ', { reasonTagId: tagId });
  }

  private tagName(tagId: string): string {
    return (this.ctx.db.prepare('SELECT name FROM missed_reason_tags WHERE id = ?').get(tagId) as { name: string } | undefined)?.name ?? tagId;
  }
}

