import { DateTime, IANAZone } from 'luxon';
import { validation } from './errors.js';

export const isValidZone = (tz: string): boolean => IANAZone.isValidZone(tz);

/** ISO UTC string của một Date */
export const toIso = (d: Date): string => d.toISOString();

/** Ngày lịch 'YYYY-MM-DD' theo timezone của một thời điểm */
export const localDate = (at: Date | string, tz: string): string =>
  DateTime.fromJSDate(typeof at === 'string' ? new Date(at) : at).setZone(tz).toISODate()!;

/** Khoảng [start, end) UTC ISO của một ngày lịch theo timezone */
export const dayRangeUtc = (date: string, tz: string): { start: string; end: string } => {
  const start = DateTime.fromISO(date, { zone: tz }).startOf('day');
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
};

/** Cộng số ngày vào 'YYYY-MM-DD' */
export const addDays = (date: string, days: number): string =>
  DateTime.fromISO(date).plus({ days }).toISODate()!;

/** Số ngày từ a đến b (b − a), cả hai 'YYYY-MM-DD' */
export const diffDays = (a: string, b: string): number =>
  Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days);

/**
 * Chuẩn hóa deadline input:
 * - 'YYYY-MM-DD' → 23:59 ngày đó theo timezone Owner
 * - ISO datetime có offset → giữ nguyên thời điểm
 * Trả về ISO UTC.
 */
export const normalizeDeadline = (input: string, tz: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const dt = DateTime.fromISO(input, { zone: tz }).set({ hour: 23, minute: 59, second: 0, millisecond: 0 });
    return dt.toUTC().toISO()!;
  }
  const dt = DateTime.fromISO(input, { setZone: true });
  if (!dt.isValid) throw validation('Deadline không hợp lệ');
  return dt.toUTC().toISO()!;
};

export const addHoursIso = (iso: string, hours: number): string =>
  DateTime.fromISO(iso).plus({ hours }).toUTC().toISO()!;

export const monthOf = (date: string): string => date.slice(0, 7);
