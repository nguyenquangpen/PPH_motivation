import { ErrorCode, type CheckinDto, type StreakDayState, type StreakDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { rule } from '../../core/errors.js';
import { addDays, localDate, monthOf } from '../../core/time.js';

const CALENDAR_DAYS = 84;

type CheckinRow = { date: string; mood: number | null; note: string | null; updated_at: string };

/**
 * F-13 Streak (+Freeze) và F-14 Check-in.
 * Streak luôn tính lại từ dữ liệu: task_completions còn hiệu lực (Task hiện COMPLETED, chưa xóa) + streak_freezes.
 */
export class StreakService {
  constructor(private ctx: AppContext) {}

  // ---------------- data ----------------

  private today(): string {
    return localDate(this.ctx.nowIso(), this.ctx.tz());
  }

  /** Các lần hoàn thành còn hiệu lực, bucket theo ngày lịch (timezone Owner). */
  private completions(): { date: string; goalId: string | null }[] {
    const tz = this.ctx.tz();
    const rows = this.ctx.db
      .prepare(
        `SELECT c.completed_at, t.goal_id FROM task_completions c JOIN tasks t ON t.id = c.task_id
         WHERE c.undone_at IS NULL AND t.status = 'COMPLETED' AND t.deleted_at IS NULL`,
      )
      .all() as { completed_at: string; goal_id: string | null }[];
    // Release 2: sự kiện app ngoài đã xử lý cũng là "hoạt động", tính theo occurred_at (F-32)
    const events = this.ctx.db
      .prepare("SELECT occurred_at, goal_id FROM integration_events WHERE status = 'PROCESSED' AND is_activity = 1")
      .all() as { occurred_at: string; goal_id: string | null }[];
    return [
      ...rows.map((r) => ({ date: localDate(r.completed_at, tz), goalId: r.goal_id })),
      ...events.map((r) => ({ date: localDate(r.occurred_at, tz), goalId: r.goal_id })),
    ];
  }

  /** Tập ngày active (Productivity). */
  activeDays(): Set<string> {
    return new Set(this.completions().map((c) => c.date));
  }

  freezeDays(): Set<string> {
    return new Set((this.ctx.db.prepare('SELECT date FROM streak_freezes').all() as { date: string }[]).map((r) => r.date));
  }

  /** Độ dài chuỗi kết thúc tại `day` (ngày freeze giữ chuỗi nhưng không cộng). */
  private chainAt(day: string, active: Set<string>, freezes: Set<string>): number {
    let n = 0;
    let d = day;
    while (active.has(d) || freezes.has(d)) {
      if (active.has(d)) n++;
      d = addDays(d, -1);
    }
    return n;
  }

  private current(active: Set<string>, freezes: Set<string>, today: string): number {
    return active.has(today) ? this.chainAt(today, active, freezes) : this.chainAt(addDays(today, -1), active, freezes);
  }

  freezesLeft(month: string = monthOf(this.today())): number {
    const used = (this.ctx.db.prepare('SELECT COUNT(*) c FROM streak_freezes WHERE month = ?').get(month) as { c: number }).c;
    return Math.max(this.ctx.services.settings.get().freezesPerMonth - used, 0);
  }

  // ---------------- read ----------------

  get(): StreakDto {
    const today = this.today();
    const comps = this.completions();
    const active = new Set(comps.map((c) => c.date));
    const freezes = this.freezeDays();

    let longest = 0;
    const all = [...active].sort();
    if (all.length) {
      let run = 0;
      for (let d = all[0]!; d <= today; d = addDays(d, 1)) {
        if (active.has(d)) run++;
        else if (!freezes.has(d) && d !== today) run = 0;
        longest = Math.max(longest, run);
      }
    }

    const calendar: { date: string; state: StreakDayState }[] = [];
    for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      calendar.push({ date, state: active.has(date) ? 'ACTIVE' : freezes.has(date) ? 'FREEZE' : 'EMPTY' });
    }

    const byGoal = new Map<string, Set<string>>();
    for (const c of comps) {
      if (!c.goalId) continue;
      const s = byGoal.get(c.goalId) ?? new Set<string>();
      s.add(c.date);
      byGoal.set(c.goalId, s);
    }
    const none = new Set<string>();
    const goalStreaks = [...byGoal.entries()]
      .map(([goalId, days]) => ({ goalId, current: this.current(days, none, today) }))
      .sort((a, b) => a.goalId.localeCompare(b.goalId));

    return { current: this.current(active, freezes, today), longest, freezesLeft: this.freezesLeft(monthOf(today)), calendar, goalStreaks };
  }

  // ---------------- job ----------------

  /**
   * Xử lý Freeze cho mỗi ngày đã kết thúc đúng 1 lần (streak_processed_days). Idempotent.
   * Ngày không active + chuỗi tới hôm trước > 0 + tháng đó còn lượt → dùng 1 Freeze.
   */
  processEndedDays(nowIso: string): void {
    const tz = this.ctx.tz();
    const yesterday = addDays(localDate(nowIso, tz), -1);
    const last = (this.ctx.db.prepare('SELECT MAX(date) d FROM streak_processed_days').get() as { d: string | null }).d;
    const active = this.activeDays();
    let start: string;
    if (last) start = addDays(last, 1);
    else {
      const first = [...active].sort()[0];
      if (!first) return;
      start = first;
    }
    const freezes = this.freezeDays();
    const perMonth = this.ctx.services.settings.get().freezesPerMonth;
    const insFreeze = this.ctx.db.prepare('INSERT OR IGNORE INTO streak_freezes (date, month, created_at) VALUES (?, ?, ?)');
    const insDone = this.ctx.db.prepare('INSERT OR IGNORE INTO streak_processed_days (date, processed_at) VALUES (?, ?)');
    const usedIn = this.ctx.db.prepare('SELECT COUNT(*) c FROM streak_freezes WHERE month = ?');
    for (let d = start; d <= yesterday; d = addDays(d, 1)) {
      if (!active.has(d) && !freezes.has(d) && this.chainAt(addDays(d, -1), active, freezes) > 0) {
        const month = monthOf(d);
        const used = (usedIn.get(month) as { c: number }).c;
        if (used < perMonth) {
          insFreeze.run(d, month, nowIso);
          freezes.add(d);
          this.ctx.services.activity.log({ type: 'STREAK_FREEZE_USED', message: `Dùng Streak Freeze cho ngày ${d}`, after: { date: d } });
        }
      }
      insDone.run(d, nowIso);
    }
  }

  // ---------------- check-in (F-14) ----------------

  listCheckins(from?: string, to?: string): CheckinDto[] {
    const where: string[] = [];
    const args: string[] = [];
    if (from) { where.push('date >= ?'); args.push(from); }
    if (to) { where.push('date <= ?'); args.push(to); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return (this.ctx.db.prepare(`SELECT * FROM checkins ${w} ORDER BY date DESC`).all(...args) as CheckinRow[]).map(toCheckin);
  }

  getCheckin(date: string): CheckinDto | null {
    const r = this.ctx.db.prepare('SELECT * FROM checkins WHERE date = ?').get(date) as CheckinRow | undefined;
    return r ? toCheckin(r) : null;
  }

  /** Ghi/sửa Check-in. Chỉ cho phép ngày hôm nay (timezone Owner). Trường undefined giữ giá trị cũ. */
  upsertCheckin(date: string, input: { mood?: number | null; note?: string | null }): CheckinDto {
    const today = this.today();
    if (date !== today) throw rule(ErrorCode.CONFLICT, 'Chỉ có thể ghi/sửa Check-in của hôm nay', { date, today });
    const prev = this.getCheckin(date);
    const mood = input.mood !== undefined ? input.mood : prev?.mood ?? null;
    const note = input.note !== undefined ? input.note : prev?.note ?? null;
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare(
        `INSERT INTO checkins (date, mood, note, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET mood = excluded.mood, note = excluded.note, updated_at = excluded.updated_at`,
      )
      .run(date, mood, note, now);
    this.ctx.services.activity.log({
      type: prev ? 'CHECKIN_UPDATED' : 'CHECKIN_CREATED',
      message: prev ? `Sửa Check-in ngày ${date}` : `Check-in ngày ${date}`,
      before: prev ? { mood: prev.mood, note: prev.note } : undefined,
      after: { mood, note },
    });
    return this.getCheckin(date)!;
  }

  upsertTodayCheckin(input: { mood?: number | null; note?: string | null }): CheckinDto {
    return this.upsertCheckin(this.today(), input);
  }
}

const toCheckin = (r: CheckinRow): CheckinDto => ({ date: r.date, mood: r.mood, note: r.note, updatedAt: r.updated_at });
