import {
  ErrorCode, type CategoryDto, type CreateGoalInput, type GoalDetailDto, type GoalDto, type GoalProgressDto, type GoalStatus,
  type GoalWarning, type UpdateGoalInput,
} from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound, rule, validation } from '../../core/errors.js';
import { newId } from '../../core/ids.js';
import { normName } from '../../core/seed.js';
import { diffDays, localDate } from '../../core/time.js';

export type GoalRow = {
  id: string; title: string; description: string | null; category_id: string; status: GoalStatus;
  start_date: string | null; target_date: string | null; target_contribution: number; goal_reward_xp: number | null;
  icon: string | null; color: string | null; completed_at: string | null; completed_contribution_snapshot: number | null;
  goal_reward_granted: number; created_at: string; updated_at: string; deleted_at: string | null;
};

type CategoryRow = { id: string; name: string; name_norm: string; color: string | null; created_at: string; deleted_at: string | null };

const STATUS_LABEL: Record<GoalStatus, string> = {
  NOT_STARTED: 'Not Started', ACTIVE: 'Active', PAUSED: 'Paused', COMPLETED: 'Completed', ARCHIVED: 'Archived',
};

/** progress % làm tròn xuống 0,1 (tính bằng số nguyên để tránh sai số dấu phẩy động). */
export const percentOf = (completed: number, target: number): number => Math.floor((completed * 1000) / target) / 10;

/** Định dạng phần trăm kiểu VN: 1 chữ số thập phân, dấu phẩy. */
export const fmtPercent = (p: number): string => p.toFixed(1).replace('.', ',');

/**
 * F-01 Goal & Category, F-02 Goal Progress, F-03 Goal Completion, F-04 Deadline Warnings.
 * Mọi method ghi phải được gọi trong transaction (routes đã bọc).
 */
export class GoalService {
  constructor(private ctx: AppContext) {}

  // ================= Category =================

  private categoryRow(id: string): CategoryRow {
    const r = this.ctx.db.prepare('SELECT * FROM goal_categories WHERE id = ? AND deleted_at IS NULL').get(id) as CategoryRow | undefined;
    if (!r) throw notFound('Category', { id });
    return r;
  }

  private categoryGoalCount(id: string): number {
    return (this.ctx.db.prepare('SELECT COUNT(*) c FROM goals WHERE category_id = ? AND deleted_at IS NULL').get(id) as { c: number }).c;
  }

  private categoryDto(r: CategoryRow): CategoryDto {
    return { id: r.id, name: r.name, color: r.color, goalCount: this.categoryGoalCount(r.id) };
  }

  listCategories(): CategoryDto[] {
    const rows = this.ctx.db.prepare('SELECT * FROM goal_categories WHERE deleted_at IS NULL ORDER BY created_at, rowid').all() as CategoryRow[];
    return rows.map((r) => this.categoryDto(r));
  }

  private assertUniqueName(name: string, exceptId?: string): string {
    const norm = normName(name);
    const dup = this.ctx.db
      .prepare('SELECT id FROM goal_categories WHERE name_norm = ? AND deleted_at IS NULL AND id <> ?')
      .get(norm, exceptId ?? '') as { id: string } | undefined;
    if (dup) throw conflict(ErrorCode.DUPLICATE_NAME, `Category '${name.trim()}' đã tồn tại`, { name: name.trim(), existingId: dup.id });
    return norm;
  }

  createCategory(input: { name: string; color?: string | null }): CategoryDto {
    const name = input.name.trim();
    const norm = this.assertUniqueName(name);
    const id = newId();
    this.ctx.db
      .prepare('INSERT INTO goal_categories (id, name, name_norm, color, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, norm, input.color ?? null, this.ctx.nowIso());
    this.ctx.services.activity.log({ type: 'CATEGORY_CREATED', message: `Tạo Category ${name}`, after: { id, name } });
    return this.categoryDto(this.categoryRow(id));
  }

  updateCategory(id: string, input: { name?: string; color?: string | null }): CategoryDto {
    const r = this.categoryRow(id);
    const name = input.name !== undefined ? input.name.trim() : r.name;
    const norm = input.name !== undefined ? this.assertUniqueName(name, id) : r.name_norm;
    const color = input.color !== undefined ? input.color ?? null : r.color;
    this.ctx.db.prepare('UPDATE goal_categories SET name = ?, name_norm = ?, color = ? WHERE id = ?').run(name, norm, color, id);
    this.ctx.services.activity.log({
      type: 'CATEGORY_UPDATED', message: `Cập nhật Category ${name}`, before: { name: r.name, color: r.color }, after: { name, color },
    });
    return this.categoryDto(this.categoryRow(id));
  }

  deleteCategory(id: string): { deleted: true } {
    const r = this.categoryRow(id);
    const goalCount = this.categoryGoalCount(id);
    if (goalCount > 0) {
      throw conflict(ErrorCode.IN_USE, `Category '${r.name}' đang được ${goalCount} Goal sử dụng`, { goalCount });
    }
    this.ctx.db.prepare('UPDATE goal_categories SET deleted_at = ? WHERE id = ?').run(this.ctx.nowIso(), id);
    this.ctx.services.activity.log({ type: 'CATEGORY_DELETED', message: `Xóa Category ${r.name}`, before: { id, name: r.name } });
    return { deleted: true };
  }

  // ================= Goal read =================

  row(id: string, opts: { includeDeleted?: boolean } = {}): GoalRow {
    const r = this.ctx.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
    if (!r || (r.deleted_at && !opts.includeDeleted)) throw notFound('Goal', { id });
    return r;
  }

  private toDto(r: GoalRow): GoalDto {
    const cat = this.ctx.db.prepare('SELECT name FROM goal_categories WHERE id = ?').get(r.category_id) as { name: string } | undefined;
    return {
      id: r.id, title: r.title, description: r.description, categoryId: r.category_id, categoryName: cat?.name ?? '',
      status: r.status, startDate: r.start_date, targetDate: r.target_date, targetContribution: r.target_contribution,
      goalRewardXp: r.goal_reward_xp, icon: r.icon, color: r.color, completedAt: r.completed_at,
      completedContributionSnapshot: r.completed_contribution_snapshot, goalRewardGranted: r.goal_reward_granted === 1,
      progress: this.progressOf(r), createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  list(filters: { status?: GoalStatus[] } = {}): GoalDto[] {
    const where = ['deleted_at IS NULL'];
    const args: unknown[] = [];
    if (filters.status?.length) {
      where.push(`status IN (${filters.status.map(() => '?').join(',')})`);
      args.push(...filters.status);
    }
    const rows = this.ctx.db.prepare(`SELECT * FROM goals WHERE ${where.join(' AND ')} ORDER BY created_at, rowid`).all(...args) as GoalRow[];
    return rows.map((r) => this.toDto(r));
  }

  get(id: string): GoalDto {
    return this.toDto(this.row(id));
  }

  detail(id: string): GoalDetailDto {
    const g = this.get(id);
    const milestones = this.ctx.services.milestones.listByGoal(id);
    const tasksByStatus: GoalDetailDto['tasksByStatus'] = {};
    for (const t of this.ctx.services.tasks.list({ goalId: id })) {
      (tasksByStatus[t.status] ??= []).push({ id: t.id, title: t.title, contribution: t.contribution });
    }
    const activity = this.ctx.services.activity
      .list({ goalId: id })
      .items.filter((a) => a.goalId === id)
      .map((a) => ({ id: a.id, type: a.type, message: a.message, createdAt: a.createdAt }));
    return { ...g, milestones, tasksByStatus, activity };
  }

  progress(goalId: string): GoalProgressDto {
    return this.progressOf(this.row(goalId, { includeDeleted: true }));
  }

  private progressOf(r: GoalRow): GoalProgressDto {
    const completed = this.ctx.services.ledger.goalContribution(r.id);
    const target = r.target_contribution;
    const progressPercent = percentOf(completed, target);
    const s = this.ctx.services.settings.get();
    const today = localDate(this.ctx.nowIso(), this.ctx.tz());
    const daysRemaining = r.target_date ? diffDays(today, r.target_date) : null;
    let rawExpected: number | null = null;
    if (r.start_date && r.target_date) {
      const span = diffDays(r.start_date, r.target_date);
      rawExpected = span <= 0 ? 100 : Math.min(Math.max((diffDays(r.start_date, today) / span) * 100, 0), 100);
    }
    const expectedPercent = rawExpected === null ? null : Math.round(rawExpected * 10) / 10;
    const warnings: GoalWarning[] = [];
    if (r.status === 'ACTIVE' && !r.deleted_at && rawExpected !== null && daysRemaining !== null) {
      // biên: progress = Expected − margin → không cảnh báo (epsilon chống sai số dấu phẩy động)
      if (progressPercent < rawExpected - s.behindMargin - 1e-9) warnings.push('BEHIND');
      if (daysRemaining >= 0 && daysRemaining <= s.nearDueDays) warnings.push('NEAR_DUE');
    }
    return {
      completedContribution: completed, targetContribution: target, progressPercent,
      displayPercent: Math.min(progressPercent, 100), overflowContribution: Math.max(completed - target, 0),
      remainingContribution: Math.max(target - completed, 0), expectedPercent, daysRemaining, warnings,
    };
  }

  /** Goal (chưa xóa) có đang Completed không — dùng bởi shop (điều kiện mở khóa). */
  isCompleted(goalId: string): boolean {
    const r = this.ctx.db.prepare('SELECT status FROM goals WHERE id = ? AND deleted_at IS NULL').get(goalId) as { status: string } | undefined;
    return r?.status === 'COMPLETED';
  }

  /** Goal (chưa xóa) có đang Paused không — dùng bởi penalty. */
  isPaused(goalId: string): boolean {
    const r = this.ctx.db.prepare('SELECT status FROM goals WHERE id = ? AND deleted_at IS NULL').get(goalId) as { status: string } | undefined;
    return r?.status === 'PAUSED';
  }

  // ================= Goal write =================

  private assertDates(start: string | null, target: string | null): void {
    if (start && target && target < start) {
      throw validation('target_date phải ≥ start_date', { startDate: start, targetDate: target });
    }
  }

  private assertCategory(categoryId: string): void {
    const c = this.ctx.db.prepare('SELECT 1 FROM goal_categories WHERE id = ? AND deleted_at IS NULL').get(categoryId);
    if (!c) throw validation('Category không hợp lệ', { categoryId });
  }

  create(input: CreateGoalInput): GoalDto {
    this.assertCategory(input.categoryId);
    this.assertDates(input.startDate ?? null, input.targetDate ?? null);
    const id = newId();
    const now = this.ctx.nowIso();
    const title = input.title.trim();
    this.ctx.db
      .prepare(
        `INSERT INTO goals (id, title, description, category_id, status, start_date, target_date, target_contribution, goal_reward_xp, icon, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'NOT_STARTED', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, title, input.description ?? null, input.categoryId, input.startDate ?? null, input.targetDate ?? null,
        input.targetContribution, input.goalRewardXp ?? null, input.icon ?? null, input.color ?? null, now, now);
    this.ctx.services.activity.log({ type: 'GOAL_CREATED', message: `Tạo Goal ${title}`, goalId: id });
    return this.get(id);
  }

  update(id: string, input: UpdateGoalInput): GoalDto {
    const r = this.row(id);
    if (input.status === 'COMPLETED' && r.status !== 'COMPLETED') {
      throw rule(ErrorCode.GOAL_COMPLETE_VIA_ENDPOINT, "Không thể đặt Completed trực tiếp — hãy dùng chức năng 'Đánh dấu hoàn thành'");
    }
    if (input.categoryId !== undefined && input.categoryId !== r.category_id) this.assertCategory(input.categoryId);
    const next = {
      title: input.title !== undefined ? input.title.trim() : r.title,
      description: input.description !== undefined ? input.description ?? null : r.description,
      category_id: input.categoryId ?? r.category_id,
      start_date: input.startDate !== undefined ? input.startDate ?? null : r.start_date,
      target_date: input.targetDate !== undefined ? input.targetDate ?? null : r.target_date,
      target_contribution: input.targetContribution ?? r.target_contribution,
      goal_reward_xp: input.goalRewardXp !== undefined ? input.goalRewardXp ?? null : r.goal_reward_xp,
      icon: input.icon !== undefined ? input.icon ?? null : r.icon,
      color: input.color !== undefined ? input.color ?? null : r.color,
      status: input.status ?? r.status,
    };
    this.assertDates(next.start_date, next.target_date);
    const now = this.ctx.nowIso();
    const statusChanged = next.status !== r.status;
    const reopened = statusChanged && r.status === 'COMPLETED';
    this.ctx.db
      .prepare(
        `UPDATE goals SET title=?, description=?, category_id=?, start_date=?, target_date=?, target_contribution=?, goal_reward_xp=?,
           icon=?, color=?, status=?, completed_at=?, completed_contribution_snapshot=?, updated_at=? WHERE id=?`,
      )
      .run(next.title, next.description, next.category_id, next.start_date, next.target_date, next.target_contribution,
        next.goal_reward_xp, next.icon, next.color, next.status,
        reopened ? null : r.completed_at, reopened ? null : r.completed_contribution_snapshot, now, id);

    const otherChanged = (['title', 'description', 'category_id', 'start_date', 'target_date', 'goal_reward_xp', 'icon', 'color'] as const)
      .some((k) => next[k] !== r[k]);
    if (otherChanged) {
      this.ctx.services.activity.log({
        type: 'GOAL_UPDATED', message: `Cập nhật Goal ${next.title}`, goalId: id,
        before: { title: r.title, categoryId: r.category_id, startDate: r.start_date, targetDate: r.target_date, goalRewardXp: r.goal_reward_xp },
        after: { title: next.title, categoryId: next.category_id, startDate: next.start_date, targetDate: next.target_date, goalRewardXp: next.goal_reward_xp },
      });
    }
    if (next.target_contribution !== r.target_contribution) {
      const completed = this.ctx.services.ledger.goalContribution(id);
      const before = percentOf(completed, r.target_contribution);
      const after = percentOf(completed, next.target_contribution);
      this.ctx.services.activity.log({
        type: 'GOAL_TARGET_CHANGED', goalId: id,
        message: `Target ${r.target_contribution} → ${next.target_contribution}, Progress ${fmtPercent(before)}% → ${fmtPercent(after)}%`,
        before: { targetContribution: r.target_contribution, progressPercent: before },
        after: { targetContribution: next.target_contribution, progressPercent: after },
      });
      this.ctx.events.emit('goal.target_changed', { goalId: id, before: r.target_contribution, after: next.target_contribution });
      if (before < 100 && after >= 100) this.suggestCompletion(id);
    }
    if (statusChanged) {
      this.ctx.services.activity.log({
        type: 'GOAL_STATUS_CHANGED', goalId: id,
        message: `Goal ${next.title}: ${STATUS_LABEL[r.status]} → ${STATUS_LABEL[next.status]}`,
        before: { status: r.status }, after: { status: next.status },
      });
      this.ctx.events.emit('goal.status_changed', { goalId: id, from: r.status, to: next.status });
    }
    return this.get(id);
  }

  /** Soft delete: Task, liên kết và ledger giữ nguyên. */
  delete(id: string): { deleted: true } {
    const r = this.row(id);
    const now = this.ctx.nowIso();
    this.ctx.db.prepare('UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.ctx.services.notifications.hideForObject('GOAL', id);
    this.ctx.services.activity.log({ type: 'GOAL_DELETED', message: `Xóa Goal ${r.title}`, goalId: id });
    return { deleted: true };
  }

  /** F-03: xác nhận hoàn thành. GOAL_REWARD trao tối đa 1 lần trong vòng đời Goal. */
  complete(id: string, opts: { confirmBelow100?: boolean } = {}): GoalDto {
    const r = this.row(id);
    if (r.status === 'COMPLETED') throw conflict(ErrorCode.CONFLICT, 'Goal đã hoàn thành', { status: r.status });
    const completed = this.ctx.services.ledger.goalContribution(id);
    const pct = percentOf(completed, r.target_contribution);
    if (pct < 100 && !opts.confirmBelow100) {
      throw rule(ErrorCode.CONFIRM_REQUIRED, `Goal mới đạt ${fmtPercent(pct)}% — cần xác nhận lần hai để hoàn thành`, { progressPercent: pct });
    }
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare("UPDATE goals SET status='COMPLETED', completed_at=?, completed_contribution_snapshot=?, updated_at=? WHERE id=?")
      .run(now, completed, now, id);
    if (r.goal_reward_granted !== 1) {
      const amount = r.goal_reward_xp ?? this.ctx.services.settings.get().defaultGoalXp;
      this.ctx.services.ledger.addXp({ type: 'GOAL_REWARD', amount, sourceType: 'GOAL', sourceId: id, reason: `Hoàn thành Goal ${r.title}` });
      this.ctx.db.prepare('UPDATE goals SET goal_reward_granted = 1 WHERE id = ?').run(id);
    }
    this.ctx.services.notifications.hideForObject('GOAL', id, ['GOAL_REACHED_100', 'GOAL_BEHIND', 'GOAL_NEAR_DUE']);
    this.ctx.services.activity.log({
      type: 'GOAL_COMPLETED', goalId: id, message: `Hoàn thành Goal ${r.title}`,
      before: { status: r.status }, after: { status: 'COMPLETED', completedContribution: completed },
    });
    this.ctx.events.emit('goal.status_changed', { goalId: id, from: r.status, to: 'COMPLETED' });
    return this.get(id);
  }

  // ================= event handlers / jobs =================

  /** goal.contribution_changed: Activity tiến độ + gợi ý hoàn thành khi vượt 100%. */
  onContributionChanged(p: { goalId: string; before: number; after: number }): void {
    const r = this.ctx.db.prepare('SELECT * FROM goals WHERE id = ?').get(p.goalId) as GoalRow | undefined;
    if (!r) return;
    const before = percentOf(p.before, r.target_contribution);
    const after = percentOf(p.after, r.target_contribution);
    this.ctx.services.activity.log({
      type: 'GOAL_PROGRESS', goalId: r.id, message: `Goal ${r.title}: ${fmtPercent(before)}% → ${fmtPercent(after)}%`,
      before: { completedContribution: p.before, progressPercent: before },
      after: { completedContribution: p.after, progressPercent: after },
    });
    if (before < 100 && after >= 100 && !r.deleted_at) this.suggestCompletion(r.id);
  }

  private suggestCompletion(goalId: string): void {
    const r = this.row(goalId);
    if (r.status === 'COMPLETED') return;
    this.ctx.services.notifications.notify({
      type: 'GOAL_REACHED_100', objectType: 'GOAL', objectId: r.id, dedupeKey: `GOAL_REACHED_100:${r.id}`,
      title: `Goal ${r.title} đã đạt mục tiêu — đánh dấu hoàn thành?`,
    });
  }

  /** F-04: tạo GOAL_BEHIND / GOAL_NEAR_DUE tối đa 1 lần / Goal / ngày / loại. Idempotent. */
  evaluateWarnings(): number {
    const today = localDate(this.ctx.nowIso(), this.ctx.tz());
    const rows = this.ctx.db
      .prepare("SELECT * FROM goals WHERE status = 'ACTIVE' AND deleted_at IS NULL AND start_date IS NOT NULL AND target_date IS NOT NULL")
      .all() as GoalRow[];
    let created = 0;
    for (const r of rows) {
      const p = this.progressOf(r);
      for (const w of p.warnings) {
        const type = w === 'BEHIND' ? 'GOAL_BEHIND' : 'GOAL_NEAR_DUE';
        const dedupeKey = `${type}:${r.id}:${today}`;
        if (this.ctx.services.notifications.existsEver(dedupeKey)) continue;
        const title = w === 'BEHIND'
          ? `Goal ${r.title} đang chậm tiến độ (${fmtPercent(p.progressPercent)}% / kỳ vọng ${fmtPercent(p.expectedPercent ?? 0)}%)`
          : `Goal ${r.title} còn ${p.daysRemaining} ngày đến hạn`;
        if (this.ctx.services.notifications.notify({ type, objectType: 'GOAL', objectId: r.id, dedupeKey, title })) created++;
      }
    }
    return created;
  }
}
