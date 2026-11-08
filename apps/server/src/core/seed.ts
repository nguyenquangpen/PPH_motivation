import type { DB } from './db.js';
import { newId } from './ids.js';

const CATEGORIES = ['Career', 'Education', 'Research', 'Finance', 'Business', 'Personal Development', 'Health', 'Other'];

const TAGS: { name: string; exempt: boolean; system?: string }[] = [
  { name: 'Bất khả kháng', exempt: true },
  { name: 'Lỗi hệ thống/đồng bộ', exempt: true },
  { name: 'Goal đang Paused', exempt: true, system: 'GOAL_PAUSED' },
  { name: 'Lịch quá tải/Assistant đề xuất sai', exempt: true, system: 'SCHEDULE_INFEASIBLE' },
  { name: 'Ước lượng sai', exempt: false },
  { name: 'Trì hoãn', exempt: false },
];

export const normName = (s: string): string => s.trim().toLocaleLowerCase('vi');

/** Seed dữ liệu mẫu đúng một lần (khi DB mới). */
export function seedIfEmpty(db: DB, nowIso: string): void {
  const done = db.prepare("SELECT 1 FROM settings WHERE key = '__seeded'").get();
  if (done) return;
  db.transaction(() => {
    const insCat = db.prepare('INSERT INTO goal_categories (id, name, name_norm, created_at) VALUES (?, ?, ?, ?)');
    for (const c of CATEGORIES) insCat.run(newId(), c, normName(c), nowIso);
    const insTag = db.prepare(
      'INSERT INTO missed_reason_tags (id, name, name_norm, exempt, is_system, system_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const t of TAGS) insTag.run(newId(), t.name, normName(t.name), t.exempt ? 1 : 0, t.system ? 1 : 0, t.system ?? null, nowIso);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('__seeded', 'true', ?)").run(nowIso);
  })();
}
