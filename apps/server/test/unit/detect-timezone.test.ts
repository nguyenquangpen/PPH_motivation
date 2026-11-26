import { describe, expect, it } from 'vitest';
import { detectTimezone } from '../../src/core/detect-timezone.js';
import { openDb } from '../../src/core/db.js';
import { buildApp } from '../../src/app.js';
import { FixedClock } from '../../src/core/clock.js';

const at = new Date('2026-11-18T03:00:00.000Z');
const zone = (z: string | undefined) => detectTimezone(at, () => z);

describe('detectTimezone (múi giờ lần chạy đầu)', () => {
  it('Windows báo Asia/Bangkok hoặc Asia/Saigon (UTC+7) → giữ Asia/Ho_Chi_Minh', () => {
    expect(zone('Asia/Bangkok')).toBe('Asia/Ho_Chi_Minh');
    expect(zone('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
  });

  it('Múi giờ khác độ lệch → dùng múi giờ của máy', () => {
    expect(zone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('Không đọc được / không hợp lệ → mặc định', () => {
    expect(zone(undefined)).toBe('Asia/Ho_Chi_Minh');
    expect(zone('Mars/Base')).toBe('Asia/Ho_Chi_Minh');
    expect(detectTimezone(at, () => { throw new Error('no Intl'); })).toBe('Asia/Ho_Chi_Minh');
  });

  it('Chỉ ghi vào Settings ở lần chạy đầu; lần sau giữ lựa chọn của người dùng', () => {
    const db = openDb(':memory:');
    const clock = new FixedClock('2026-11-18T03:00:00.000Z');
    const first = buildApp(db, clock, { initialTimezone: 'Asia/Tokyo' }).ctx;
    expect(first.services.settings.get().timezone).toBe('Asia/Tokyo');
    db.transaction(() => first.services.settings.update({ timezone: 'Europe/Paris' }))();
    const second = buildApp(db, clock, { initialTimezone: 'Asia/Tokyo' }).ctx;
    expect(second.services.settings.get().timezone).toBe('Europe/Paris');
  });
});
