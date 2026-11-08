import { DateTime } from 'luxon';
import {
  ErrorCode, Weekday, WorkingHoursSchema, type ScheduleWarningsDto, type SessionDto, type SuggestionOptionDto,
  type SuggestionsDto, type TaskWarningDto, type DayWarningDto, type WorkingHours,
} from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound, rule, validation } from '../../core/errors.js';
import { addDays, localDate } from '../../core/time.js';
import type { TaskRow } from '../tasks/service.js';
import { normIso } from '../sessions/service.js';

/** Khoảng [s, e) theo ms epoch. */
type Iv = { s: number; e: number };

const MIN = 60_000;
const STEP = 15 * MIN;
const OPEN_SQL = "t.status IN ('TODO','IN_PROGRESS') AND t.deleted_at IS NULL";
const OPEN_STATUSES = ['TODO', 'IN_PROGRESS'];
const MSG_DONE = 'Task đã đủ thời gian';
const MSG_NO_DATA = 'Chưa có dữ liệu lịch Google';
const WARNING_DAYS = 14;

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (isoStr: string): number => new Date(isoStr).getTime();
const len = (ivs: Iv[]): number => ivs.reduce((a, i) => a + (i.e - i.s), 0);

/** Gộp các khoảng chồng/chạm nhau. */
const merge = (ivs: Iv[]): Iv[] => {
  const sorted = ivs.filter((i) => i.e > i.s).sort((a, b) => a.s - b.s);
  const out: Iv[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.s <= last.e) last.e = Math.max(last.e, i.e);
    else out.push({ ...i });
  }
  return out;
};

/** a − b */
const subtract = (a: Iv[], b: Iv[]): Iv[] => {
  const blockers = merge(b);
  const out: Iv[] = [];
  for (const iv of merge(a)) {
    let cur = iv.s;
    for (const x of blockers) {
      if (x.e <= cur || x.s >= iv.e) continue;
      if (x.s > cur) out.push({ s: cur, e: x.s });
      cur = Math.max(cur, x.e);
      if (cur >= iv.e) break;
    }
    if (cur < iv.e) out.push({ s: cur, e: iv.e });
  }
  return out;
};

const intersect = (a: Iv[], b: Iv[]): Iv[] => {
  const out: Iv[] = [];
  for (const x of merge(a)) for (const y of merge(b)) {
    const s = Math.max(x.s, y.s);
    const e = Math.min(x.e, y.e);
    if (e > s) out.push({ s, e });
  }
  return out;
};

const clip = (ivs: Iv[], s: number, e: number): Iv[] => intersect(ivs, [{ s, e }]);

/**
 * F-26 Working Hours, F-27 Suggestions, F-28 Warnings, F-29 isInfeasible.
 * Mọi tính toán theo múi giờ Owner (ctx.tz()); giờ bận lấy từ ctx.services.calendar.busy().
 */
export class SchedulingService {
  constructor(private ctx: AppContext) {}

  // ---------------- F-26 ----------------

  workingHours(): WorkingHours {
    return this.ctx.services.settings.get().workingHours;
  }

  setWorkingHours(input: unknown): WorkingHours {
    const parsed = WorkingHoursSchema.safeParse(input);
    if (!parsed.success) throw validation('Giờ làm việc không hợp lệ', { issues: parsed.error.issues });
    const wh = parsed.data;
    for (const day of Weekday) {
      const wins = [...wh[day]].sort((a, b) => toMin(a.start) - toMin(b.start));
      for (const [i, w] of wins.entries()) {
        if (toMin(w.start) >= toMin(w.end)) throw validation(`Khung ${w.start}–${w.end} không hợp lệ (bắt đầu phải trước kết thúc)`, { day });
        const prev = wins[i - 1];
        if (prev && toMin(w.start) < toMin(prev.end)) throw validation(`Các khung giờ ${day} chồng nhau`, { day });
      }
      wh[day] = wins;
    }
    return this.ctx.services.settings.update({ workingHours: wh }).workingHours;
  }

  /** Khoảng giờ làm việc giao với [from, to). */
  private workIntervals(from: number, to: number): Iv[] {
    const tz = this.ctx.tz();
    const wh = this.workingHours();
    const out: Iv[] = [];
    let day = DateTime.fromMillis(from, { zone: tz }).startOf('day');
    while (day.toMillis() < to) {
      const key = Weekday[day.weekday - 1]!;
      for (const w of wh[key]) out.push({ s: day.plus({ minutes: toMin(w.start) }).toMillis(), e: day.plus({ minutes: toMin(w.end) }).toMillis() });
      day = day.plus({ days: 1 });
    }
    return clip(out, from, to);
  }

  private busy(from: number, to: number): Iv[] {
    return merge(this.ctx.services.calendar.busy(iso(from), iso(to)).map((b) => ({ s: ms(b.start), e: ms(b.end) })));
  }

  /** Phiên (chưa xóa) giao với [from, to) của mọi Task chưa xong (+ Task `extraTaskId` bất kể trạng thái). */
  private sessionsIn(from: number, to: number, extraTaskId?: string): Iv[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT s.start, s.end FROM task_sessions s JOIN tasks t ON t.id = s.task_id
         WHERE s.deleted_at IS NULL AND s.start < ? AND s.end > ? AND ((${OPEN_SQL}) OR t.id = ?)`,
      )
      .all(iso(to), iso(from), extraTaskId ?? '') as { start: string; end: string }[];
    return rows.map((r) => ({ s: ms(r.start), e: ms(r.end) }));
  }

  // ---------------- F-27 ----------------

  private freeIntervals(from: number, to: number): Iv[] {
    if (to <= from) return [];
    const free = subtract(this.workIntervals(from, to), [...this.busy(from, to), ...this.sessionsIn(from, to)]);
    // điểm bắt đầu canh lưới 15 phút
    return free
      .map((i) => ({ s: Math.ceil(i.s / STEP) * STEP, e: i.e }))
      .filter((i) => i.e > i.s);
  }

  private openTask(taskId: string): TaskRow {
    const t = this.ctx.services.tasks.row(taskId, { includeDeleted: true });
    if (t.deleted_at || !OPEN_STATUSES.includes(t.status)) {
      throw rule(ErrorCode.TASK_LOCKED, 'Task đã hoàn thành/hủy/xóa — không có gợi ý lịch', { taskId });
    }
    return t;
  }

  suggestions(taskId: string): SuggestionsDto {
    const t = this.openTask(taskId);
    const nowMs = ms(this.ctx.nowIso());
    const from = Math.ceil(nowMs / STEP) * STEP;
    const to = t.deadline ? ms(t.deadline) : nowMs + 7 * 24 * 60 * MIN;
    const remaining = t.estimated_duration - this.ctx.services.sessions.totalMinutes(taskId);
    const calendarDataAvailable = this.ctx.services.calendar.hasBusyData();
    const base = { taskId, remainingMinutes: Math.max(remaining, 0), windowEnd: iso(to), calendarDataAvailable };
    if (remaining <= 0) return { ...base, options: [], message: MSG_DONE };

    const need = remaining * MIN;
    const free = this.freeIntervals(from, to);
    const options: SuggestionOptionDto[] = [];
    const used = new Set<number>();
    for (const [i, f] of free.entries()) {
      if (options.length >= 3) break;
      if (f.e - f.s >= need) {
        used.add(i);
        options.push({
          index: options.length + 1, kind: 'CONTIGUOUS', sessions: [{ start: iso(f.s), end: iso(f.s + need) }],
          totalMinutes: remaining, complete: true,
        });
      }
    }
    let message: string | null = null;
    const totalFree = len(free);
    if (options.length < 3) {
      const pieces: { start: string; end: string }[] = [];
      let left = need;
      for (const [i, f] of free.entries()) {
        if (left <= 0) break;
        if (used.has(i)) continue;
        const take = Math.min(f.e - f.s, left);
        if (take < 30 * MIN && take < left) continue; // phiên chia ≥ 30 phút, trừ phiên cuối
        pieces.push({ start: iso(f.s), end: iso(f.s + take) });
        left -= take;
      }
      const complete = left <= 0;
      if (totalFree < need) {
        message = `Không đủ thời gian trống trước Deadline: thiếu ${Math.round((need - totalFree) / MIN)} phút`;
      }
      if (pieces.length && (complete || totalFree < need)) {
        options.push({
          index: options.length + 1, kind: 'SPLIT', sessions: pieces,
          totalMinutes: Math.round((need - Math.max(left, 0)) / MIN), complete,
        });
      }
    }
    if (!message && !calendarDataAvailable) message = MSG_NO_DATA;
    return { ...base, options, message };
  }

  /** Chọn phương án: tạo mọi phiên trong 1 transaction (caller bọc); khung đã bị chiếm → 409. */
  applySuggestion(taskId: string, sessions: { start: string; end: string }[]): SessionDto[] {
    this.openTask(taskId);
    const wanted = sessions.map((x) => ({ s: ms(normIso(x.start)), e: ms(normIso(x.end)) }));
    const from = Math.min(...wanted.map((w) => w.s));
    const to = Math.max(...wanted.map((w) => w.e));
    const taken = [...this.busy(from, to), ...this.sessionsIn(from, to)];
    const clash = wanted.some((w, i) =>
      taken.some((x) => x.s < w.e && x.e > w.s) || wanted.some((o, j) => j !== i && o.s < w.e && o.e > w.s));
    if (clash) throw conflict(ErrorCode.CONFLICT, 'Khung giờ đã bị chiếm — hãy tải lại gợi ý');
    return sessions.map((x) => this.ctx.services.sessions.create(taskId, x));
  }

  // ---------------- F-28 ----------------

  private settingsThresholds() {
    const s = this.ctx.services.settings.get();
    return { minMin: s.insufficientMinMinutes, minPct: s.insufficientMinPercent, overloadPct: s.overloadPercent, presetMajor: s.presetMajor };
  }

  /** Thiếu thời gian (rule 1) — không xét trạng thái Task. */
  private insufficient(t: TaskRow): { scheduled: number; missing: number; flagged: boolean; sessionCount: number } {
    const rows = this.ctx.services.sessions.rowsByTask(t.id);
    const scheduled = this.ctx.services.sessions.totalMinutes(t.id);
    const missing = t.estimated_duration - scheduled;
    const { minMin, minPct } = this.settingsThresholds();
    const flagged = rows.length > 0 && missing >= minMin && missing * 100 >= t.estimated_duration * minPct;
    return { scheduled, missing, flagged, sessionCount: rows.length };
  }

  private taskSignature(t: TaskRow): string {
    const ss = this.ctx.services.sessions.rowsByTask(t.id).map((r) => `${r.start}/${r.end}`);
    return `${t.estimated_duration}|${ss.join(',')}`;
  }

  /** Thống kê 1 ngày lịch 'YYYY-MM-DD' (múi giờ Owner). */
  private dayStats(date: string, extraTaskId?: string): { capacity: number; load: number; sessionMinutes: number; overloaded: boolean } {
    const tz = this.ctx.tz();
    const d = DateTime.fromISO(date, { zone: tz }).startOf('day');
    const from = d.toMillis();
    const to = d.plus({ days: 1 }).toMillis();
    const work = this.workIntervals(from, to);
    const capacity = Math.round(len(work) / MIN);
    const busyIn = Math.round(len(intersect(this.busy(from, to), work)) / MIN);
    const sessionMinutes = Math.round(len(this.sessionsIn(from, to, extraTaskId).map((i) => ({ s: Math.max(i.s, from), e: Math.min(i.e, to) }))) / MIN);
    const load = busyIn + sessionMinutes;
    const { overloadPct } = this.settingsThresholds();
    const overloaded = capacity === 0 ? sessionMinutes > 0 : load * 100 > capacity * overloadPct;
    return { capacity, load, sessionMinutes, overloaded };
  }

  private daySignature(st: { capacity: number; load: number }): string {
    return `${st.load}|${st.capacity}`;
  }

  private accepted(kind: 'TASK' | 'DAY', ref: string, signature: string): boolean {
    const r = this.ctx.db.prepare('SELECT signature FROM schedule_acceptances WHERE kind = ? AND ref = ?').get(kind, ref) as { signature: string } | undefined;
    return !!r && r.signature === signature;
  }

  warnings(): ScheduleWarningsDto {
    const tasks: TaskWarningDto[] = [];
    const rows = this.ctx.db.prepare(`SELECT t.* FROM tasks t WHERE ${OPEN_SQL} ORDER BY t.created_at, t.rowid`).all() as TaskRow[];
    const nowIso = this.ctx.nowIso();
    const weekLater = iso(ms(nowIso) + 7 * 24 * 60 * MIN);
    const { presetMajor } = this.settingsThresholds();
    for (const t of rows) {
      const ins = this.insufficient(t);
      const common = {
        taskId: t.id, taskTitle: t.title, estimatedMinutes: t.estimated_duration, scheduledMinutes: ins.scheduled,
        missingMinutes: Math.max(ins.missing, 0),
      };
      if (ins.flagged) tasks.push({ kind: 'INSUFFICIENT', ...common, accepted: this.accepted('TASK', t.id, this.taskSignature(t)) });
      // Should: Task lớn chưa đủ giờ
      if (t.contribution >= presetMajor && t.deadline && t.deadline >= nowIso && t.deadline <= weekLater && ins.scheduled < t.estimated_duration) {
        tasks.push({ kind: 'BIG_TASK_UNDER_SCHEDULED', ...common, accepted: false });
      }
    }
    const days: DayWarningDto[] = [];
    const today = localDate(nowIso, this.ctx.tz());
    for (let i = 0; i < WARNING_DAYS; i++) {
      const date = addDays(today, i);
      const st = this.dayStats(date);
      if (!st.overloaded) continue;
      days.push({ date, capacityMinutes: st.capacity, loadMinutes: st.load, accepted: this.accepted('DAY', date, this.daySignature(st)) });
    }
    return { tasks, days };
  }

  accept(kind: 'TASK' | 'DAY', ref: string): ScheduleWarningsDto {
    let signature: string;
    if (kind === 'TASK') {
      const t = this.ctx.services.tasks.row(ref);
      signature = this.taskSignature(t);
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || !DateTime.fromISO(ref).isValid) throw validation('Ngày không hợp lệ', { ref });
      signature = this.daySignature(this.dayStats(ref));
    }
    this.ctx.db
      .prepare(
        `INSERT INTO schedule_acceptances (kind, ref, signature, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, ref) DO UPDATE SET signature = excluded.signature, created_at = excluded.created_at`,
      )
      .run(kind, ref, signature, this.ctx.nowIso());
    this.ctx.services.activity.log({
      type: 'SCHEDULE_ACCEPTED', message: kind === 'TASK' ? 'Chấp nhận lịch của Task' : `Chấp nhận lịch ngày ${ref}`,
      taskId: kind === 'TASK' ? ref : null,
    });
    return this.warnings();
  }

  // ---------------- F-29 ----------------

  /** F-29: Task có cảnh báo thiếu thời gian hoặc có phiên trong ngày quá tải (kể cả đã chấp nhận), bất kể trạng thái Task. */
  isInfeasible(taskId: string): boolean {
    const t = this.ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    if (!t) throw notFound('Task', { id: taskId });
    const sessions = this.ctx.services.sessions.rowsByTask(taskId);
    if (!sessions.length) return false;
    if (this.insufficient(t).flagged) return true;
    const tz = this.ctx.tz();
    const dates = new Set<string>();
    for (const s of sessions) {
      let d = localDate(s.start, tz);
      const last = localDate(iso(ms(s.end) - 1), tz);
      while (d <= last) { dates.add(d); d = addDays(d, 1); }
    }
    for (const d of dates) if (this.dayStats(d, taskId).overloaded) return true;
    return false;
  }
}
