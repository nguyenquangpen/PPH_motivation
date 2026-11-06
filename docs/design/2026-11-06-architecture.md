# Personal Productivity Hub — Technical Design (Release 1)

> Nguồn yêu cầu: `docs/requirements/2026-11-05-personal-productivity-hub-prd.md` (Approved).
> Acceptance: `docs/requirements/2026-11-05-personal-productivity-hub-bdd/*.json`.
> Tài liệu này là **contract chung** cho mọi người/Agent triển khai. Thay đổi contract phải cập nhật file này trước.

---

## 1. Tech Stack

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (strict) | Một ngôn ngữ cho server, web, shared types |
| Runtime | Node.js ≥ 22 (máy dev: 24) | |
| Monorepo | npm workspaces | Không cần công cụ thêm |
| Server | Fastify 5 | Nhẹ, schema validation |
| Validation / DTO | zod (trong `packages/shared`) | Dùng chung server + web |
| DB | SQLite qua `better-sqlite3` | Local, 1 file, transaction đồng bộ đơn giản, backup bằng `db.backup()` |
| Thời gian / múi giờ | `luxon` | Hỗ trợ IANA timezone |
| Web | React 18 + Vite + React Router + TanStack Query + Tailwind | |
| Test | Vitest (server + web), React Testing Library (web) | |

## 2. Cấu trúc thư mục

```
/
├─ package.json                 # workspaces, scripts tổng
├─ tsconfig.base.json
├─ packages/shared/src/
│   ├─ enums.ts                 # TaskStatus, GoalStatus, Priority, XpTxType, ...
│   ├─ dto/*.ts                 # zod schema request/response theo module
│   └─ errors.ts                # ErrorCode
├─ apps/server/src/
│   ├─ main.ts                  # khởi động: migrate → catch-up jobs → listen 127.0.0.1
│   ├─ app.ts                   # buildApp({ db, clock }) — dùng cho test
│   ├─ core/
│   │   ├─ db.ts                # mở DB, migrate, transaction helper
│   │   ├─ clock.ts             # Clock interface (SystemClock, FixedClock cho test)
│   │   ├─ ids.ts               # uuid
│   │   ├─ time.ts              # luxon helpers: localDate(), endOfLocalDay(), ...
│   │   ├─ errors.ts            # DomainError(code, message, details, httpStatus)
│   │   ├─ idempotency.ts       # withOperation(key, fn)
│   │   ├─ events.ts            # EventBus đồng bộ, chạy trong cùng transaction
│   │   ├─ scheduler.ts         # tick mỗi 60s + catch-up khi khởi động
│   │   └─ backup.ts
│   ├─ migrations/NNN_*.sql
│   └─ modules/
│       ├─ settings/            # F-10
│       ├─ ledger/              # F-09, contribution ledger, pool ledger (CORE)
│       ├─ xp/                  # F-07 công thức, F-08 pool (CORE)
│       ├─ tasks/               # F-05, F-06 (CORE)
│       ├─ goals/               # F-01…F-04
│       ├─ milestones/          # F-12
│       ├─ shop/                # F-11
│       ├─ penalty/             # F-15, F-16
│       ├─ streak/              # F-13, F-14
│       ├─ notifications/       # F-19
│       ├─ activity/            # F-18
│       ├─ dashboard/           # F-17 (API tổng hợp)
│       └─ index.ts             # đăng ký tất cả module (đã viết sẵn, KHÔNG sửa khi làm song song)
│   └─ test/
│       ├─ helpers.ts           # createTestApp(), FixedClock, factory dữ liệu
│       └─ bdd/fNN-*.test.ts    # mỗi file BDD JSON ↔ một file test
├─ apps/web/src/
│   ├─ api/                     # client gọi API, dùng DTO shared
│   ├─ pages/                   # Dashboard, Goals, GoalDetail, Tasks, TaskDetail, Rewards, Activity, Settings
│   └─ components/
├─ scripts/bdd-report.ts        # đọc kết quả Vitest → cập nhật passes/overallPass trong BDD JSON
└─ data/                        # hub.db, backups/ (gitignored)
```

**Quy tắc sở hữu:** mỗi module có thư mục riêng; module chỉ export qua `modules/<name>/index.ts`. Module khác **không** truy cập bảng của module khác trực tiếp — gọi service export hoặc lắng nghe event.

## 3. Quy ước chung

- **ID:** UUID v4 dạng text.
- **Thời điểm:** lưu text ISO 8601 UTC (`2026-11-06T03:00:00.000Z`). API trả ISO có offset UTC; web hiển thị theo timezone Settings.
- **Ngày lịch:** text `YYYY-MM-DD`, luôn theo timezone Owner tại thời điểm tính.
- **Thời gian hiện tại:** chỉ lấy từ `clock.now()` — không gọi `Date.now()` trong code nghiệp vụ.
- **Tiền tệ XP / Contribution:** INTEGER.
- **Soft delete:** cột `deleted_at`.
- **Transaction:** mọi request ghi chạy trong `db.transaction()`; event handlers chạy đồng bộ bên trong → all-or-nothing.
- **Idempotency:** endpoint ghi ledger nhận header `Idempotency-Key`. Bảng `operations` lưu (key, response). Gửi lại cùng key → trả response cũ, không chạy lại. Không có header → server tự sinh key (không chống trùng).
- **Lỗi:** HTTP 400 (validation), 404 (không tồn tại/đã xóa), 409 (xung đột trạng thái/trùng), 422 (vi phạm quy tắc nghiệp vụ). Body: `{ "error": { "code": "TASK_INVALID_TRANSITION", "message": "...", "details": {} } }`.
- **Bảo mật:** server `listen({ host: '127.0.0.1' })` và hook từ chối mọi `request.ip` không phải loopback.

## 4. Database Schema (migration 001)

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE operations (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE goal_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, color TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_category_name ON goal_categories(name_norm) WHERE deleted_at IS NULL;

CREATE TABLE goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, category_id TEXT NOT NULL REFERENCES goal_categories(id),
  status TEXT NOT NULL,              -- NOT_STARTED|ACTIVE|PAUSED|COMPLETED|ARCHIVED
  start_date TEXT, target_date TEXT, target_contribution INTEGER NOT NULL,
  goal_reward_xp INTEGER, icon TEXT, color TEXT,
  completed_at TEXT, completed_contribution_snapshot INTEGER, goal_reward_granted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), title TEXT NOT NULL, description TEXT,
  target_date TEXT, condition_type TEXT NOT NULL,   -- CONTRIBUTION_THRESHOLD|LINKED_TASKS
  threshold INTEGER, reward_xp INTEGER,
  status TEXT NOT NULL,                             -- PENDING|COMPLETED
  completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE missed_reason_tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, exempt INTEGER NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0, system_code TEXT,  -- 'GOAL_PAUSED'
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_tag_name ON missed_reason_tags(name_norm) WHERE deleted_at IS NULL;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  priority TEXT NOT NULL,                           -- CRITICAL|HIGH|MEDIUM|LOW
  contribution INTEGER NOT NULL, goal_id TEXT REFERENCES goals(id),
  estimated_duration INTEGER NOT NULL, actual_duration INTEGER,
  deadline TEXT,                                    -- UTC ISO
  status TEXT NOT NULL,                             -- TODO|IN_PROGRESS|COMPLETED|CANCELLED
  completed_at TEXT, missed_reason_tag_id TEXT REFERENCES missed_reason_tags(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE task_milestones (task_id TEXT NOT NULL, milestone_id TEXT NOT NULL, PRIMARY KEY (task_id, milestone_id));

CREATE TABLE task_status_history (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason TEXT, at TEXT NOT NULL);

-- Lần hoàn thành: liên kết các giao dịch để Undo đảo đúng
CREATE TABLE task_completions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, completed_at TEXT NOT NULL,
  contribution INTEGER NOT NULL, goal_id TEXT, is_small INTEGER NOT NULL,
  contribution_entry_id TEXT, xp_transaction_id TEXT, pool_entry_id TEXT,
  undone_at TEXT);

CREATE TABLE contribution_ledger (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, task_id TEXT, type TEXT NOT NULL,  -- ADD|REVERSAL
  amount INTEGER NOT NULL, reversed_entry_id TEXT UNIQUE, created_at TEXT NOT NULL);

CREATE TABLE xp_transactions (
  id TEXT PRIMARY KEY, type TEXT NOT NULL,
  -- TASK_REWARD|POOL_REWARD|MILESTONE_REWARD|GOAL_REWARD|REWARD_REVERSAL|REDEEM|REDEEM_REVERSAL|PENALTY|PENALTY_REVERSAL
  lifetime_delta INTEGER NOT NULL, spendable_delta INTEGER NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT,        -- TASK|POOL|MILESTONE|GOAL|REDEMPTION
  reversed_transaction_id TEXT UNIQUE, reason TEXT, created_at TEXT NOT NULL);

CREATE TABLE pool_ledger (
  id TEXT PRIMARY KEY, type TEXT NOT NULL,          -- ADD|DEDUCT|PAYOUT
  amount INTEGER NOT NULL, task_id TEXT, xp_transaction_id TEXT, created_at TEXT NOT NULL);

CREATE TABLE reward_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, price_xp INTEGER NOT NULL, icon TEXT,
  unlock_type TEXT,                                 -- NULL|LEVEL|MILESTONE_COMPLETED|GOAL_COMPLETED
  unlock_value TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_name TEXT NOT NULL, price_xp INTEGER NOT NULL,
  xp_transaction_id TEXT NOT NULL, reversal_transaction_id TEXT, reversed_at TEXT, created_at TEXT NOT NULL);

CREATE TABLE penalty_evaluations (
  task_id TEXT NOT NULL, deadline TEXT NOT NULL, evaluated_at TEXT NOT NULL,
  penalty_transaction_id TEXT, PRIMARY KEY (task_id, deadline));

CREATE TABLE streak_freezes (date TEXT PRIMARY KEY, month TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE checkins (date TEXT PRIMARY KEY, mood INTEGER, note TEXT, updated_at TEXT NOT NULL);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, object_type TEXT, object_id TEXT, dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, read_at TEXT, hidden_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX ix_notif_dedupe ON notifications(dedupe_key);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, message TEXT NOT NULL,
  goal_id TEXT, task_id TEXT, milestone_id TEXT, item_id TEXT,
  before_json TEXT, after_json TEXT, created_at TEXT NOT NULL);
CREATE INDEX ix_activity_created ON activity_log(created_at);
```

**Số dư dẫn xuất (không lưu):** Lifetime = Σ lifetime_delta; Spendable = Σ spendable_delta; Pool = Σ pool_ledger.amount (ADD dương, DEDUCT/PAYOUT âm); completed_contribution(goal) = Σ contribution_ledger.amount.

## 5. Domain Events (EventBus đồng bộ, trong transaction)

| Event | Payload | Phát bởi | Lắng nghe |
|---|---|---|---|
| `task.completed` | taskId, goalId, completionId | tasks | milestones, goals (100% check), notifications, activity |
| `task.undone` | taskId, goalId, completionId | tasks | milestones (reopen), goals, activity |
| `task.cancelled` | taskId, wasMissed, tagId | tasks | penalty (phạt ngay), notifications (hide), activity |
| `task.deleted` | taskId | tasks | milestones, activity |
| `task.deadline_changed` | taskId | tasks | notifications |
| `goal.contribution_changed` | goalId, before, after | ledger | goals (100%), milestones |
| `goal.target_changed` | goalId, before, after | goals | activity |
| `goal.status_changed` | goalId, from, to | goals | activity |
| `milestone.completed` / `milestone.reopened` | milestoneId | milestones | shop (lock state là dẫn xuất), notifications, activity |
| `xp.transaction_created` | tx | ledger | notifications (LEVEL_UP, POOL_REWARD), activity |
| `settings.changed` | key, before, after | settings | activity |

## 6. API Specification (`/api/v1`, JSON)

Đánh dấu **[I]** = nhận `Idempotency-Key`.

**Settings** — `GET /settings`, `PUT /settings` (partial; validate toàn bộ, lỗi → không lưu gì), `POST /settings/reset { group }`.

**Categories** — `GET /categories`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id`.

**Goals** — `GET /goals?status=`, `POST /goals`, `GET /goals/:id` (kèm progress, milestones, tasks), `PATCH /goals/:id`, `DELETE /goals/:id`, `POST /goals/:id/complete { confirmBelow100?: boolean }` **[I]**.
Progress object: `{ completedContribution, progressPercent, displayPercent, overflowContribution, remainingContribution, expectedPercent?, daysRemaining?, warnings: ('BEHIND'|'NEAR_DUE')[] }`.

**Milestones** — `GET /goals/:goalId/milestones`, `POST /goals/:goalId/milestones`, `PATCH /milestones/:id`, `DELETE /milestones/:id`.

**Tasks** — `GET /tasks?status=&goalId=&missed=&due=today`, `POST /tasks`, `GET /tasks/:id` (kèm history, expectedXp, missed, xpReceived), `PATCH /tasks/:id`, `DELETE /tasks/:id?confirm=true` **[I]**,
`POST /tasks/:id/start`, `POST /tasks/:id/complete { actualDuration? }` **[I]**, `POST /tasks/:id/undo` **[I]**, `POST /tasks/:id/cancel { reasonTagId? }` **[I]**,
`POST /tasks/:id/missed-review { reasonTagId, action: 'RESCHEDULE'|'CANCEL'|'KEEP', newDeadline? }` **[I]**.
Task expectedXp: `{ isSmall: boolean, nominalXp: number, immediateXp: number, poolContribution: number }`.

**Reasons** — `GET /missed-reasons`, `POST /missed-reasons`, `PATCH /missed-reasons/:id`, `DELETE /missed-reasons/:id`.

**XP** — `GET /xp/summary` → `{ lifetimeXp, spendableXp, level, xpPerLevel, xpToday, pool, poolTarget }`; `GET /xp/transactions?type=&from=&to=&sourceType=&page=`; `GET /xp/reconciliation`.

**Shop** — `GET /shop/items` (kèm `state: 'AVAILABLE'|'INSUFFICIENT_XP'|'LOCKED'`, `missingXp`, `lockReason`), `POST /shop/items`, `PATCH /shop/items/:id`, `DELETE /shop/items/:id`, `POST /shop/items/:id/redeem` **[I]**, `GET /shop/redemptions`, `POST /shop/redemptions/:id/undo` **[I]**.

**Streak** — `GET /streak` → `{ current, longest, freezesLeft, calendar: {date, state:'ACTIVE'|'FREEZE'|'EMPTY'}[] (84 ngày), goalStreaks: {goalId, current}[] }`.
**Check-in** — `GET /checkins?from=&to=`, `PUT /checkins/today { mood?, note? }`.

**Notifications** — `GET /notifications?unread=`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
**Activity** — `GET /activity?from=&to=&goalId=&taskId=&type=&page=` (50/trang, mới nhất trước).
**Dashboard** — `GET /dashboard` (tổng hợp F-17 trong một request).
**System** — `GET /health`, `POST /system/backup`.

## 7. Module Dependency

```
settings ◄──────────────────────────────── (mọi module đọc settings)
ledger  (xp_transactions, contribution_ledger, pool_ledger, balances)
  ▲
xp      (công thức F-07, pool F-08)  ── dùng ledger
  ▲
tasks   (lifecycle F-05/F-06)        ── dùng xp, ledger; phát events
  ▲ events
goals, milestones, penalty, streak, notifications, activity, shop  ── nghe events / gọi service export
dashboard ── chỉ đọc từ service các module
```
Không module nào ở tầng dưới import tầng trên.

## 8. Scheduler & Catch-up

`scheduler.tick(now)` chạy khi khởi động và mỗi 60 giây:
1. Missed detection → Notification TASK_MISSED (dedupe theo task+deadline).
2. TASK_DEADLINE_SOON (≤ 24h trước deadline).
3. Penalty evaluation cho task có `deadline + grace ≤ now`, chưa có dòng `penalty_evaluations(task, deadline)` → đánh giá đúng 1 lần.
4. Streak Freeze cho các ngày đã kết thúc chưa xử lý.
5. Goal warnings (1 lần/goal/ngày/loại).
6. Backup hằng ngày (giữ 14 bản).

Mọi bước idempotent → chạy lặp an toàn; test gọi `tick()` trực tiếp với FixedClock.

## 9. Kiểm thử & BDD mapping

- Mỗi file `docs/requirements/.../bdd/fNN-*.json` ↔ `apps/server/test/bdd/fNN-*.test.ts` (F-17, F-20 UI thêm `apps/web/test/bdd/`).
- Tên `it(...)` **trùng chính xác** trường `scenario` trong JSON.
- `npm run test:bdd` chạy Vitest với JSON reporter, `scripts/bdd-report.ts` cập nhật `passes` và `overallPass`; scenario không tìm thấy test → `false`.
- Test dùng DB `:memory:` + FixedClock, không phụ thuộc lẫn nhau.

## 10. Kế hoạch triển khai

| Bước | Nội dung | Người làm |
|---|---|---|
| 0 | Tài liệu này | Lead |
| 1 | Scaffold, core/*, migration, settings, ledger, xp, tasks, stub mọi module + đăng ký, test helpers, bdd-report, F-05…F-10 test | Lead (tuần tự) |
| 2 | A: goals+milestones (F-01…04, F-12, F-20) · B: shop (F-11) · C: penalty (F-15, F-16) · D: streak, checkin, notifications, activity, dashboard API (F-13, F-14, F-17, F-18, F-19) · E: web UI | 5 Agent song song trên cùng cây thư mục, sở hữu theo thư mục (không worktree: tránh cài lại deps và merge) |
| 3 | Chạy toàn bộ BDD, NFR tests, sửa lỗi tích hợp, smoke test trình duyệt, báo cáo | Lead |

### 10.1 Quyền sở hữu file khi làm song song

| Agent | Được sửa | Test BDD sở hữu |
|---|---|---|
| A | `apps/server/src/modules/goals/**`, `modules/milestones/**`, `packages/shared/src/dto/goals.ts` (chỉ thêm) | f01, f02, f03, f04, f12, f20 |
| B | `modules/shop/**`, `packages/shared/src/dto/shop.ts` (chỉ thêm) | f11 |
| C | `modules/penalty/**` | f15, f16 (+ làm pass các scenario phạt trong f06) |
| D | `modules/streak/**`, `modules/notifications/**`, `modules/activity/**`, `modules/dashboard/**`, `packages/shared/src/dto/misc.ts` (chỉ thêm) | f13, f14, f17, f18, f19 (+ scenario streak trong f06, notification trong f08/f09) |
| E | `apps/web/**` | — (UI) |
| Lead | `core/**`, `modules/{settings,ledger,xp,tasks}/**`, `modules/index.ts`, `app.ts`, `test/helpers.ts`, các file shared còn lại | f05–f10, nfr |

Không Agent nào sửa file ngoài phạm vi; cần thay đổi core → ghi rõ trong báo cáo cho Lead.
