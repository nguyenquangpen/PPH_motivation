import { DateTime } from 'luxon';
import { ErrorCode, type CalendarSyncState, type SessionDto, type SessionInput } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { notFound, rule, validation } from '../../core/errors.js';
import { newId } from '../../core/ids.js';

export type SessionRow = {
  id: string; task_id: string; start: string; end: string; source: 'HUB' | 'LINKED';
  created_at: string; updated_at: string; deleted_at: string | null;
};

const MAX_MINUTES = 1440;
const MIN = 60_000;

/** ISO có offset → ISO UTC chuẩn hóa (để so sánh chuỗi an toàn). */
export const normIso = (iso: string): string => {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) throw validation('Thời điểm không hợp lệ', { value: iso });
  return dt.toUTC().toISO()!;
};

export const minutesBetween = (start: string, end: string): number =>
  Math.round((new Date(end).getTime() - new Date(start).getTime()) / MIN);

/**
 * F-21 Task Work Sessions. Mọi method ghi phải chạy trong transaction (routes đã bọc).
 * create/update/remove phát `session.changed` cùng transaction.
 */
export class SessionService {
  constructor(private ctx: AppContext) {}

  // ---------------- read ----------------

  private rowOf(id: string): SessionRow {
    const r = this.ctx.db.prepare('SELECT * FROM task_sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!r || r.deleted_at) throw notFound('Phiên', { id });
    return r;
  }

  toDto(r: SessionRow): SessionDto {
    const m = this.ctx.db.prepare('SELECT status FROM calendar_mappings WHERE session_id = ?').get(r.id) as { status: CalendarSyncState } | undefined;
    return {
      id: r.id, taskId: r.task_id, start: r.start, end: r.end, minutes: minutesBetween(r.start, r.end),
      source: r.source, calendar: m?.status ?? 'NONE',
    };
  }

  get(id: string): SessionDto {
    return this.toDto(this.rowOf(id));
  }

  rowsByTask(taskId: string): SessionRow[] {
    return this.ctx.db
      .prepare('SELECT * FROM task_sessions WHERE task_id = ? AND deleted_at IS NULL ORDER BY start, rowid')
      .all(taskId) as SessionRow[];
  }

  listByTask(taskId: string): SessionDto[] {
    return this.rowsByTask(taskId).map((r) => this.toDto(r));
  }

  totalMinutes(taskId: string): number {
    return this.rowsByTask(taskId).reduce((s, r) => s + minutesBetween(r.start, r.end), 0);
  }

  // ---------------- write (Hub) ----------------

  create(taskId: string, input: SessionInput): SessionDto {
    return this.insert(taskId, input, 'HUB', true);
  }

  update(id: string, input: SessionInput): SessionDto {
    const r = this.rowOf(id);
    const task = this.ensureEditable(r.task_id);
    const { start, end } = this.validate(r.task_id, input, id);
    this.ctx.db.prepare('UPDATE task_sessions SET start = ?, end = ?, updated_at = ? WHERE id = ?').run(start, end, this.ctx.nowIso(), id);
    this.ctx.services.activity.log({
      type: 'SESSION_UPDATED', message: `Sửa phiên của Task ${task.title}: ${this.fmt(r.start, r.end)} → ${this.fmt(start, end)}`,
      taskId: r.task_id, goalId: task.goal_id, before: { start: r.start, end: r.end }, after: { start, end },
    });
    this.ctx.events.emit('session.changed', { sessionId: id, taskId: r.task_id, op: 'UPDATE' });
    return this.get(id);
  }

  remove(id: string): { deleted: true } {
    const r = this.rowOf(id);
    const task = this.ensureEditable(r.task_id);
    this.ctx.db.prepare('UPDATE task_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(this.ctx.nowIso(), this.ctx.nowIso(), id);
    this.ctx.services.activity.log({
      type: 'SESSION_DELETED', message: `Xóa phiên của Task ${task.title}: ${this.fmt(r.start, r.end)}`,
      taskId: r.task_id, goalId: task.goal_id, before: { start: r.start, end: r.end },
    });
    this.ctx.events.emit('session.changed', { sessionId: id, taskId: r.task_id, op: 'DELETE' });
    return { deleted: true };
  }

  // ---------------- write (Calendar module) ----------------

  /** F-24 rule 2 — Google thắng: không validate, không phát session.changed. */
  applyExternalTime(sessionId: string, start: string, end: string): SessionDto {
    const r = this.rowOf(sessionId);
    const s = normIso(start);
    const e = normIso(end);
    if (s === r.start && e === r.end) return this.toDto(r);
    this.ctx.db.prepare('UPDATE task_sessions SET start = ?, end = ?, updated_at = ? WHERE id = ?').run(s, e, this.ctx.nowIso(), sessionId);
    const task = this.ctx.services.tasks.row(r.task_id, { includeDeleted: true });
    this.ctx.services.activity.log({
      type: 'SESSION_UPDATED', message: `Giờ cập nhật từ Google Calendar: ${this.fmt(r.start, r.end)} → ${this.fmt(s, e)}`,
      taskId: r.task_id, goalId: task.goal_id, before: { start: r.start, end: r.end }, after: { start: s, end: e },
    });
    return this.get(sessionId);
  }

  /** F-24 rule 4 — gỡ phiên (soft delete) KHÔNG phát session.changed. */
  detach(sessionId: string): void {
    const r = this.rowOf(sessionId);
    this.ctx.db.prepare('UPDATE task_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(this.ctx.nowIso(), this.ctx.nowIso(), sessionId);
    const task = this.ctx.services.tasks.row(r.task_id, { includeDeleted: true });
    this.ctx.services.activity.log({
      type: 'SESSION_DETACHED', message: `Phiên ${this.fmt(r.start, r.end)} của Task ${task.title} bị gỡ do Event đã bị xóa trên Google Calendar`,
      taskId: r.task_id, goalId: task.goal_id, before: { start: r.start, end: r.end },
    });
  }

  /** F-34 — phiên liên kết với Event có sẵn (source LINKED). Validate như phiên Hub; KHÔNG phát session.changed (calendar tự tạo mapping). */
  createLinked(taskId: string, start: string, end: string): SessionDto {
    return this.insert(taskId, { start, end }, 'LINKED', false);
  }

  // ---------------- helpers ----------------

  private insert(taskId: string, input: SessionInput, source: 'HUB' | 'LINKED', emit: boolean): SessionDto {
    const task = this.ensureEditable(taskId);
    const { start, end } = this.validate(taskId, input);
    const id = newId();
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare('INSERT INTO task_sessions (id, task_id, start, end, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, taskId, start, end, source, now, now);
    this.ctx.services.activity.log({
      type: 'SESSION_CREATED', message: `Thêm phiên cho Task ${task.title}: ${this.fmt(start, end)}`,
      taskId, goalId: task.goal_id, after: { start, end, source },
    });
    if (emit) this.ctx.events.emit('session.changed', { sessionId: id, taskId, op: 'CREATE' });
    return this.get(id);
  }

  private ensureEditable(taskId: string) {
    const t = this.ctx.services.tasks.row(taskId, { includeDeleted: true });
    if (t.deleted_at || t.status === 'COMPLETED' || t.status === 'CANCELLED') {
      throw rule(ErrorCode.TASK_LOCKED, 'Task đã hoàn thành/hủy/xóa — không thể thay đổi phiên', { taskId });
    }
    return t;
  }

  private validate(taskId: string, input: SessionInput, excludeId?: string): { start: string; end: string } {
    const start = normIso(input.start);
    const end = normIso(input.end);
    if (end <= start) throw validation('Giờ kết thúc phải sau giờ bắt đầu');
    if (minutesBetween(start, end) > MAX_MINUTES) throw validation('Phiên dài tối đa 1.440 phút');
    const clash = this.ctx.db
      .prepare('SELECT id FROM task_sessions WHERE task_id = ? AND deleted_at IS NULL AND id != ? AND start < ? AND end > ? LIMIT 1')
      .get(taskId, excludeId ?? '', end, start) as { id: string } | undefined;
    if (clash) throw rule(ErrorCode.CONFLICT, 'Phiên chồng với phiên khác của cùng Task', { sessionId: clash.id });
    return { start, end };
  }

  /** 'dd/MM HH:mm–HH:mm' theo múi giờ Owner. */
  private fmt(start: string, end: string): string {
    const tz = this.ctx.tz();
    const s = DateTime.fromISO(start).setZone(tz);
    const e = DateTime.fromISO(end).setZone(tz);
    return `${s.toFormat('dd/MM HH:mm')}–${e.hasSame(s, 'day') ? e.toFormat('HH:mm') : e.toFormat('dd/MM HH:mm')}`;
  }
}
