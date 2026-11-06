import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.js';

const KEEP = 14;

/** Backup online bằng SQLite backup API vào <dir>/hub-YYYY-MM-DD.db; giữ 14 bản gần nhất. */
export async function backupDb(db: DB, dir: string, date: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `hub-${date}.db`);
  await db.backup(file);
  const files = readdirSync(dir).filter((f) => /^hub-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(dir, f));
  return file;
}

export function hasBackupFor(dir: string, date: string): boolean {
  try {
    return readdirSync(dir).includes(`hub-${date}.db`);
  } catch {
    return false;
  }
}
