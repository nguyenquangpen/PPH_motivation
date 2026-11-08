import type { DB } from './db.js';

/**
 * Chạy fn đúng một lần cho mỗi operation key. Gọi lại với cùng key trả về kết quả đã lưu.
 * Phải được gọi BÊN TRONG transaction để lưu kết quả và thay đổi nghiệp vụ cùng lúc.
 * key undefined → luôn chạy (không chống trùng).
 */
export function withOperation<T>(db: DB, key: string | undefined, nowIso: string, fn: () => T): T {
  if (!key) return fn();
  const existing = db.prepare('SELECT response FROM operations WHERE key = ?').get(key) as { response: string } | undefined;
  if (existing) return JSON.parse(existing.response) as T;
  const result = fn();
  db.prepare('INSERT INTO operations (key, response, created_at) VALUES (?, ?, ?)').run(
    key,
    JSON.stringify(result ?? null),
    nowIso,
  );
  return result;
}
