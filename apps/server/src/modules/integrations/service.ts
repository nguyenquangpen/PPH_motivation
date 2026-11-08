import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ErrorCode } from '@pph/shared';
import type {
  CreatedKeyDto, IntegrationAppDto, IntegrationAppStatus, IntegrationEventDto, IntegrationEventStatus, RuleDto,
} from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound, validation } from '../../core/errors.js';
import { dayRangeUtc } from '../../core/time.js';
import { newId } from '../../core/ids.js';
import { roundHalfUp } from '../xp/service.js';

// ---------------- Envelope (hợp đồng v1, mục 4 & 6) ----------------

const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const IsoOffset = z.string().regex(ISO_OFFSET, 'ISO 8601 phải có offset').refine((s) => !Number.isNaN(Date.parse(s)), 'Thời gian không hợp lệ');
const Level = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']);

export const EnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
  schema_version: z.literal(1),
  source: z.object({ app_id: z.string().min(1), app_version: z.string().min(1) }),
  subject: z.object({ type: z.string().min(1), external_id: z.string().min(1).max(200) }),
  data: z.record(z.string(), z.unknown()),
  occurred_at: IsoOffset,
  recorded_at: IsoOffset,
  metadata: z.record(z.string(), z.unknown()).optional()
    .refine((m) => m === undefined || Buffer.byteLength(JSON.stringify(m), 'utf8') <= 2048, 'metadata ≤ 2 KB'),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

const DATA_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'vocabulary.learned': z.object({
    count: z.number().int().min(1).max(1000), level: Level.optional(), deck: z.string().max(100).optional(),
    words: z.array(z.string().max(50)).max(100).optional(),
  }).strict(),
  'lesson.completed': z.object({
    title: z.string().min(1).max(200), duration_minutes: z.number().int().min(1).max(1440).optional(),
    score: z.number().min(0).max(100).optional(), level: Level.optional(),
  }).strict(),
  'learning.session.completed': z.object({
    duration_minutes: z.number().int().min(1).max(1440),
    activity: z.enum(['vocabulary', 'kanji', 'grammar', 'listening', 'reading', 'mixed', 'other']),
    started_at: IsoOffset, ended_at: IsoOffset, items_reviewed: z.number().int().min(0).optional(),
  }).strict(),
  'external_app.heartbeat': z.object({ outbox_pending: z.number().int().min(0) }).strict(),
};

export const HEARTBEAT = 'external_app.heartbeat';
const ACTIVE_WINDOW_MS = 24 * 3600 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const THRESHOLD_DAYS: Record<string, number | null> = { DAILY: 3, WEEKLY: 10, NONE: null };

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomBase62(n: number): string {
  let out = '';
  while (out.length < n) {
    for (const b of randomBytes(n * 2)) {
      if (b < 248 && out.length < n) out += BASE62[b % 62]; // 248 = 62*4 → không lệch phân phối
    }
  }
  return out;
}

export class HttpError extends Error {
  constructor(public readonly httpStatus: number, public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

const issuesToDetails = (err: z.ZodError, prefix = '') => ({
  fields: [...new Set(err.issues.map((i) => prefix + i.path.join('.')))],
  issues: err.issues.map((i) => ({ field: prefix + i.path.join('.'), message: i.message })),
});

type AppRow = {
  id: string; app_id: string; name: string; expected_frequency: 'DAILY' | 'WEEKLY' | 'NONE';
  last_activity_at: string | null; last_heartbeat_at: string | null; created_at: string; deleted_at: string | null;
};
type RuleRow = {
  id: string; app_ref: string; event_type: string; goal_id: string; mode: 'PER_UNIT' | 'FIXED'; field: string | null;
  factor: number | null; fixed: number | null; default_duration: number; enabled: number; deleted_at: string | null;
};
type EventRow = {
  event_id: string; app_ref: string; event_type: string; payload: string; payload_hash: string; occurred_at: string;
  received_at: string; status: IntegrationEventStatus; reason: string | null; contribution: number | null;
  xp_transaction_id: string | null; contribution_entry_id: string | null; pool_entry_id: string | null; goal_id: string | null;
  processed_at: string | null; is_activity: number;
};

export type RuleInput = {
  appRef: string; eventType: string; goalId: string; mode: 'PER_UNIT' | 'FIXED'; field?: string | null; factor?: number | null;
  fixed?: number | null; defaultDurationMinutes: number; enabled?: boolean;
};

export type EventFilters = {
  appRef?: string; status?: string; eventType?: string; from?: string; to?: string; includeHeartbeat?: boolean;
};

/** F-30…F-33: API sự kiện, app/key, quy tắc ánh xạ, xử lý sự kiện, cảnh báo app không hoạt động. */
export class IntegrationService {
  /** Test hook: gọi tại các mốc xử lý ('before_contribution' | 'after_contribution' | 'after_xp'); ném lỗi để giả lập FAILED. */
  faultHook: ((stage: string, eventId: string) => void) | null = null;

  constructor(private ctx: AppContext) {}

  private get db() {
    return this.ctx.db;
  }

  // ================= F-30 Ingest =================

  /** Xác thực Bearer key → app. Không bao giờ log key. */
  authenticate(authHeader: string | undefined): AppRow {
    const m = typeof authHeader === 'string' ? /^Bearer\s+(\S+)\s*$/i.exec(authHeader) : null;
    if (!m) throw new HttpError(401, 'UNAUTHORIZED', 'Thiếu hoặc sai API key');
    const row = this.db
      .prepare(
        `SELECT a.* FROM integration_keys k JOIN integration_apps a ON a.id = k.app_ref
         WHERE k.key_hash = ? AND k.revoked_at IS NULL AND a.deleted_at IS NULL`,
      )
      .get(sha256(m[1]!)) as AppRow | undefined;
    if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Thiếu, sai hoặc đã thu hồi API key');
    return row;
  }

  /**
   * Kiểm tra (401 → 403 → 400) rồi lưu sự kiện. Trả { status: 202|200, ... }; 409 khi trùng id khác nội dung.
   * 413 do Fastify bodyLimit xử lý trước khi tới đây.
   */
  ingest(authHeader: string | undefined, body: unknown): { httpStatus: 200 | 202; eventId: string; status: 'accepted' | 'duplicate'; needsProcessing: boolean } {
    const app = this.authenticate(authHeader);
    const rawAppId = (body as { source?: { app_id?: unknown } } | null)?.source?.app_id;
    if (typeof rawAppId === 'string' && rawAppId !== app.app_id) {
      throw new HttpError(403, ErrorCode.FORBIDDEN, 'source.app_id không khớp với app của API key');
    }
    const parsed = EnvelopeSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, ErrorCode.VALIDATION, 'Envelope không hợp lệ', issuesToDetails(parsed.error));
    const ev = parsed.data;
    if (ev.source.app_id !== app.app_id) throw new HttpError(403, ErrorCode.FORBIDDEN, 'source.app_id không khớp với app của API key');
    const dataSchema = DATA_SCHEMAS[ev.event_type];
    if (dataSchema) {
      const d = dataSchema.safeParse(ev.data);
      if (!d.success) throw new HttpError(400, ErrorCode.VALIDATION, `data không đúng đặc tả ${ev.event_type}`, issuesToDetails(d.error, 'data.'));
    }
    const nowIso = this.ctx.nowIso();
    const occurredMs = Date.parse(ev.occurred_at);
    if (occurredMs > Date.parse(nowIso) + FUTURE_TOLERANCE_MS) {
      throw new HttpError(400, ErrorCode.VALIDATION, 'occurred_at ở tương lai (quá now + 5 phút)', { fields: ['occurred_at'] });
    }

    const hash = sha256(JSON.stringify(body));
    const existing = this.db.prepare('SELECT payload_hash FROM integration_events WHERE event_id = ?').get(ev.event_id) as
      | { payload_hash: string } | undefined;
    if (existing) {
      if (existing.payload_hash === hash) return { httpStatus: 200, eventId: ev.event_id, status: 'duplicate', needsProcessing: false };
      throw new HttpError(409, ErrorCode.CONFLICT, 'event_id đã tồn tại với nội dung khác', { event_id: ev.event_id });
    }

    const occurredIso = new Date(occurredMs).toISOString();
    const isHeartbeat = ev.event_type === HEARTBEAT;
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO integration_events (event_id, app_ref, event_type, payload, payload_hash, occurred_at, received_at, status,
             processed_at, is_activity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(ev.event_id, app.id, ev.event_type, JSON.stringify(body), hash, occurredIso, nowIso,
          isHeartbeat ? 'PROCESSED' : 'RECEIVED', isHeartbeat ? nowIso : null, isHeartbeat ? 0 : 1);
      if (isHeartbeat) {
        this.db.prepare('UPDATE integration_apps SET last_heartbeat_at = ? WHERE id = ?').run(nowIso, app.id);
      } else {
        // Hoạt động gần nhất = max(occurred_at) của sự kiện hoạt động (mọi loại trừ heartbeat) — F-33
        this.db
          .prepare('UPDATE integration_apps SET last_activity_at = ? WHERE id = ? AND (last_activity_at IS NULL OR last_activity_at < ?)')
          .run(occurredIso, app.id, occurredIso);
      }
    })();
    return { httpStatus: 202, eventId: ev.event_id, status: 'accepted', needsProcessing: !isHeartbeat };
  }

  // ================= F-32 Processing =================

  /** Xử lý mọi sự kiện RECEIVED (fallback cho setImmediate; job scheduler; test). */
  processPending(): number {
    const ids = (this.db.prepare("SELECT event_id FROM integration_events WHERE status = 'RECEIVED' ORDER BY received_at, rowid").all() as
      { event_id: string }[]).map((r) => r.event_id);
    for (const id of ids) this.processOne(id);
    return ids.length;
  }

  /** Xử lý một sự kiện trong transaction riêng; lỗi → rollback + FAILED (lý do). */
  processOne(eventId: string): IntegrationEventStatus {
    try {
      return this.db.transaction(() => this.doProcess(eventId))();
    } catch (e) {
      const reason = (e as Error).message || 'Lỗi xử lý';
      this.db.prepare("UPDATE integration_events SET status = 'FAILED', reason = ?, processed_at = ? WHERE event_id = ? AND status = 'RECEIVED'")
        .run(reason, this.ctx.nowIso(), eventId);
      return 'FAILED';
    }
  }

  private doProcess(eventId: string): IntegrationEventStatus {
    const ev = this.db.prepare('SELECT * FROM integration_events WHERE event_id = ?').get(eventId) as EventRow | undefined;
    if (!ev || ev.status !== 'RECEIVED') return ev?.status ?? 'FAILED';
    const now = this.ctx.nowIso();
    const ignore = (reason: string, goalId: string | null = null) => {
      this.db.prepare("UPDATE integration_events SET status = 'IGNORED', reason = ?, goal_id = ?, processed_at = ? WHERE event_id = ?")
        .run(reason, goalId, now, eventId);
      return 'IGNORED' as const;
    };
    const rule = this.db
      .prepare('SELECT * FROM integration_rules WHERE app_ref = ? AND event_type = ? AND deleted_at IS NULL AND enabled = 1')
      .get(ev.app_ref, ev.event_type) as RuleRow | undefined;
    if (!rule) return ignore('Chưa có quy tắc ánh xạ');
    const goal = this.db.prepare('SELECT id, title, deleted_at FROM goals WHERE id = ?').get(rule.goal_id) as
      | { id: string; title: string; deleted_at: string | null } | undefined;
    if (!goal || goal.deleted_at) return ignore('Goal của quy tắc đã xóa', rule.goal_id);

    const payload = JSON.parse(ev.payload) as Envelope;
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    let c = rule.mode === 'FIXED' ? (rule.fixed ?? 0) : roundHalfUp(num(rule.field ? data[rule.field] : 0) * (rule.factor ?? 0));
    c = Math.min(Math.max(c, 0), 10000);
    const duration = typeof data.duration_minutes === 'number' && data.duration_minutes > 0 ? data.duration_minutes : rule.default_duration;

    const ledger = this.ctx.services.ledger;
    const xpSvc = this.ctx.services.xp;
    const s = this.ctx.services.settings.get();
    const app = this.db.prepare('SELECT name FROM integration_apps WHERE id = ?').get(ev.app_ref) as { name: string };
    const label = this.describe(ev.event_type, data);

    this.faultHook?.('before_contribution', eventId);
    let contributionEntryId: string | null = null;
    let xpTxId: string | null = null;
    let poolEntryId: string | null = null;
    if (c > 0) {
      contributionEntryId = ledger.addContribution(goal.id, null, c);
      this.faultHook?.('after_contribution', eventId);
      if (xpSvc.isSmall(c, s)) {
        poolEntryId = ledger.poolAdd(null, c);
      } else {
        const amount = xpSvc.nominalXp(c, duration, null, s);
        xpTxId = ledger.addXp({ type: 'TASK_REWARD', amount, sourceType: 'INTEGRATION_EVENT', sourceId: eventId, reason: `${label} — ${app.name}` })?.id ?? null;
      }
      this.faultHook?.('after_xp', eventId);
      this.ctx.services.activity.log({
        type: 'INTEGRATION_EVENT_PROCESSED',
        message: `${label} — ${app.name} (+${c} vào ${goal.title})`,
        goalId: goal.id,
      });
    }
    this.db
      .prepare(
        `UPDATE integration_events SET status = 'PROCESSED', reason = NULL, contribution = ?, goal_id = ?, contribution_entry_id = ?,
           xp_transaction_id = ?, pool_entry_id = ?, processed_at = ?, is_activity = 1 WHERE event_id = ?`,
      )
      .run(c, goal.id, contributionEntryId, xpTxId, poolEntryId, now, eventId);
    this.ctx.events.emit('integration.event_processed', { eventId, goalId: goal.id, contribution: c });
    return 'PROCESSED';
  }

  private describe(type: string, data: Record<string, unknown>): string {
    switch (type) {
      case 'vocabulary.learned': return `Học ${data.count} từ vựng`;
      case 'lesson.completed': return `Hoàn thành bài học ${String(data.title ?? '')}`.trim();
      case 'learning.session.completed': return `Phiên học ${data.duration_minutes} phút`;
      default: return `Sự kiện ${type}`;
    }
  }

  /** "Thử lại": chỉ FAILED (hoặc IGNORED) mới được xử lý lại; PROCESSED → không làm gì (không cộng trùng). */
  retry(eventId: string): IntegrationEventDto {
    const ev = this.eventRow(eventId);
    if (ev.status === 'FAILED' || ev.status === 'IGNORED') {
      this.db.prepare("UPDATE integration_events SET status = 'RECEIVED', reason = NULL WHERE event_id = ? AND status IN ('FAILED','IGNORED')").run(eventId);
      this.processOne(eventId);
    } else if (ev.status === 'RECEIVED') {
      this.processOne(eventId);
    }
    return this.getEvent(eventId);
  }

  /** (Could) Áp dụng quy tắc cho các sự kiện IGNORED cùng (app, event_type). */
  applyToIgnored(ruleId: string): { processed: number } {
    const r = this.ruleRow(ruleId);
    const ids = (this.db.prepare("SELECT event_id FROM integration_events WHERE app_ref = ? AND event_type = ? AND status = 'IGNORED' ORDER BY occurred_at")
      .all(r.app_ref, r.event_type) as { event_id: string }[]).map((x) => x.event_id);
    let processed = 0;
    for (const id of ids) if (this.retry(id).status === 'PROCESSED') processed++;
    return { processed };
  }

  // ================= F-33 Inactivity =================

  runInactivity(nowIso: string): void {
    const nowMs = Date.parse(nowIso);
    const apps = this.db.prepare('SELECT * FROM integration_apps WHERE deleted_at IS NULL AND last_activity_at IS NOT NULL').all() as AppRow[];
    for (const a of apps) {
      const threshold = THRESHOLD_DAYS[a.expected_frequency];
      if (threshold == null) continue;
      const days = Math.floor((nowMs - Date.parse(a.last_activity_at!)) / 86400000);
      if (days < threshold) continue;
      const key = `EXTERNAL_APP_INACTIVE:${a.id}:${a.last_activity_at}`; // 1 lần / đợt (đợt = last_activity_at)
      if (this.ctx.services.notifications.existsEver(key)) continue;
      this.ctx.services.notifications.notify({
        type: 'EXTERNAL_APP_INACTIVE', objectType: 'INTEGRATION_APP', objectId: a.id, dedupeKey: key,
        title: `Bạn chưa ghi nhận hoạt động từ ${a.name} trong ${days} ngày`,
      });
    }
  }

  // ================= F-31 Apps & keys =================

  private appRow(id: string): AppRow {
    const r = this.db.prepare('SELECT * FROM integration_apps WHERE id = ? AND deleted_at IS NULL').get(id) as AppRow | undefined;
    if (!r) throw notFound('App');
    return r;
  }

  private appDto(r: AppRow): IntegrationAppDto {
    const nowMs = Date.parse(this.ctx.nowIso());
    const last = [r.last_activity_at, r.last_heartbeat_at].filter((x): x is string => !!x).map((x) => Date.parse(x));
    const status: IntegrationAppStatus = last.length === 0 ? 'NO_DATA' : nowMs - Math.max(...last) <= ACTIVE_WINDOW_MS ? 'ACTIVE' : 'INACTIVE';
    const counts = this.db
      .prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) failed FROM integration_events WHERE app_ref = ? AND event_type <> ?`)
      .get(r.id, HEARTBEAT) as { total: number; failed: number | null };
    const keys = this.db.prepare('SELECT id, name, last4, created_at, revoked_at FROM integration_keys WHERE app_ref = ? ORDER BY created_at, rowid').all(r.id) as
      { id: string; name: string; last4: string; created_at: string; revoked_at: string | null }[];
    return {
      id: r.id, appId: r.app_id, name: r.name, expectedFrequency: r.expected_frequency, status,
      lastActivityAt: r.last_activity_at, lastHeartbeatAt: r.last_heartbeat_at, eventCount: counts.total, failedCount: counts.failed ?? 0,
      keys: keys.map((k) => ({ id: k.id, name: k.name, last4: k.last4, createdAt: k.created_at, revokedAt: k.revoked_at })),
    };
  }

  listApps(): IntegrationAppDto[] {
    return (this.db.prepare('SELECT * FROM integration_apps WHERE deleted_at IS NULL ORDER BY created_at, rowid').all() as AppRow[]).map((r) => this.appDto(r));
  }

  getApp(id: string): IntegrationAppDto {
    return this.appDto(this.appRow(id));
  }

  createApp(input: { name: string; appId: string }): IntegrationAppDto {
    if (this.db.prepare('SELECT 1 FROM integration_apps WHERE app_id = ? AND deleted_at IS NULL').get(input.appId)) {
      throw conflict(ErrorCode.CONFLICT, 'app_id đã tồn tại', { appId: input.appId });
    }
    const id = newId();
    this.db.prepare('INSERT INTO integration_apps (id, app_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, input.appId, input.name, this.ctx.nowIso());
    return this.getApp(id);
  }

  updateApp(id: string, input: { name?: string; expectedFrequency?: 'DAILY' | 'WEEKLY' | 'NONE' }): IntegrationAppDto {
    this.appRow(id);
    if (input.name !== undefined) this.db.prepare('UPDATE integration_apps SET name = ? WHERE id = ?').run(input.name, id);
    if (input.expectedFrequency !== undefined) this.db.prepare('UPDATE integration_apps SET expected_frequency = ? WHERE id = ?').run(input.expectedFrequency, id);
    return this.getApp(id);
  }

  /** Xóa mềm: thu hồi mọi key, giữ lịch sử sự kiện. */
  deleteApp(id: string): { deleted: true } {
    this.appRow(id);
    const now = this.ctx.nowIso();
    this.db.prepare('UPDATE integration_keys SET revoked_at = ? WHERE app_ref = ? AND revoked_at IS NULL').run(now, id);
    this.db.prepare('UPDATE integration_apps SET deleted_at = ? WHERE id = ?').run(now, id);
    return { deleted: true };
  }

  /** Key dạng pph_<32 base62>, chỉ trả về một lần; DB lưu sha256 + 4 ký tự cuối. */
  createKey(appRef: string, input: { name: string }): CreatedKeyDto {
    this.appRow(appRef);
    const key = `pph_${randomBase62(32)}`;
    const id = newId();
    const last4 = key.slice(-4);
    this.db.prepare('INSERT INTO integration_keys (id, app_ref, name, key_hash, last4, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, appRef, input.name, sha256(key), last4, this.ctx.nowIso());
    return { id, name: input.name, key, last4 };
  }

  revokeKey(id: string): { revoked: true } {
    const r = this.db.prepare('SELECT id FROM integration_keys WHERE id = ?').get(id);
    if (!r) throw notFound('API key');
    this.db.prepare('UPDATE integration_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(this.ctx.nowIso(), id);
    return { revoked: true };
  }

  // ================= F-32 Rules =================

  private ruleRow(id: string): RuleRow {
    const r = this.db.prepare('SELECT * FROM integration_rules WHERE id = ? AND deleted_at IS NULL').get(id) as RuleRow | undefined;
    if (!r) throw notFound('Quy tắc');
    return r;
  }

  private ruleDto(r: RuleRow): RuleDto {
    const app = this.db.prepare('SELECT name FROM integration_apps WHERE id = ?').get(r.app_ref) as { name: string } | undefined;
    const goal = this.db.prepare('SELECT title FROM goals WHERE id = ?').get(r.goal_id) as { title: string } | undefined;
    return {
      id: r.id, appRef: r.app_ref, appName: app?.name ?? '', eventType: r.event_type, goalId: r.goal_id, goalTitle: goal?.title ?? '',
      mode: r.mode, field: r.field, factor: r.factor, fixed: r.fixed, defaultDurationMinutes: r.default_duration, enabled: !!r.enabled,
    };
  }

  listRules(appRef?: string): RuleDto[] {
    const rows = (appRef
      ? this.db.prepare('SELECT * FROM integration_rules WHERE deleted_at IS NULL AND app_ref = ? ORDER BY created_at, rowid').all(appRef)
      : this.db.prepare('SELECT * FROM integration_rules WHERE deleted_at IS NULL ORDER BY created_at, rowid').all()) as RuleRow[];
    return rows.map((r) => this.ruleDto(r));
  }

  getRule(id: string): RuleDto {
    return this.ruleDto(this.ruleRow(id));
  }

  private normalizeRule(i: RuleInput): { field: string | null; factor: number | null; fixed: number | null } {
    this.appRow(i.appRef);
    if (!this.db.prepare('SELECT 1 FROM goals WHERE id = ? AND deleted_at IS NULL').get(i.goalId)) throw notFound('Goal');
    if (i.mode === 'PER_UNIT') {
      if (!i.field) throw validation('PER_UNIT cần trường số', { fields: ['field'] });
      if (i.factor == null || i.factor <= 0) throw validation('Hệ số phải > 0', { fields: ['factor'] });
      if (Math.abs(i.factor * 100 - Math.round(i.factor * 100)) > 1e-9) throw validation('Hệ số tối đa 2 chữ số thập phân', { fields: ['factor'] });
      return { field: i.field, factor: i.factor, fixed: null };
    }
    if (i.fixed == null) throw validation('FIXED cần giá trị cố định', { fields: ['fixed'] });
    return { field: null, factor: null, fixed: i.fixed };
  }

  private assertUniqueRule(appRef: string, eventType: string, exceptId?: string) {
    const dup = this.db.prepare('SELECT id FROM integration_rules WHERE app_ref = ? AND event_type = ? AND deleted_at IS NULL').get(appRef, eventType) as
      | { id: string } | undefined;
    if (dup && dup.id !== exceptId) throw conflict(ErrorCode.CONFLICT, 'Đã có quy tắc cho (app, event_type) này', { ruleId: dup.id });
  }

  createRule(i: RuleInput): RuleDto {
    const n = this.normalizeRule(i);
    this.assertUniqueRule(i.appRef, i.eventType);
    const id = newId();
    const now = this.ctx.nowIso();
    this.db
      .prepare(
        `INSERT INTO integration_rules (id, app_ref, event_type, goal_id, mode, field, factor, fixed, default_duration, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, i.appRef, i.eventType, i.goalId, i.mode, n.field, n.factor, n.fixed, i.defaultDurationMinutes, i.enabled === false ? 0 : 1, now, now);
    return this.getRule(id);
  }

  updateRule(id: string, patch: Partial<RuleInput>): RuleDto {
    const cur = this.getRule(id);
    const merged: RuleInput = {
      appRef: patch.appRef ?? cur.appRef, eventType: patch.eventType ?? cur.eventType, goalId: patch.goalId ?? cur.goalId,
      mode: patch.mode ?? cur.mode, field: patch.field !== undefined ? patch.field : cur.field,
      factor: patch.factor !== undefined ? patch.factor : cur.factor, fixed: patch.fixed !== undefined ? patch.fixed : cur.fixed,
      defaultDurationMinutes: patch.defaultDurationMinutes ?? cur.defaultDurationMinutes, enabled: patch.enabled ?? cur.enabled,
    };
    const n = this.normalizeRule(merged);
    this.assertUniqueRule(merged.appRef, merged.eventType, id);
    this.db
      .prepare(
        `UPDATE integration_rules SET app_ref = ?, event_type = ?, goal_id = ?, mode = ?, field = ?, factor = ?, fixed = ?, default_duration = ?,
           enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(merged.appRef, merged.eventType, merged.goalId, merged.mode, n.field, n.factor, n.fixed, merged.defaultDurationMinutes,
        merged.enabled ? 1 : 0, this.ctx.nowIso(), id);
    return this.getRule(id);
  }

  deleteRule(id: string): { deleted: true } {
    this.ruleRow(id);
    this.db.prepare('UPDATE integration_rules SET deleted_at = ? WHERE id = ?').run(this.ctx.nowIso(), id);
    return { deleted: true };
  }

  // ================= F-31 Event history =================

  private eventRow(id: string): EventRow {
    const r = this.db.prepare('SELECT * FROM integration_events WHERE event_id = ?').get(id) as EventRow | undefined;
    if (!r) throw notFound('Sự kiện');
    return r;
  }

  private eventDto(r: EventRow): IntegrationEventDto {
    const app = this.db.prepare('SELECT name FROM integration_apps WHERE id = ?').get(r.app_ref) as { name: string } | undefined;
    const xp = r.xp_transaction_id
      ? (this.db.prepare('SELECT lifetime_delta FROM xp_transactions WHERE id = ?').get(r.xp_transaction_id) as { lifetime_delta: number } | undefined)?.lifetime_delta ?? null
      : null;
    return {
      eventId: r.event_id, appRef: r.app_ref, appName: app?.name ?? '', eventType: r.event_type, occurredAt: r.occurred_at, receivedAt: r.received_at,
      status: r.status, reason: r.reason, contribution: r.contribution, goalId: r.goal_id, xp, payload: JSON.parse(r.payload),
    };
  }

  getEvent(id: string): IntegrationEventDto {
    return this.eventDto(this.eventRow(id));
  }

  /** Lọc theo app, trạng thái (có thể nhiều, phẩy), event_type, khoảng occurred_at. Mặc định ẩn heartbeat. */
  listEvents(f: EventFilters = {}): { items: IntegrationEventDto[]; total: number } {
    const where: string[] = [];
    const args: unknown[] = [];
    if (f.appRef) { where.push('app_ref = ?'); args.push(f.appRef); }
    if (f.status) {
      const st = f.status.split(',').filter(Boolean);
      where.push(`status IN (${st.map(() => '?').join(',')})`); args.push(...st);
    }
    if (f.eventType) { where.push('event_type = ?'); args.push(f.eventType); }
    else if (!f.includeHeartbeat) { where.push('event_type <> ?'); args.push(HEARTBEAT); }
    if (f.from) { where.push('occurred_at >= ?'); args.push(this.toIso(f.from, false)); }
    if (f.to) { where.push('occurred_at <= ?'); args.push(this.toIso(f.to, true)); }
    const sql = `SELECT * FROM integration_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY occurred_at DESC, rowid DESC LIMIT 500`;
    const items = (this.db.prepare(sql).all(...args) as EventRow[]).map((r) => this.eventDto(r));
    return { items, total: items.length };
  }

  private toIso(v: string, end: boolean): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const r = dayRangeUtc(v, this.ctx.tz());
      return end ? new Date(Date.parse(r.end) - 1).toISOString() : new Date(Date.parse(r.start)).toISOString();
    }
    const ms = Date.parse(v);
    if (Number.isNaN(ms)) throw validation('Thời gian không hợp lệ', { value: v });
    return new Date(ms).toISOString();
  }
}

