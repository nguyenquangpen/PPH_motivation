CREATE TABLE task_sessions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'HUB',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX ix_sessions_task ON task_sessions(task_id);
CREATE INDEX ix_sessions_start ON task_sessions(start);

CREATE TABLE calendar_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL, account_email TEXT,
  error TEXT, error_since TEXT, last_success_at TEXT, tokens_enc TEXT,
  busy_calendar_ids TEXT NOT NULL DEFAULT '["primary"]', sync_tokens TEXT NOT NULL DEFAULT '{}', last_pull_at TEXT);
INSERT INTO calendar_connection (id, status) VALUES (1, 'NOT_CONNECTED');

CREATE TABLE calendar_mappings (
  session_id TEXT PRIMARY KEY, account_email TEXT NOT NULL, event_id TEXT,
  status TEXT NOT NULL, pending_op TEXT,
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error TEXT, synced_at TEXT);

CREATE TABLE calendar_events_cache (
  event_id TEXT NOT NULL, calendar_id TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  all_day INTEGER NOT NULL, transparency TEXT NOT NULL, declined INTEGER NOT NULL, hub_session_id TEXT, title TEXT,
  PRIMARY KEY (calendar_id, event_id));

CREATE TABLE schedule_acceptances (
  kind TEXT NOT NULL, ref TEXT NOT NULL, signature TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (kind, ref));

CREATE TABLE integration_apps (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, name TEXT NOT NULL,
  expected_frequency TEXT NOT NULL DEFAULT 'DAILY', last_activity_at TEXT, last_heartbeat_at TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_app_id ON integration_apps(app_id) WHERE deleted_at IS NULL;

CREATE TABLE integration_keys (
  id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);

CREATE TABLE integration_rules (
  id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, event_type TEXT NOT NULL, goal_id TEXT NOT NULL,
  mode TEXT NOT NULL, field TEXT, factor REAL, fixed INTEGER, default_duration INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_rule ON integration_rules(app_ref, event_type) WHERE deleted_at IS NULL;

CREATE TABLE integration_events (
  event_id TEXT PRIMARY KEY, app_ref TEXT NOT NULL, event_type TEXT NOT NULL,
  payload TEXT NOT NULL, payload_hash TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
  status TEXT NOT NULL, reason TEXT, contribution INTEGER, xp_transaction_id TEXT, contribution_entry_id TEXT,
  pool_entry_id TEXT, goal_id TEXT, processed_at TEXT, is_activity INTEGER NOT NULL);
CREATE INDEX ix_ievents_app ON integration_events(app_ref, occurred_at);

UPDATE missed_reason_tags SET is_system = 1, system_code = 'SCHEDULE_INFEASIBLE'
  WHERE name_norm = 'lịch quá tải/assistant đề xuất sai' AND deleted_at IS NULL;
