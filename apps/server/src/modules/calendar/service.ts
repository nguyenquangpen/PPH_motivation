import type { BusyIntervalDto, CalendarListItemDto, CalendarStatusDto, ExternalEventDto, SessionDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { notFound, validation } from '../../core/errors.js';
import { GoogleCalendarProvider, type OAuthClientConfig } from './google-provider.js';
import {
  ProviderAuthError, ProviderNotFound,
  type CalendarProvider, type EventInput, type ProviderChanges, type ProviderEvent, type SecretStore,
} from './provider.js';
import { createSecretStore } from './secret-store.js';

type ConnRow = {
  status: 'NOT_CONNECTED' | 'ACTIVE' | 'ERROR'; account_email: string | null; error: string | null; error_since: string | null;
  last_success_at: string | null; tokens_enc: string | null; busy_calendar_ids: string; sync_tokens: string; last_pull_at: string | null;
  oauth_client_id: string | null; oauth_client_secret_enc: string | null;
};
type Op = 'CREATE' | 'UPDATE' | 'DELETE';
type MapRow = {
  session_id: string; account_email: string; event_id: string | null; status: string; pending_op: Op | null;
  attempts: number; next_attempt_at: string | null; last_error: string | null; synced_at: string | null; op_seq: number;
  pushed_start: string | null; pushed_end: string | null;
};
type SessionInfo = {
  id: string; task_id: string; start: string; end: string; source: string; deleted_at: string | null;
  title: string; task_status: string; priority: string; contribution: number; task_deleted: string | null; goal_title: string | null;
};

export const AUTH_ERROR = 'Cần kết nối lại';
export const SYNC_ERROR = 'Không đồng bộ được với Google Calendar';
const PRIMARY = 'primary';
const MIN = 60_000;
const PULL_EVERY = 5 * MIN;
const MANUAL_SYNC_MIN_GAP = MIN;
const PUSH_TIMER_MS = 10_000;
const BACKOFF_BASE = 30_000;
const BACKOFF_MAX = 15 * MIN;
const ERROR_AFTER = 30 * MIN;

const ms = (iso: string) => new Date(iso).getTime();
const addMs = (iso: string, d: number) => new Date(ms(iso) + d).toISOString();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * F-22…F-25 (+ F-34). Kết nối Google Calendar, outbox đẩy phiên, đọc thay đổi (Google thắng), giờ bận.
 * DB đồng bộ; gọi provider (async) nằm ngoài transaction, kết quả ghi trong transaction ngắn.
 */
export class CalendarService {
  readonly provider: CalendarProvider;
  private secrets: SecretStore;
  private tokensLoaded = false;
  private chain: Promise<unknown> = Promise.resolve();
  private pushQueued: Promise<void> | null = null;
  private pullQueued: Promise<boolean> | null = null;
  private background = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private connecting: { authUrl: string | null; error: string | null; running: boolean; promise: Promise<void> } | null = null;

  constructor(private ctx: AppContext) {
    this.secrets = ctx.options.secretStore ?? createSecretStore(ctx.options.dataDir);
    this.provider = ctx.options.calendarProvider ?? new GoogleCalendarProvider(() => this.oauthConfig());
  }

  // ======================= wiring =======================

  wire(): void {
    const ev = this.ctx.events;
    ev.on('session.changed', (p) => this.enqueue(p.sessionId, p.op));
    const touchTask = (taskId: string) => {
      for (const s of this.sessionIdsOfTask(taskId)) this.enqueue(s, 'UPDATE', true);
    };
    const dropTask = (taskId: string) => {
      for (const s of this.sessionIdsOfTask(taskId)) this.enqueue(s, 'DELETE');
    };
    ev.on('task.content_changed', (p) => touchTask(p.taskId));
    ev.on('task.completed', (p) => touchTask(p.taskId));
    ev.on('task.undone', (p) => touchTask(p.taskId));
    ev.on('task.cancelled', (p) => dropTask(p.taskId));
    ev.on('task.deleted', (p) => dropTask(p.taskId));

    this.ctx.scheduler.register({
      name: 'calendar.push',
      run: (now) => {
        this.checkErrorEpisode(now);
        if (this.canSync() && this.hasDuePush(now)) void this.pushNow();
      },
    });
    this.ctx.scheduler.register({
      name: 'calendar.pull',
      run: (now) => {
        const c = this.conn();
        if (this.canSync() && (!c.last_pull_at || ms(now) - ms(c.last_pull_at) >= PULL_EVERY)) void this.pullNow();
      },
    });
  }

  /** Chỉ startHub gọi: timer đẩy ~10 giây + "đánh thức" ngay sau mỗi thay đổi. Test không bật. */
  startBackground(): void {
    if (this.background) return;
    this.background = true;
    this.timer = setInterval(() => {
      if (this.canSync() && this.hasDuePush(this.ctx.nowIso())) void this.pushNow();
    }, PUSH_TIMER_MS);
    this.timer.unref?.();
  }

  stopBackground(): void {
    this.background = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Chờ mọi lần đẩy/đọc đang chạy xong (test). */
  async idle(): Promise<void> {
    let last: Promise<unknown> | null = null;
    while (last !== this.chain) {
      last = this.chain;
      await last;
    }
  }

  // ======================= status / config =======================

  private conn(): ConnRow {
    return this.ctx.db.prepare('SELECT * FROM calendar_connection WHERE id = 1').get() as ConnRow;
  }

  status(): CalendarStatusDto & { connecting: boolean; authUrl: string | null; connectError: string | null; oauthClientConfigured: boolean } {
    const c = this.conn();
    const pending = c.account_email
      ? (this.ctx.db.prepare('SELECT COUNT(*) n FROM calendar_mappings WHERE pending_op IS NOT NULL AND account_email = ? AND status IN (\'PENDING\',\'ERROR\')')
        .get(c.account_email) as { n: number }).n
      : 0;
    return {
      status: c.status, accountEmail: c.account_email, error: c.error, lastSuccessAt: c.last_success_at, lastPullAt: c.last_pull_at,
      busyCalendarIds: JSON.parse(c.busy_calendar_ids) as string[], pendingChanges: pending,
      connecting: !!this.connecting?.running, authUrl: this.connecting?.running ? this.connecting.authUrl : null,
      connectError: this.connecting?.error ?? null, oauthClientConfigured: !!this.oauthConfig(),
    };
  }

  /** Client id/secret OAuth (Google Cloud project của Owner, loại Desktop app). Env PPH_GOOGLE_CLIENT_ID/SECRET là dự phòng. */
  oauthConfig(): OAuthClientConfig | null {
    const c = this.conn();
    if (c.oauth_client_id && c.oauth_client_secret_enc) {
      try {
        return { clientId: c.oauth_client_id, clientSecret: this.secrets.decrypt(c.oauth_client_secret_enc) };
      } catch {
        return null;
      }
    }
    const id = process.env.PPH_GOOGLE_CLIENT_ID;
    const secret = process.env.PPH_GOOGLE_CLIENT_SECRET;
    return id && secret ? { clientId: id, clientSecret: secret } : null;
  }

  getOauthClient(): { clientId: string | null; hasSecret: boolean } {
    const c = this.conn();
    return { clientId: c.oauth_client_id, hasSecret: !!c.oauth_client_secret_enc };
  }

  setOauthClient(clientId: string, clientSecret?: string): { clientId: string | null; hasSecret: boolean } {
    const c = this.conn();
    const enc = clientSecret ? this.secrets.encrypt(clientSecret) : c.oauth_client_secret_enc;
    this.ctx.db.prepare('UPDATE calendar_connection SET oauth_client_id = ?, oauth_client_secret_enc = ? WHERE id = 1').run(clientId, enc);
    return this.getOauthClient();
  }

  private canSync(c: ConnRow = this.conn()): boolean {
    return c.status === 'ACTIVE' || (c.status === 'ERROR' && c.error !== AUTH_ERROR);
  }

  private loadTokens(): void {
    if (this.tokensLoaded) return;
    const c = this.conn();
    let tokens: string | null = null;
    if (c.tokens_enc) {
      try {
        tokens = this.secrets.decrypt(c.tokens_enc);
      } catch {
        tokens = null;
      }
    }
    this.provider.useTokens(tokens);
    this.tokensLoaded = true;
  }

  private saveRefreshedTokens(): void {
    const t = this.provider.takeRefreshedTokens();
    if (t) this.ctx.db.prepare('UPDATE calendar_connection SET tokens_enc = ? WHERE id = 1 AND tokens_enc IS NOT NULL').run(this.secrets.encrypt(t));
  }

  // ======================= connect / disconnect =======================

  /** Bắt đầu đăng nhập; trả về ngay khi có URL đăng nhập (UI mở trình duyệt) hoặc khi đã xong. Phần còn lại chạy nền. */
  async startConnect(): Promise<{ authUrl: string | null; status: ReturnType<CalendarService['status']> }> {
    if (!this.connecting?.running) {
      let gotUrl!: () => void;
      const urlReady = new Promise<void>((r) => (gotUrl = r));
      const st = { authUrl: null as string | null, error: null as string | null, running: true, promise: Promise.resolve() };
      this.connecting = st;
      st.promise = this.provider
        .connect({ onAuthUrl: (u) => { st.authUrl = u; gotUrl(); } })
        .then((r) => this.finishConnect(r.accountEmail, r.tokens))
        .catch((e) => { st.error = errMsg(e); })
        .finally(() => { st.running = false; });
      await Promise.race([urlReady, st.promise]);
    }
    return { authUrl: this.connecting.authUrl, status: this.status() };
  }

  /** Kết nối và chờ tới khi xong (test / CLI). */
  async connect(): Promise<CalendarStatusDto> {
    await this.startConnect();
    await this.connecting?.promise;
    if (this.connecting?.error) throw new Error(this.connecting.error);
    return this.status();
  }

  private finishConnect(email: string, tokens: string): void {
    this.provider.useTokens(tokens);
    this.tokensLoaded = true;
    const now = this.ctx.nowIso();
    this.ctx.db.transaction(() => {
      this.ctx.db.prepare(
        `UPDATE calendar_connection SET status='ACTIVE', account_email=?, tokens_enc=?, error=NULL, error_since=NULL,
           last_success_at=?, last_pull_at=NULL, sync_tokens='{}' WHERE id = 1`,
      ).run(email, this.secrets.encrypt(tokens), now);
      this.ctx.db.prepare('DELETE FROM calendar_events_cache').run();

      // Rule 6: cùng tài khoản → mapping INACTIVE hoạt động lại, đẩy bù trạng thái hiện tại
      const inactive = this.ctx.db.prepare("SELECT * FROM calendar_mappings WHERE status = 'INACTIVE' AND account_email = ?").all(email) as MapRow[];
      for (const m of inactive) {
        const s = this.sessionInfo(m.session_id);
        if (s && s.source === 'LINKED') {
          this.ctx.db.prepare("UPDATE calendar_mappings SET status='SYNCED', pending_op=NULL WHERE session_id = ?").run(m.session_id);
        } else if (s && this.alive(s)) {
          this.setOp(m.session_id, m.event_id ? 'UPDATE' : 'CREATE', now, true);
        } else if (m.event_id || m.attempts > 0) {
          this.setOp(m.session_id, 'DELETE', now, true);
        } else {
          this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(m.session_id);
        }
      }
      // Rule 3 (+ tài khoản khác): mọi phiên tương lai của Task chưa xong/hủy chưa có mapping của tài khoản này → CREATE
      const rows = this.ctx.db.prepare(
        `SELECT s.id, m.account_email FROM task_sessions s JOIN tasks t ON t.id = s.task_id
           LEFT JOIN calendar_mappings m ON m.session_id = s.id
         WHERE s.deleted_at IS NULL AND t.deleted_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELLED') AND s.source = 'HUB'`,
      ).all() as { id: string; account_email: string | null }[];
      for (const r of rows) {
        if (r.account_email === email) continue;
        const s = this.sessionInfo(r.id)!;
        if (ms(s.end) < ms(now)) continue;
        this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(r.id);
        this.insertCreate(r.id, email, now);
      }
    })();
    this.wake();
    if (this.background) void this.pullNow();
  }

  disconnect(): CalendarStatusDto {
    this.ctx.db.transaction(() => {
      this.ctx.db.prepare(
        `UPDATE calendar_connection SET status='NOT_CONNECTED', account_email=NULL, tokens_enc=NULL, error=NULL, error_since=NULL,
           sync_tokens='{}', last_pull_at=NULL WHERE id = 1`,
      ).run();
      this.ctx.db.prepare("UPDATE calendar_mappings SET status='INACTIVE', pending_op=NULL, next_attempt_at=NULL WHERE status != 'DETACHED'").run();
      this.ctx.db.prepare('DELETE FROM calendar_events_cache').run();
    })();
    this.provider.useTokens(null);
    this.tokensLoaded = true;
    return this.status();
  }

  // ======================= calendars / busy =======================

  async listCalendars(): Promise<CalendarListItemDto[]> {
    if (!this.canSync()) return [];
    this.loadTokens();
    const busyIds = JSON.parse(this.conn().busy_calendar_ids) as string[];
    try {
      const list = await this.provider.listCalendars();
      this.saveRefreshedTokens();
      return list.map((c) => ({ ...c, selectedForBusy: busyIds.includes(c.id) }));
    } catch (e) {
      this.handleProviderError(e);
      return [];
    }
  }

  async setBusyCalendars(ids: string[]): Promise<CalendarStatusDto> {
    const uniq = [...new Set(ids)];
    this.ctx.db.prepare('UPDATE calendar_connection SET busy_calendar_ids = ? WHERE id = 1').run(JSON.stringify(uniq));
    await this.pullNow();
    return this.status();
  }

  /** Giờ bận (đã gộp) trong khoảng [from, to); rỗng nếu chưa kết nối/lỗi. */
  busy(from: string, to: string): BusyIntervalDto[] {
    if (!this.hasBusyData()) return [];
    const f = new Date(from).toISOString();
    const t = new Date(to).toISOString();
    const ids = JSON.parse(this.conn().busy_calendar_ids) as string[];
    if (ids.length === 0) return [];
    const rows = this.ctx.db.prepare(
      `SELECT c.start, c.end FROM calendar_events_cache c
       WHERE c.calendar_id IN (${ids.map(() => '?').join(',')}) AND c.all_day = 0 AND c.transparency = 'opaque' AND c.declined = 0
         AND c.hub_session_id IS NULL AND NOT EXISTS (SELECT 1 FROM calendar_mappings m WHERE m.event_id = c.event_id)
         AND c.start < ? AND c.end > ?
       ORDER BY c.start`,
    ).all(...ids, t, f) as { start: string; end: string }[];
    const out: { s: number; e: number }[] = [];
    for (const r of rows) {
      const s = Math.max(ms(r.start), ms(f));
      const e = Math.min(ms(r.end), ms(t));
      if (e <= s) continue;
      const last = out[out.length - 1];
      if (last && s <= last.e) last.e = Math.max(last.e, e);
      else out.push({ s, e });
    }
    return out.map((x) => ({ start: new Date(x.s).toISOString(), end: new Date(x.e).toISOString() }));
  }

  /** Có dữ liệu lịch Google dùng được không (ACTIVE và đã đọc ít nhất 1 lần). */
  hasBusyData(): boolean {
    const c = this.conn();
    return c.status === 'ACTIVE' && !!c.last_pull_at;
  }

  /** F-34: Event có sẵn trên primary (không phải của Hub, không cả ngày) để liên kết. */
  externalEvents(from: string, to: string): ExternalEventDto[] {
    if (!this.hasBusyData()) return [];
    return (this.ctx.db.prepare(
      `SELECT c.* FROM calendar_events_cache c WHERE c.calendar_id = ? AND c.all_day = 0 AND c.hub_session_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM calendar_mappings m WHERE m.event_id = c.event_id AND m.status != 'DETACHED')
         AND c.start < ? AND c.end > ? ORDER BY c.start`,
    ).all(PRIMARY, new Date(to).toISOString(), new Date(from).toISOString()) as { event_id: string; calendar_id: string; title: string | null; start: string; end: string }[])
      .map((r) => ({ eventId: r.event_id, calendarId: r.calendar_id, title: r.title ?? '', start: r.start, end: r.end }));
  }

  /** F-34: tạo phiên LINKED từ Event có sẵn. Event không bị đổi; Google thắng về giờ; xóa phiên chỉ gỡ liên kết. */
  linkEvent(taskId: string, eventId: string): SessionDto {
    const c = this.conn();
    if (c.status !== 'ACTIVE' || !c.account_email) throw validation('Chưa kết nối Google Calendar');
    const ev = this.ctx.db.prepare('SELECT * FROM calendar_events_cache WHERE calendar_id = ? AND event_id = ?').get(PRIMARY, eventId) as
      { start: string; end: string; all_day: number; hub_session_id: string | null } | undefined;
    if (!ev || ev.all_day || ev.hub_session_id) throw notFound('Event', { eventId });
    const session = this.ctx.services.sessions.createLinked(taskId, ev.start, ev.end);
    this.ctx.db.prepare(
      `INSERT INTO calendar_mappings (session_id, account_email, event_id, status, pending_op, attempts, synced_at, pushed_start, pushed_end)
       VALUES (?, ?, ?, 'SYNCED', NULL, 0, ?, ?, ?)`,
    ).run(session.id, c.account_email, eventId, this.ctx.nowIso(), ev.start, ev.end);
    return this.ctx.services.sessions.get(session.id);
  }

  // ======================= outbox (đồng bộ, trong transaction của nơi phát) =======================

  private sessionIdsOfTask(taskId: string): string[] {
    return (this.ctx.db.prepare('SELECT id FROM task_sessions WHERE task_id = ?').all(taskId) as { id: string }[]).map((r) => r.id);
  }

  private mapping(sessionId: string): MapRow | undefined {
    return this.ctx.db.prepare('SELECT * FROM calendar_mappings WHERE session_id = ?').get(sessionId) as MapRow | undefined;
  }

  private sessionInfo(sessionId: string): SessionInfo | undefined {
    return this.ctx.db.prepare(
      `SELECT s.id, s.task_id, s.start, s.end, s.source, s.deleted_at, t.title, t.status AS task_status, t.priority, t.contribution,
              t.deleted_at AS task_deleted, g.title AS goal_title
       FROM task_sessions s JOIN tasks t ON t.id = s.task_id LEFT JOIN goals g ON g.id = t.goal_id WHERE s.id = ?`,
    ).get(sessionId) as SessionInfo | undefined;
  }

  /** Phiên còn cần Event trên Google */
  private alive(s: SessionInfo): boolean {
    return !s.deleted_at && !s.task_deleted && s.task_status !== 'CANCELLED';
  }

  private insertCreate(sessionId: string, email: string, now: string): void {
    this.ctx.db.prepare(
      `INSERT INTO calendar_mappings (session_id, account_email, event_id, status, pending_op, attempts, next_attempt_at, op_seq)
       VALUES (?, ?, NULL, 'PENDING', 'CREATE', 0, ?, 1)`,
    ).run(sessionId, email, now);
  }

  private setOp(sessionId: string, op: Op, nextAt: string | null, keepBackoff = false): void {
    this.ctx.db.prepare(
      `UPDATE calendar_mappings SET pending_op = ?, status = CASE WHEN status = 'ERROR' THEN 'ERROR' ELSE 'PENDING' END,
         op_seq = op_seq + 1, next_attempt_at = CASE WHEN ? AND next_attempt_at IS NOT NULL THEN next_attempt_at ELSE ? END
       WHERE session_id = ?`,
    ).run(op, keepBackoff ? 1 : 0, nextAt, sessionId);
    if (!keepBackoff) this.ctx.db.prepare("UPDATE calendar_mappings SET status = 'PENDING' WHERE session_id = ? AND status = 'INACTIVE'").run(sessionId);
  }

  /** Ghi thay đổi vào outbox, gộp với thay đổi đang chờ (design §6). onlyExisting: không tạo Event mới. */
  private enqueue(sessionId: string, op: Op, onlyExisting = false): void {
    const c = this.conn();
    if (c.status === 'NOT_CONNECTED' || !c.account_email) return; // khi kết nối lại sẽ tính lại toàn bộ
    const now = this.ctx.nowIso();
    let m = this.mapping(sessionId);
    if (m && m.account_email !== c.account_email) {
      if (op === 'DELETE') return; // mapping của tài khoản cũ: không đụng
      this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(sessionId);
      m = undefined;
    }
    if (m && (m.status === 'DETACHED' || m.status === 'INACTIVE')) return;
    const s = this.sessionInfo(sessionId);
    if (s?.source === 'LINKED') {
      // F-34: không bao giờ sửa/xóa Event của Owner — xóa phiên chỉ gỡ liên kết
      if (m && (op === 'DELETE' || !this.alive(s))) this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(sessionId);
      return;
    }
    if (!m) {
      if (op === 'DELETE' || onlyExisting || !s || !this.alive(s)) return;
      if (ms(s.end) < ms(now)) return; // F-23 rule 6
      this.insertCreate(sessionId, c.account_email, now);
      this.wake();
      return;
    }
    const cur = m.pending_op;
    let next: Op;
    if (op === 'DELETE') {
      if (cur === 'CREATE' && !m.event_id && m.attempts === 0) {
        this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(sessionId);
        return;
      }
      next = 'DELETE';
    } else if (cur === 'CREATE' || cur === 'DELETE') {
      next = cur;
    } else {
      next = m.event_id ? 'UPDATE' : 'CREATE';
    }
    this.setOp(sessionId, next, now, cur !== null);
    this.wake();
  }

  private wake(): void {
    if (this.background) setImmediate(() => void this.pushNow());
  }

  private hasDuePush(now: string): boolean {
    const c = this.conn();
    return !!this.ctx.db.prepare(
      `SELECT 1 FROM calendar_mappings WHERE pending_op IS NOT NULL AND account_email = ? AND status IN ('PENDING','ERROR')
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?) LIMIT 1`,
    ).get(c.account_email, now);
  }

  // ======================= worker đẩy =======================

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** Đẩy mọi thay đổi đến hạn (test gọi trực tiếp). */
  pushNow(): Promise<void> {
    if (this.pushQueued) return this.pushQueued;
    const p = this.exclusive(async () => {
      this.pushQueued = null;
      try {
        await this.pushOnce();
      } catch (e) {
        console.error('[calendar] push failed', errMsg(e));
      }
    });
    this.pushQueued = p;
    return p;
  }

  private async pushOnce(): Promise<void> {
    if (!this.canSync()) return;
    this.loadTokens();
    const c = this.conn();
    const due = this.ctx.db.prepare(
      `SELECT * FROM calendar_mappings WHERE pending_op IS NOT NULL AND account_email = ? AND status IN ('PENDING','ERROR')
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY rowid`,
    ).all(c.account_email, this.ctx.nowIso()) as MapRow[];
    for (const m of due) {
      if (!this.canSync()) break;
      await this.pushOne(m);
    }
    this.checkErrorEpisode(this.ctx.nowIso());
  }

  private eventInput(s: SessionInfo): EventInput {
    const lines = [
      ...(s.goal_title ? [`Goal: ${s.goal_title}`] : []),
      `Priority: ${s.priority}`,
      `Contribution: ${s.contribution}`,
      '',
      'Quản lý bởi Productivity Hub',
    ];
    return {
      calendarId: PRIMARY,
      title: `${s.task_status === 'COMPLETED' ? '✓ ' : ''}${s.title}`,
      description: lines.join('\n'),
      start: s.start, end: s.end, hubSessionId: s.id,
    };
  }

  private async pushOne(m: MapRow): Promise<void> {
    const s = this.sessionInfo(m.session_id);
    const op: Op = !s || !this.alive(s) ? 'DELETE' : m.pending_op!;
    try {
      if (op === 'DELETE') {
        let eventId = m.event_id;
        if (!eventId && m.attempts > 0) eventId = (await this.provider.findHubEvent(PRIMARY, m.session_id))?.id ?? null;
        if (eventId) {
          try {
            await this.provider.deleteEvent(PRIMARY, eventId);
          } catch (e) {
            if (!(e instanceof ProviderNotFound)) throw e;
          }
        }
        this.ctx.db.transaction(() => {
          const cur = this.mapping(m.session_id);
          if (!cur) return;
          if (cur.op_seq === m.op_seq) this.ctx.db.prepare('DELETE FROM calendar_mappings WHERE session_id = ?').run(m.session_id);
          else this.ctx.db.prepare('UPDATE calendar_mappings SET event_id = NULL, attempts = 0 WHERE session_id = ?').run(m.session_id);
          this.markSuccess();
        })();
      } else {
        const input = this.eventInput(s!);
        let ev: ProviderEvent;
        if (op === 'CREATE') {
          // F-23 rule 11: lần trước có thể đã tạo trên Google mà mất phản hồi → tìm trước khi tạo lại
          const existing = m.attempts > 0 ? await this.provider.findHubEvent(PRIMARY, m.session_id) : null;
          ev = existing ? await this.provider.updateEvent(existing.id, input) : await this.provider.createEvent(input);
        } else {
          ev = await this.provider.updateEvent(m.event_id!, input);
        }
        this.ctx.db.transaction(() => {
          const cur = this.mapping(m.session_id);
          if (!cur) return;
          const now = this.ctx.nowIso();
          if (cur.op_seq === m.op_seq) {
            this.ctx.db.prepare(
              `UPDATE calendar_mappings SET event_id = ?, status = 'SYNCED', pending_op = NULL, attempts = 0, next_attempt_at = NULL,
                 last_error = NULL, synced_at = ?, pushed_start = ?, pushed_end = ? WHERE session_id = ?`,
            ).run(ev.id, now, input.start, input.end, m.session_id);
          } else {
            this.ctx.db.prepare(
              `UPDATE calendar_mappings SET event_id = ?, pending_op = CASE WHEN pending_op = 'CREATE' THEN 'UPDATE' ELSE pending_op END,
                 attempts = 0, next_attempt_at = ?, pushed_start = ?, pushed_end = ? WHERE session_id = ?`,
            ).run(ev.id, now, input.start, input.end, m.session_id);
          }
          this.markSuccess();
        })();
      }
      this.saveRefreshedTokens();
    } catch (e) {
      if (e instanceof ProviderNotFound && op === 'UPDATE') {
        // F-23 rule 10 → như F-24 rule 4
        this.ctx.db.transaction(() => this.detachSession(m.session_id))();
        return;
      }
      if (e instanceof ProviderAuthError) {
        this.ctx.db.transaction(() => this.setAuthError())();
        return;
      }
      this.ctx.db.transaction(() => {
        const now = this.ctx.nowIso();
        const attempts = m.attempts + 1;
        const delay = Math.min(BACKOFF_BASE * 2 ** (attempts - 1), BACKOFF_MAX);
        this.ctx.db.prepare(
          "UPDATE calendar_mappings SET attempts = ?, status = 'ERROR', next_attempt_at = ?, last_error = ? WHERE session_id = ?",
        ).run(attempts, addMs(now, delay), errMsg(e).slice(0, 300), m.session_id);
        this.markFailure();
      })();
    }
  }

  // ======================= đọc thay đổi (Google thắng) =======================

  /** Đọc thay đổi ngay (job 5 phút, khi khởi động, sau khi chọn lịch). Trả về true nếu đã đọc thành công. */
  pullNow(): Promise<boolean> {
    if (this.pullQueued) return this.pullQueued;
    const p = this.exclusive(async () => {
      this.pullQueued = null;
      try {
        return await this.pullOnce();
      } catch (e) {
        console.error('[calendar] pull failed', errMsg(e));
        return false;
      }
    });
    this.pullQueued = p;
    return p;
  }

  /** POST /calendar/sync (UI focus): tối đa 1 lần/phút. */
  async syncFromUi(): Promise<{ pulled: boolean }> {
    const c = this.conn();
    if (!this.canSync(c)) return { pulled: false };
    if (c.last_pull_at && ms(this.ctx.nowIso()) - ms(c.last_pull_at) < MANUAL_SYNC_MIN_GAP) return { pulled: false };
    const pulled = await this.pullNow();
    void this.pushNow();
    return { pulled };
  }

  private async pullOnce(): Promise<boolean> {
    if (!this.canSync()) return false;
    this.loadTokens();
    const c = this.conn();
    const startedAt = this.ctx.nowIso();
    const calIds = [...new Set([PRIMARY, ...(JSON.parse(c.busy_calendar_ids) as string[])])];
    const tokens = JSON.parse(c.sync_tokens) as Record<string, string>;
    const window = { from: addMs(startedAt, -24 * 60 * MIN), to: addMs(startedAt, 30 * 24 * 60 * MIN) };
    const results: { cal: string; ch: ProviderChanges }[] = [];
    for (const cal of calIds) {
      try {
        results.push({ cal, ch: await this.provider.listChanges(cal, tokens[cal] ?? null, window) });
      } catch (e) {
        if (e instanceof ProviderNotFound && cal !== PRIMARY) continue; // lịch không còn
        this.handleProviderError(e);
        return false;
      }
    }
    this.saveRefreshedTokens();
    this.ctx.db.transaction(() => {
      const now = this.conn();
      if (now.account_email !== c.account_email || !this.canSync(now)) return; // đã ngắt kết nối giữa chừng
      for (const { cal, ch } of results) {
        this.applyChanges(cal, ch);
        tokens[cal] = ch.nextSyncToken;
      }
      this.ctx.db.prepare('UPDATE calendar_connection SET sync_tokens = ?, last_pull_at = ? WHERE id = 1').run(JSON.stringify(tokens), startedAt);
      this.markSuccess();
    })();
    return true;
  }

  private applyChanges(cal: string, ch: ProviderChanges): void {
    const db = this.ctx.db;
    if (ch.fullResync) db.prepare('DELETE FROM calendar_events_cache WHERE calendar_id = ?').run(cal);
    const del = db.prepare('DELETE FROM calendar_events_cache WHERE calendar_id = ? AND event_id = ?');
    const up = db.prepare(
      `INSERT INTO calendar_events_cache (event_id, calendar_id, start, end, all_day, transparency, declined, hub_session_id, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (calendar_id, event_id) DO UPDATE SET start = excluded.start, end = excluded.end, all_day = excluded.all_day,
         transparency = excluded.transparency, declined = excluded.declined, hub_session_id = excluded.hub_session_id, title = excluded.title`,
    );
    for (const ev of ch.events) {
      if (ev.status === 'cancelled' || !ev.start || !ev.end) del.run(cal, ev.id);
      else up.run(ev.id, cal, ev.start, ev.end, ev.allDay ? 1 : 0, ev.transparency, ev.declinedBySelf ? 1 : 0, ev.hubSessionId, ev.title);
      if (cal === PRIMARY) this.applyHubEvent(ev, ch.fullResync);
    }
  }

  private applyHubEvent(ev: ProviderEvent, fullResync: boolean): void {
    const c = this.conn();
    const m = this.ctx.db.prepare(
      "SELECT * FROM calendar_mappings WHERE event_id = ? AND account_email = ? AND status NOT IN ('DETACHED','INACTIVE')",
    ).get(ev.id, c.account_email) as MapRow | undefined;
    if (!m) return;
    if (ev.status === 'cancelled' || ev.allDay) {
      // F-24 rule 4: bị xóa / chuyển lịch khác (biến mất khỏi primary) / thành cả ngày
      if (m.pending_op === 'DELETE') return; // chính Hub đang xóa
      this.detachSession(m.session_id);
      return;
    }
    const s = this.sessionInfo(m.session_id);
    if (!s || s.deleted_at) return;
    const same = ms(ev.start) === ms(s.start) && ms(ev.end) === ms(s.end);
    if (same) return;
    // Tiếng vọng của lần đẩy trước (Hub đã đổi tiếp sau đó) → không phải thay đổi từ Owner
    const echo = m.pushed_start && m.pushed_end && ms(ev.start) === ms(m.pushed_start) && ms(ev.end) === ms(m.pushed_end);
    if (echo) return;
    if (fullResync && m.pending_op) return; // không biết Google có thật sự đổi không → giữ thay đổi của Hub
    this.ctx.services.sessions.applyExternalTime(m.session_id, ev.start, ev.end);
    // F-24 rule 3: Google thắng → bỏ UPDATE chưa đẩy
    this.ctx.db.prepare(
      `UPDATE calendar_mappings SET pending_op = CASE WHEN pending_op = 'UPDATE' THEN NULL ELSE pending_op END,
         status = CASE WHEN pending_op = 'UPDATE' THEN 'SYNCED' ELSE status END,
         attempts = CASE WHEN pending_op = 'UPDATE' THEN 0 ELSE attempts END,
         op_seq = op_seq + 1, pushed_start = ?, pushed_end = ? WHERE session_id = ?`,
    ).run(ev.start, ev.end, m.session_id);
  }

  /** Phiên bị gỡ khỏi Task, mapping DETACHED, Notification CALENDAR_EVENT_DELETED. Không tạo lại Event. */
  private detachSession(sessionId: string): void {
    this.ctx.db.prepare(
      "UPDATE calendar_mappings SET status = 'DETACHED', pending_op = NULL, next_attempt_at = NULL, op_seq = op_seq + 1 WHERE session_id = ?",
    ).run(sessionId);
    const s = this.sessionInfo(sessionId);
    if (!s) return;
    if (!s.deleted_at) this.ctx.services.sessions.detach(sessionId);
    this.ctx.services.notifications.notify({
      type: 'CALENDAR_EVENT_DELETED', objectType: 'TASK', objectId: s.task_id, dedupeKey: `CALENDAR_EVENT_DELETED:${sessionId}`,
      title: `Lịch của Task ${s.title} đã bị xóa trên Google Calendar`,
    });
  }

  // ======================= lỗi =======================

  private handleProviderError(e: unknown): void {
    if (e instanceof ProviderAuthError) this.ctx.db.transaction(() => this.setAuthError())();
    else this.ctx.db.transaction(() => this.markFailure())();
  }

  private setAuthError(): void {
    const c = this.conn();
    const since = c.error_since ?? this.ctx.nowIso();
    this.ctx.db.prepare("UPDATE calendar_connection SET status = 'ERROR', error = ?, error_since = ? WHERE id = 1").run(AUTH_ERROR, since);
    this.notifySyncError(since, AUTH_ERROR);
  }

  private markFailure(): void {
    const c = this.conn();
    if (!c.error_since) this.ctx.db.prepare('UPDATE calendar_connection SET error_since = ? WHERE id = 1').run(this.ctx.nowIso());
    this.checkErrorEpisode(this.ctx.nowIso());
  }

  private markSuccess(): void {
    const c = this.conn();
    if (c.error === AUTH_ERROR) return;
    this.ctx.db.prepare(
      "UPDATE calendar_connection SET status = CASE WHEN status = 'ERROR' THEN 'ACTIVE' ELSE status END, error = NULL, error_since = NULL, last_success_at = ? WHERE id = 1 AND status != 'NOT_CONNECTED'",
    ).run(this.ctx.nowIso());
  }

  /** Lỗi liên tục ≥ 30 phút → ERROR + CALENDAR_SYNC_ERROR (1 lần / đợt lỗi, dedupe theo error_since). */
  private checkErrorEpisode(now: string): void {
    const c = this.conn();
    if (c.status !== 'ACTIVE' || !c.error_since) return;
    if (ms(now) - ms(c.error_since) < ERROR_AFTER) return;
    this.ctx.db.prepare("UPDATE calendar_connection SET status = 'ERROR', error = ? WHERE id = 1").run(SYNC_ERROR);
    this.notifySyncError(c.error_since, SYNC_ERROR);
  }

  private notifySyncError(since: string, reason: string): void {
    const key = `CALENDAR_SYNC_ERROR:${since}`;
    if (this.ctx.services.notifications.existsEver(key)) return;
    this.ctx.services.notifications.notify({
      type: 'CALENDAR_SYNC_ERROR', objectType: 'CALENDAR', objectId: null, dedupeKey: key,
      title: 'Lỗi đồng bộ Google Calendar', body: reason,
    });
  }
}
