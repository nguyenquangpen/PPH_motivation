import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { Settings, TaskDto } from '@pph/shared';
import { buildApp } from '../src/app.js';
import type { AppOptions } from '../src/core/context.js';
import { FixedClock } from '../src/core/clock.js';
import { openDb } from '../src/core/db.js';
import { newId } from '../src/core/ids.js';
import { normName } from '../src/core/seed.js';

const REQ_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'requirements');
/** Các thư mục BDD theo release; file được tìm lần lượt. */
const BDD_DIRS = ['2026-11-05-personal-productivity-hub-bdd', '2026-11-07-pph-release-2-bdd'].map((d) => join(REQ_DIR, d));

/**
 * scenario(name, fn): như it(), nhưng tên PHẢI tồn tại chính xác trong file BDD JSON
 * (bdd-report khớp theo tên). Sai tên → test fail ngay khi load.
 */
export function bdd(file: string) {
  const dir = BDD_DIRS.find((d) => existsSync(join(d, file)));
  if (!dir) throw new Error(`Không tìm thấy file BDD ${file}`);
  const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { bdd: { scenario: string }[] }[];
  const names = new Set(data.flatMap((f) => f.bdd.map((s) => s.scenario)));
  return (name: string, fn: () => void | Promise<void>, timeoutMs?: number) => {
    if (!names.has(name)) throw new Error(`Scenario không có trong ${file}: "${name}"`);
    it(name, fn, timeoutMs);
  };
}

export const DEFAULT_NOW = '2026-11-06T03:00:00.000Z'; // 10:00 Asia/Ho_Chi_Minh

export type Res<T = any> = { status: number; body: T };

export function createTestApp(nowIso: string = DEFAULT_NOW, options: AppOptions = {}) {
  const db = openDb(':memory:');
  const clock = new FixedClock(nowIso);
  const { app, ctx } = buildApp(db, clock, options);

  const call = async <T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown,
    headers: Record<string, string> = {}, remoteAddress?: string): Promise<Res<T>> => {
    const r = await app.inject({ method, url, payload: body as any, headers, ...(remoteAddress ? { remoteAddress } : {}) });
    return { status: r.statusCode, body: r.body ? (r.json() as T) : (undefined as T) };
  };

  const api = {
    call,
    get: <T = any>(url: string) => call<T>('GET', url),
    post: <T = any>(url: string, body?: unknown, key?: string) => call<T>('POST', url, body ?? {}, key ? { 'idempotency-key': key } : {}),
    put: <T = any>(url: string, body?: unknown) => call<T>('PUT', url, body),
    patch: <T = any>(url: string, body?: unknown) => call<T>('PATCH', url, body),
    del: <T = any>(url: string, key?: string) => call<T>('DELETE', url, undefined, key ? { 'idempotency-key': key } : {}),
  };

  const s = ctx.services;
  const now = () => ctx.nowIso();

  /** Factory ghi thẳng DB/qua service để dựng trạng thái Given nhanh, không phụ thuộc module chưa làm. */
  const f = {
    settings: (patch: Partial<Settings>) => db.transaction(() => s.settings.update(patch))(),
    categoryId: (name = 'Education') =>
      (db.prepare('SELECT id FROM goal_categories WHERE name_norm = ? AND deleted_at IS NULL').get(normName(name)) as { id: string }).id,
    tagId: (name: string) =>
      (db.prepare('SELECT id FROM missed_reason_tags WHERE name_norm = ? AND deleted_at IS NULL').get(normName(name)) as { id: string }).id,
    goal: (o: { title?: string; target?: number; status?: string; startDate?: string | null; targetDate?: string | null; goalRewardXp?: number | null } = {}) => {
      const id = newId();
      db.prepare(
        `INSERT INTO goals (id, title, category_id, status, start_date, target_date, target_contribution, goal_reward_xp, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, o.title ?? 'Goal G', f.categoryId(), o.status ?? 'ACTIVE', o.startDate ?? null, o.targetDate ?? null, o.target ?? 1000,
        o.goalRewardXp ?? null, now(), now());
      return id;
    },
    milestone: (goalId: string, o: { title?: string; conditionType?: string; threshold?: number | null; rewardXp?: number | null; status?: string } = {}) => {
      const id = newId();
      db.prepare(
        `INSERT INTO milestones (id, goal_id, title, condition_type, threshold, reward_xp, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, goalId, o.title ?? 'Milestone M', o.conditionType ?? 'CONTRIBUTION_THRESHOLD', o.threshold ?? 500, o.rewardXp ?? null,
        o.status ?? 'PENDING', now(), now());
      return id;
    },
    /** Tạo Task qua service (deadline phải ở tương lai). */
    task: (o: { title?: string; contribution?: number; estimated?: number; goalId?: string | null; priority?: string; deadline?: string | null; milestoneIds?: string[] } = {}): TaskDto =>
      db.transaction(() =>
        s.tasks.create({
          title: o.title ?? 'Task T', priority: (o.priority ?? 'MEDIUM') as any, contribution: o.contribution ?? 100,
          estimatedDuration: o.estimated ?? 60, goalId: o.goalId ?? null, deadline: o.deadline ?? null, milestoneIds: o.milestoneIds,
        }),
      )(),
    /** Ghi thẳng một Task với deadline tùy ý (kể cả quá khứ) — dùng cho kịch bản Missed. */
    taskRaw: (o: { title?: string; contribution?: number; estimated?: number; goalId?: string | null; status?: string; deadline?: string | null; reasonTagId?: string | null } = {}) => {
      const id = newId();
      db.prepare(
        `INSERT INTO tasks (id, title, priority, contribution, goal_id, estimated_duration, deadline, status, missed_reason_tag_id, created_at, updated_at)
         VALUES (?, ?, 'MEDIUM', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, o.title ?? 'Task T', o.contribution ?? 100, o.goalId ?? null, o.estimated ?? 60, o.deadline ?? null, o.status ?? 'TODO',
        o.reasonTagId ?? null, now(), now());
      db.prepare("INSERT INTO task_status_history (id, task_id, from_status, to_status, at) VALUES (?, ?, NULL, ?, ?)").run(newId(), id, o.status ?? 'TODO', now());
      return id;
    },
    complete: (taskId: string, actualDuration?: number) => db.transaction(() => s.tasks.complete(taskId, { actualDuration }))(),
    undo: (taskId: string) => db.transaction(() => s.tasks.undo(taskId))(),
    start: (taskId: string) => db.transaction(() => s.tasks.start(taskId))(),
    xp: (type: 'TASK_REWARD' | 'PENALTY' | 'REDEEM' | 'GOAL_REWARD' | 'MILESTONE_REWARD' | 'POOL_REWARD', amount: number, sourceType: any = 'TASK', sourceId: string | null = null) =>
      db.transaction(() => s.ledger.addXp({ type, amount, sourceType, sourceId }))()!,
    /** Đặt Lifetime/Spendable về giá trị mong muốn bằng giao dịch (GOAL_REWARD + PENALTY). */
    balances: (lifetime: number, spendable: number) => {
      if (lifetime > 0) f.xp('GOAL_REWARD', lifetime, 'GOAL', null);
      const diff = lifetime - spendable;
      if (diff > 0) f.xp('PENALTY', diff, 'TASK', null);
    },
    pool: (value: number) => {
      if (value !== 0) db.prepare("INSERT INTO pool_ledger (id, type, amount, created_at) VALUES (?, 'ADD', ?, ?)").run(newId(), value, now());
    },
    count: (sql: string, ...args: unknown[]) => (db.prepare(`SELECT COUNT(*) c FROM ${sql}`).get(...args) as { c: number }).c,
    xpTx: (type?: string) =>
      (type
        ? db.prepare('SELECT * FROM xp_transactions WHERE type = ? ORDER BY rowid').all(type)
        : db.prepare('SELECT * FROM xp_transactions ORDER BY rowid').all()) as { id: string; type: string; lifetime_delta: number; spendable_delta: number; source_id: string | null; reversed_transaction_id: string | null }[],
    activity: () => (db.prepare('SELECT * FROM activity_log ORDER BY rowid').all() as { type: string; message: string; before_json: string | null; after_json: string | null; goal_id: string | null }[]),
    tick: () => ctx.scheduler.tick(ctx.nowIso()),
  };

  return { app, ctx, db, clock, api, f, s };
}

export type TestApp = ReturnType<typeof createTestApp>;
