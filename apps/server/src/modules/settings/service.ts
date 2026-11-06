import { DEFAULT_SETTINGS, ErrorCode, SETTINGS_GROUPS, SettingsSchema, UpdateSettingsSchema, type Settings } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { DomainError, validation } from '../../core/errors.js';
import { isValidZone } from '../../core/time.js';

const pascal = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

export class SettingsService {
  private cache: Settings | null = null;
  constructor(private ctx: AppContext) {}

  get(): Settings {
    if (this.cache) return this.cache;
    const rows = this.ctx.db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '\\_\\_%' ESCAPE '\\'").all() as {
      key: string; value: string;
    }[];
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = JSON.parse(r.value);
    this.cache = merged as Settings;
    return this.cache;
  }

  /** Cập nhật một phần. Validate toàn bộ kết quả; lỗi → không lưu gì. */
  update(patch: unknown): Settings {
    const parsed = UpdateSettingsSchema.safeParse(patch);
    if (!parsed.success) throw validation('Settings không hợp lệ', { issues: parsed.error.issues });
    const before = this.get();
    const next = { ...before, ...parsed.data };
    const full = SettingsSchema.safeParse(next);
    if (!full.success) throw validation('Settings không hợp lệ', { issues: full.error.issues });
    if (!isValidZone(next.timezone)) {
      throw new DomainError(ErrorCode.VALIDATION, 'Timezone không hợp lệ', 400, { timezone: next.timezone });
    }
    const now = this.ctx.nowIso();
    const upsert = this.ctx.db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    );
    for (const key of Object.keys(parsed.data) as (keyof Settings)[]) {
      if (before[key] === next[key]) continue;
      upsert.run(key, JSON.stringify(next[key]), now);
      this.cache = null;
      this.ctx.services.activity.log({
        type: 'SETTINGS_CHANGED',
        message: `${pascal(key)}: ${String(before[key])} → ${String(next[key])}`,
        before: { [key]: before[key] },
        after: { [key]: next[key] },
      });
      this.ctx.events.emit('settings.changed', { key, before: before[key], after: next[key] });
    }
    this.cache = null;
    return this.get();
  }

  resetGroup(group: string): Settings {
    const keys = SETTINGS_GROUPS[group];
    if (!keys) throw validation('Nhóm settings không tồn tại', { group });
    const patch: Partial<Settings> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
    return this.update(patch);
  }

  invalidate(): void {
    this.cache = null;
  }
}
