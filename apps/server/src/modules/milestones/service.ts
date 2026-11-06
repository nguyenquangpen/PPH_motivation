import { type CreateMilestoneInput, type MilestoneCondition, type MilestoneDto, type MilestoneStatus } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { notFound, validation } from '../../core/errors.js';
import { newId } from '../../core/ids.js';

type MilestoneRow = {
  id: string; goal_id: string; title: string; description: string | null; target_date: string | null;
  condition_type: MilestoneCondition; threshold: number | null; reward_xp: number | null; status: MilestoneStatus;
  completed_at: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};

/**
 * F-12 Milestone.
 * - Điều kiện đánh giá lại sau thay đổi Contribution, trạng thái/liên kết Task, tạo/sửa Milestone.
 * - Chưa thỏa → thỏa: COMPLETED + MILESTONE_REWARD + Notification + Activity + milestone.completed.
 * - Thỏa → không thỏa chỉ xử lý khi do hoàn tác/xóa Task (allowReopen): PENDING + đảo MILESTONE_REWARD.
 * Liên kết Task↔Milestone (task_milestones) thuộc module tasks: chỉ đọc.
 */
export class MilestoneService {
  constructor(private ctx: AppContext) {}

  // ---------------- read ----------------

  private row(id: string): MilestoneRow {
    const r = this.ctx.db.prepare('SELECT * FROM milestones WHERE id = ? AND deleted_at IS NULL').get(id) as MilestoneRow | undefined;
    if (!r) throw notFound('Milestone', { id });
    return r;
  }

  /** Task liên kết chưa xóa. */
  private linkedTasks(milestoneId: string): { id: string; status: string }[] {
    return this.ctx.db
      .prepare(
        `SELECT t.id, t.status FROM task_milestones tm JOIN tasks t ON t.id = tm.task_id
         WHERE tm.milestone_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at, t.rowid`,
      )
      .all(milestoneId) as { id: string; status: string }[];
  }

  private toDto(r: MilestoneRow): MilestoneDto {
    return {
      id: r.id, goalId: r.goal_id, title: r.title, description: r.description, targetDate: r.target_date,
      conditionType: r.condition_type, threshold: r.threshold, rewardXp: r.reward_xp,
      effectiveRewardXp: r.reward_xp ?? this.ctx.services.settings.get().defaultMilestoneXp,
      status: r.status, completedAt: r.completed_at, linkedTaskIds: this.linkedTasks(r.id).map((t) => t.id),
    };
  }

  get(id: string): MilestoneDto {
    return this.toDto(this.row(id));
  }

  listByGoal(goalId: string): MilestoneDto[] {
    const rows = this.ctx.db
      .prepare('SELECT * FROM milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY created_at, rowid')
      .all(goalId) as MilestoneRow[];
    return rows.map((r) => this.toDto(r));
  }

  isCompleted(milestoneId: string): boolean {
    const r = this.ctx.db.prepare('SELECT status FROM milestones WHERE id = ? AND deleted_at IS NULL').get(milestoneId) as { status: string } | undefined;
    return r?.status === 'COMPLETED';
  }

  /** 5 milestone hoàn thành gần nhất — dùng bởi dashboard. */
  recentAchievements(limit = 5): { milestoneId: string; goalId: string; title: string; completedAt: string }[] {
    return (this.ctx.db
      .prepare("SELECT id, goal_id, title, completed_at FROM milestones WHERE status = 'COMPLETED' AND deleted_at IS NULL ORDER BY completed_at DESC, rowid DESC LIMIT ?")
      .all(limit) as { id: string; goal_id: string; title: string; completed_at: string }[]).map((r) => ({
      milestoneId: r.id, goalId: r.goal_id, title: r.title, completedAt: r.completed_at,
    }));
  }

  // ---------------- write ----------------

  private assertGoal(goalId: string): void {
    const g = this.ctx.db.prepare('SELECT 1 FROM goals WHERE id = ? AND deleted_at IS NULL').get(goalId);
    if (!g) throw notFound('Goal', { id: goalId });
  }

  private normalize(conditionType: MilestoneCondition, threshold: number | null | undefined): number | null {
    if (conditionType === 'CONTRIBUTION_THRESHOLD') {
      if (threshold === undefined || threshold === null) throw validation('Cần threshold ≥ 1 cho CONTRIBUTION_THRESHOLD', { threshold });
      return threshold;
    }
    return null;
  }

  create(goalId: string, input: CreateMilestoneInput): MilestoneDto {
    this.assertGoal(goalId);
    const threshold = this.normalize(input.conditionType, input.threshold);
    const id = newId();
    const now = this.ctx.nowIso();
    const title = input.title.trim();
    this.ctx.db
      .prepare(
        `INSERT INTO milestones (id, goal_id, title, description, target_date, condition_type, threshold, reward_xp, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      )
      .run(id, goalId, title, input.description ?? null, input.targetDate ?? null, input.conditionType, threshold,
        input.rewardXp ?? null, now, now);
    this.ctx.services.activity.log({ type: 'MILESTONE_CREATED', message: `Tạo Milestone ${title}`, goalId, milestoneId: id });
    this.evaluate(id, { allowReopen: false });
    return this.get(id);
  }

  update(id: string, input: Partial<CreateMilestoneInput>): MilestoneDto {
    const r = this.row(id);
    const conditionType = input.conditionType ?? r.condition_type;
    const threshold = this.normalize(conditionType, input.threshold !== undefined ? input.threshold : r.threshold);
    const next = {
      title: input.title !== undefined ? input.title.trim() : r.title,
      description: input.description !== undefined ? input.description ?? null : r.description,
      target_date: input.targetDate !== undefined ? input.targetDate ?? null : r.target_date,
      reward_xp: input.rewardXp !== undefined ? input.rewardXp ?? null : r.reward_xp,
    };
    this.ctx.db
      .prepare('UPDATE milestones SET title=?, description=?, target_date=?, condition_type=?, threshold=?, reward_xp=?, updated_at=? WHERE id=?')
      .run(next.title, next.description, next.target_date, conditionType, threshold, next.reward_xp, this.ctx.nowIso(), id);
    this.ctx.services.activity.log({
      type: 'MILESTONE_UPDATED', message: `Cập nhật Milestone ${next.title}`, goalId: r.goal_id, milestoneId: id,
      before: { title: r.title, conditionType: r.condition_type, threshold: r.threshold, rewardXp: r.reward_xp },
      after: { title: next.title, conditionType, threshold, rewardXp: next.reward_xp },
    });
    this.evaluate(id, { allowReopen: false });
    return this.get(id);
  }

  /** Soft delete. Thưởng đã trao giữ nguyên (giao dịch không bị xóa). */
  delete(id: string): { deleted: true } {
    const r = this.row(id);
    const now = this.ctx.nowIso();
    this.ctx.db.prepare('UPDATE milestones SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.ctx.services.notifications.hideForObject('MILESTONE', id);
    this.ctx.services.activity.log({ type: 'MILESTONE_DELETED', message: `Xóa Milestone ${r.title}`, goalId: r.goal_id, milestoneId: id });
    return { deleted: true };
  }

  // ---------------- evaluation ----------------

  private satisfied(r: MilestoneRow): boolean {
    if (r.condition_type === 'CONTRIBUTION_THRESHOLD') {
      return r.threshold !== null && this.ctx.services.ledger.goalContribution(r.goal_id) >= r.threshold;
    }
    const considered = this.linkedTasks(r.id).filter((t) => t.status !== 'CANCELLED');
    return considered.length > 0 && considered.every((t) => t.status === 'COMPLETED');
  }

  /** Đánh giá lại một Milestone. allowReopen = true chỉ khi nguyên nhân là hoàn tác/xóa Task. */
  evaluate(id: string, opts: { allowReopen: boolean }): void {
    const r = this.ctx.db.prepare('SELECT * FROM milestones WHERE id = ? AND deleted_at IS NULL').get(id) as MilestoneRow | undefined;
    if (!r) return;
    const goalAlive = this.ctx.db.prepare('SELECT 1 FROM goals WHERE id = ? AND deleted_at IS NULL').get(r.goal_id);
    if (!goalAlive) return;
    const ok = this.satisfied(r);
    if (ok && r.status === 'PENDING') this.markCompleted(r);
    else if (!ok && r.status === 'COMPLETED' && opts.allowReopen) this.reopen(r);
  }

  /** Đánh giá các Milestone của một Goal và các Milestone mà Task đang liên kết. */
  evaluateFor(p: { goalId?: string | null; taskId?: string | null }, opts: { allowReopen: boolean; onlyCondition?: MilestoneCondition }): void {
    const ids = new Set<string>();
    if (p.goalId) {
      for (const m of this.ctx.db.prepare('SELECT id FROM milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY rowid').all(p.goalId) as { id: string }[]) ids.add(m.id);
    }
    if (p.taskId) {
      for (const m of this.ctx.db.prepare('SELECT milestone_id id FROM task_milestones WHERE task_id = ?').all(p.taskId) as { id: string }[]) ids.add(m.id);
    }
    for (const id of ids) {
      if (opts.onlyCondition) {
        const c = this.ctx.db.prepare('SELECT condition_type FROM milestones WHERE id = ?').get(id) as { condition_type: string } | undefined;
        if (c?.condition_type !== opts.onlyCondition) continue;
      }
      this.evaluate(id, opts);
    }
  }

  /** Mọi Milestone LINKED_TASKS đang PENDING (liên kết đổi có thể làm Milestone ở Goal cũ thỏa). */
  evaluatePendingLinked(): void {
    const rows = this.ctx.db
      .prepare("SELECT id FROM milestones WHERE condition_type = 'LINKED_TASKS' AND status = 'PENDING' AND deleted_at IS NULL ORDER BY rowid")
      .all() as { id: string }[];
    for (const m of rows) this.evaluate(m.id, { allowReopen: false });
  }

  private markCompleted(r: MilestoneRow): void {
    const now = this.ctx.nowIso();
    this.ctx.db.prepare("UPDATE milestones SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=?").run(now, now, r.id);
    const ledger = this.ctx.services.ledger;
    // Bất biến: tối đa 1 MILESTONE_REWARD chưa bị đảo
    if (ledger.activeXpBySource('MILESTONE', r.id, 'MILESTONE_REWARD').length === 0) {
      const amount = r.reward_xp ?? this.ctx.services.settings.get().defaultMilestoneXp;
      ledger.addXp({ type: 'MILESTONE_REWARD', amount, sourceType: 'MILESTONE', sourceId: r.id, reason: `Đạt Milestone ${r.title}` });
    }
    this.ctx.services.notifications.notify({
      type: 'MILESTONE_COMPLETED', objectType: 'MILESTONE', objectId: r.id, dedupeKey: `MILESTONE_COMPLETED:${r.id}`,
      title: `Đạt Milestone ${r.title}`,
    });
    this.ctx.services.activity.log({
      type: 'MILESTONE_COMPLETED', message: `Đạt Milestone ${r.title}`, goalId: r.goal_id, milestoneId: r.id,
      before: { status: r.status }, after: { status: 'COMPLETED' },
    });
    this.ctx.events.emit('milestone.completed', { milestoneId: r.id, goalId: r.goal_id });
  }

  private reopen(r: MilestoneRow): void {
    const now = this.ctx.nowIso();
    this.ctx.db.prepare("UPDATE milestones SET status='PENDING', completed_at=NULL, updated_at=? WHERE id=?").run(now, r.id);
    const ledger = this.ctx.services.ledger;
    for (const tx of ledger.activeXpBySource('MILESTONE', r.id, 'MILESTONE_REWARD')) {
      ledger.reverseXp(tx.id, `Mở lại Milestone ${r.title}`);
    }
    this.ctx.services.notifications.hideForObject('MILESTONE', r.id, ['MILESTONE_COMPLETED']);
    this.ctx.services.activity.log({
      type: 'MILESTONE_REOPENED', message: `Mở lại Milestone ${r.title}`, goalId: r.goal_id, milestoneId: r.id,
      before: { status: 'COMPLETED' }, after: { status: 'PENDING' },
    });
    this.ctx.events.emit('milestone.reopened', { milestoneId: r.id, goalId: r.goal_id });
  }
}
