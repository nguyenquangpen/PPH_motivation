# Personal Productivity Hub — Release 2 — Technical Design

> Yêu cầu: `docs/requirements/2026-11-07-pph-release-2-prd.md`; BDD: `docs/requirements/2026-11-07-pph-release-2-bdd/`.
> Bổ sung cho `docs/design/2026-11-06-architecture.md` (mọi quy ước ở đó vẫn áp dụng).

## 1. Lựa chọn công nghệ mới

| Nhu cầu | Lựa chọn | Lý do |
|---|---|---|
| Gọi Google Calendar API | `@googleapis/calendar` (chính thức, Apache-2.0) | Nhanh nhất, được Google duy trì; chỉ gói Calendar, nhẹ hơn `googleapis` đầy đủ |
| OAuth 2.0 desktop (loopback + PKCE) | `google-auth-library` (chính thức) | Tự làm mới token |
| Không dùng | Nylas / Cronofy / Zapier / n8n | Cần webhook công khai hoặc đưa dữ liệu qua bên thứ ba; Hub chỉ localhost |

Kết nối Google nằm sau interface **`CalendarProvider`** → đổi tool về sau chỉ thay một module; test dùng **`FakeCalendarProvider`** (bản giả lập trong bộ nhớ, hỗ trợ tiêm lỗi/độ trễ).

## 2. Module mới

```
apps/server/src/modules/
  sessions/        F-21  phiên làm việc của Task (bảng task_sessions)
  calendar/        F-22…F-25, F-34
    provider.ts        interface CalendarProvider + kiểu dữ liệu
    fake-provider.ts   FakeCalendarProvider (dùng cho test, cũng export cho e2e)
    google-provider.ts Google qua @googleapis/calendar + google-auth-library
    secret-store.ts    SecretStore (mã hóa token)
    service.ts         kết nối, mapping, outbox đẩy, đọc thay đổi, giờ bận
  scheduling/      F-26…F-29 giờ làm việc, gợi ý, cảnh báo, công bằng phạt
  integrations/    F-30…F-33 API sự kiện, app, key, quy tắc, xử lý
```

`buildApp(db, clock, opts?)` nhận thêm `opts.calendarProvider` và `opts.secretStore` (mặc định: Google + key file). Test truyền Fake.

## 3. Interface CalendarProvider (tóm tắt)

```ts
interface CalendarProvider {
  /** URL đăng nhập + hoàn tất OAuth (loopback). Fake: trả tài khoản giả ngay. */
  connect(): Promise<{ accountEmail: string; tokens: string /* JSON, sẽ được mã hóa */ }>;
  useTokens(tokens: string | null): void;
  listCalendars(): Promise<{ id: string; name: string; primary: boolean }[]>;
  createEvent(input: EventInput): Promise<ProviderEvent>;           // EventInput có privateKey pphSessionId
  updateEvent(eventId: string, input: EventInput): Promise<ProviderEvent>;
  deleteEvent(eventId: string): Promise<void>;                       // NotFound → ném ProviderNotFound
  findHubEvent(sessionId: string): Promise<ProviderEvent | null>;    // tìm theo extendedProperties.private.pphSessionId
  listChanges(calendarId: string, syncToken: string | null, window: { from: string; to: string }):
    Promise<{ events: ProviderEvent[]; nextSyncToken: string; fullResync: boolean }>;
}
type ProviderEvent = { id; calendarId; start; end; allDay; status: 'confirmed'|'cancelled';
  transparency: 'opaque'|'transparent'; declinedBySelf: boolean; title; hubSessionId: string | null; recurringInstance: boolean };
```
Lỗi chuẩn hóa: `ProviderAuthError` (→ ERROR "Cần kết nối lại"), `ProviderTransientError` (mạng/429/5xx → retry), `ProviderNotFound`.

## 4. Database — migration `002_release2.sql`

```sql
CREATE TABLE task_sessions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'HUB', -- HUB | LINKED (F-34)
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX ix_sessions_task ON task_sessions(task_id); CREATE INDEX ix_sessions_start ON task_sessions(start);

CREATE TABLE calendar_connection (id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL, account_email TEXT,
  error TEXT, error_since TEXT, last_success_at TEXT, tokens_enc TEXT, busy_calendar_ids TEXT NOT NULL DEFAULT '["primary"]',
  sync_tokens TEXT NOT NULL DEFAULT '{}', last_pull_at TEXT);

CREATE TABLE calendar_mappings (session_id TEXT PRIMARY KEY, account_email TEXT NOT NULL, event_id TEXT,
  status TEXT NOT NULL,            -- PENDING | SYNCED | ERROR | DETACHED | INACTIVE
  pending_op TEXT,                 -- CREATE | UPDATE | DELETE | NULL
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT, synced_at TEXT);

CREATE TABLE calendar_events_cache (event_id TEXT NOT NULL, calendar_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  all_day INTEGER NOT NULL, transparency TEXT NOT NULL, declined INTEGER NOT NULL, hub_session_id TEXT, title TEXT,
  PRIMARY KEY (calendar_id, event_id));

CREATE TABLE schedule_acceptances (kind TEXT NOT NULL, ref TEXT NOT NULL, signature TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (kind, ref));        -- kind TASK (ref task_id) | DAY (ref YYYY-MM-DD); signature thay đổi → hết hiệu lực

CREATE TABLE integration_apps (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, name TEXT NOT NULL,
  expected_frequency TEXT NOT NULL DEFAULT 'DAILY', last_activity_at TEXT, last_heartbeat_at TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_app_id ON integration_apps(app_id) WHERE deleted_at IS NULL;
CREATE TABLE integration_keys (id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE integration_rules (id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, event_type TEXT NOT NULL, goal_id TEXT NOT NULL,
  mode TEXT NOT NULL, field TEXT, factor REAL, fixed INTEGER, default_duration INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_rule ON integration_rules(app_ref, event_type) WHERE deleted_at IS NULL;
CREATE TABLE integration_events (event_id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, event_type TEXT NOT NULL,
  payload TEXT NOT NULL, payload_hash TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
  status TEXT NOT NULL,            -- RECEIVED | PROCESSED | IGNORED | FAILED
  reason TEXT, contribution INTEGER, xp_transaction_id TEXT, contribution_entry_id TEXT, pool_entry_id TEXT, goal_id TEXT,
  processed_at TEXT, is_activity INTEGER NOT NULL);
CREATE INDEX ix_ievents_app ON integration_events(app_ref, occurred_at);

-- Lý do "Lịch quá tải/Assistant đề xuất sai" trở thành tag hệ thống (F-29)
UPDATE missed_reason_tags SET is_system = 1, system_code = 'SCHEDULE_INFEASIBLE'
  WHERE name_norm = 'lịch quá tải/assistant đề xuất sai' AND deleted_at IS NULL;
```
Giờ làm việc và ngưỡng cảnh báo: thêm vào Settings (`workingHours`, `insufficientMinMinutes`, `insufficientMinPercent`, `overloadPercent`).

## 5. Điểm nối với Release 1 (Lead làm trước)

| Điểm | Thay đổi |
|---|---|
| `XpSourceType` | + `INTEGRATION_EVENT` |
| `NotificationType` | + `CALENDAR_SYNC_ERROR`, `CALENDAR_EVENT_DELETED`, `EXTERNAL_APP_INACTIVE` |
| Events | + `task.content_changed` (tiêu đề/Goal/Priority/Contribution đổi), `session.changed` {sessionId, taskId, op}, `integration.event_processed` |
| Streak | ngày hoạt động = task_completions **∪** integration_events PROCESSED có `is_activity`, theo `occurred_at` (StreakService gọi `activityDates()` hợp nhất) |
| Penalty | trước khi phạt hỏi `ctx.services.scheduling.isInfeasible(taskId)` → gán tag `SCHEDULE_INFEASIBLE` (F-29) |
| Ledger | nguồn `INTEGRATION_EVENT`; contribution_ledger.task_id = null cho sự kiện |
| Settings | 4 khóa mới (mục 4) |

## 6. Đồng bộ (calendar)

- **Đẩy:** mọi thay đổi phiên/Task → cập nhật `calendar_mappings.pending_op` trong cùng transaction (gộp: CREATE+UPDATE=CREATE; CREATE+DELETE=xóa mapping; UPDATE+DELETE=DELETE). Worker `calendar.push` chạy mỗi 10 giây + được "đánh thức" sau commit; xử lý mapping có `next_attempt_at ≤ now`. Trước khi CREATE lại sau một lần thất bại không rõ kết quả → `findHubEvent(sessionId)` để không tạo trùng.
- **Đọc:** job `calendar.pull` mỗi 5 phút + khi khởi động + `POST /api/v1/calendar/sync` (UI gọi khi focus, giới hạn 1 lần/phút). Dùng `syncToken` theo từng lịch; `fullResync` → tải lại cửa sổ [now − 1 ngày, now + 30 ngày].
- **Google thắng:** Event của Hub đổi giờ → cập nhật phiên, xóa `pending_op` UPDATE còn treo. Event bị xóa/cả ngày/chuyển lịch → phiên bị gỡ, mapping DETACHED, Notification.
- **Lỗi:** backoff 30 s × 2^n tối đa 15 phút; `error_since` ≥ 30 phút → `ERROR` + `CALENDAR_SYNC_ERROR` (dedupe theo `error_since`).

## 7. API mới (`/api/v1`)

- Sessions: `GET/POST /tasks/:id/sessions`, `PATCH/DELETE /sessions/:id`.
- Calendar: `GET /calendar/status`, `POST /calendar/connect`, `POST /calendar/disconnect`, `GET /calendar/calendars`, `PUT /calendar/busy-calendars`, `POST /calendar/sync`, `GET /calendar/busy?from&to`, `POST /tasks/:id/sessions/link {eventId}` (F-34), `GET /calendar/events?from&to` (chọn Event để liên kết).
- Scheduling: `GET/PUT /scheduling/working-hours`, `GET /tasks/:id/suggestions`, `POST /tasks/:id/suggestions/apply {option}`, `GET /scheduling/warnings`, `POST /scheduling/accept {kind, ref}`.
- Integrations: `POST /integrations/events` (Bearer key), `GET/POST/PATCH/DELETE /integrations/apps`, `POST /integrations/apps/:id/keys`, `DELETE /integrations/keys/:id`, `GET/POST/PATCH/DELETE /integrations/rules`, `GET /integrations/events?…`, `POST /integrations/events/:id/retry`, `POST /integrations/rules/:id/apply-ignored`.

## 8. Phân công (song song, cùng cây thư mục)

| Agent | Sở hữu | BDD |
|---|---|---|
| A — Scheduling | `modules/sessions/**`, `modules/scheduling/**` | f21, f26, f27, f28, f29 |
| B — Calendar | `modules/calendar/**` | f22, f23, f24, f25, f34, nfr (calendar) |
| C — Integrations | `modules/integrations/**` | f30, f31, f32, f33, nfr (integration) |
| D — Web UI | `apps/web/**` | — |
| Lead | core, migration, shared, Release 1 modules, helpers | tích hợp + E2E |
