CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE operations (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE goal_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, color TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_category_name ON goal_categories(name_norm) WHERE deleted_at IS NULL;

CREATE TABLE goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  category_id TEXT NOT NULL REFERENCES goal_categories(id),
  status TEXT NOT NULL,
  start_date TEXT, target_date TEXT, target_contribution INTEGER NOT NULL,
  goal_reward_xp INTEGER, icon TEXT, color TEXT,
  completed_at TEXT, completed_contribution_snapshot INTEGER, goal_reward_granted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), title TEXT NOT NULL, description TEXT,
  target_date TEXT, condition_type TEXT NOT NULL,
  threshold INTEGER, reward_xp INTEGER,
  status TEXT NOT NULL,
  completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE missed_reason_tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, exempt INTEGER NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0, system_code TEXT,
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE UNIQUE INDEX ux_tag_name ON missed_reason_tags(name_norm) WHERE deleted_at IS NULL;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  priority TEXT NOT NULL,
  contribution INTEGER NOT NULL, goal_id TEXT REFERENCES goals(id),
  estimated_duration INTEGER NOT NULL, actual_duration INTEGER,
  deadline TEXT,
  status TEXT NOT NULL,
  completed_at TEXT, missed_reason_tag_id TEXT REFERENCES missed_reason_tags(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX ix_tasks_status ON tasks(status);
CREATE INDEX ix_tasks_goal ON tasks(goal_id);

CREATE TABLE task_milestones (task_id TEXT NOT NULL, milestone_id TEXT NOT NULL, PRIMARY KEY (task_id, milestone_id));

CREATE TABLE task_status_history (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason TEXT, at TEXT NOT NULL);
CREATE INDEX ix_task_history ON task_status_history(task_id);

CREATE TABLE task_completions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, completed_at TEXT NOT NULL,
  contribution INTEGER NOT NULL, goal_id TEXT, is_small INTEGER NOT NULL,
  contribution_entry_id TEXT, xp_transaction_id TEXT, pool_entry_id TEXT,
  undone_at TEXT);
CREATE INDEX ix_completions_task ON task_completions(task_id);

CREATE TABLE contribution_ledger (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, task_id TEXT, type TEXT NOT NULL,
  amount INTEGER NOT NULL, reversed_entry_id TEXT UNIQUE, created_at TEXT NOT NULL);
CREATE INDEX ix_contrib_goal ON contribution_ledger(goal_id);

CREATE TABLE xp_transactions (
  id TEXT PRIMARY KEY, type TEXT NOT NULL,
  lifetime_delta INTEGER NOT NULL, spendable_delta INTEGER NOT NULL,
  source_type TEXT NOT NULL, source_id TEXT,
  reversed_transaction_id TEXT UNIQUE, reason TEXT, created_at TEXT NOT NULL);
CREATE INDEX ix_xp_created ON xp_transactions(created_at);
CREATE INDEX ix_xp_source ON xp_transactions(source_type, source_id);

CREATE TABLE pool_ledger (
  id TEXT PRIMARY KEY, type TEXT NOT NULL,
  amount INTEGER NOT NULL, task_id TEXT, xp_transaction_id TEXT, created_at TEXT NOT NULL);

CREATE TABLE reward_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, price_xp INTEGER NOT NULL, icon TEXT,
  unlock_type TEXT, unlock_value TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);

CREATE TABLE redemptions (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL, item_name TEXT NOT NULL, price_xp INTEGER NOT NULL,
  xp_transaction_id TEXT NOT NULL, reversal_transaction_id TEXT, reversed_at TEXT, created_at TEXT NOT NULL);

CREATE TABLE penalty_evaluations (
  task_id TEXT NOT NULL, deadline TEXT NOT NULL, evaluated_at TEXT NOT NULL,
  penalty_transaction_id TEXT, PRIMARY KEY (task_id, deadline));

CREATE TABLE streak_freezes (date TEXT PRIMARY KEY, month TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE streak_processed_days (date TEXT PRIMARY KEY, processed_at TEXT NOT NULL);

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

