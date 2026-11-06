import Database from 'better-sqlite3';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

/** Mặc định: thư mục migrations cạnh source. Bản đóng gói (bundle CJS) truyền migrationsDir hoặc PPH_MIGRATIONS_DIR. */
const defaultMigrationsDir = (): string =>
  process.env.PPH_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function openDb(path: string, opts: { migrationsDir?: string } = {}): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');
  migrate(db, opts.migrationsDir ?? defaultMigrationsDir());
  return db;
}

export function migrate(db: DB, migrationsDir: string = defaultMigrationsDir()): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    })();
  }
}

/** Chạy fn trong transaction; lồng nhau an toàn (better-sqlite3 dùng savepoint). */
export function tx<T>(db: DB, fn: () => T): T {
  return db.transaction(fn)();
}
