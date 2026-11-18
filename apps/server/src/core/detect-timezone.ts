import { DateTime, IANAZone } from 'luxon';
import { DEFAULT_SETTINGS } from '@pph/shared';

/**
 * Múi giờ của máy (Windows) cho lần chạy đầu tiên.
 * Windows ở Việt Nam thường báo "Asia/Bangkok" (SE Asia Standard Time, cùng UTC+7) →
 * nếu cùng độ lệch hiện tại với múi giờ mặc định thì giữ "Asia/Ho_Chi_Minh" cho dễ hiểu.
 */
export function detectTimezone(
  now: Date = new Date(),
  readZone: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const fallback = DEFAULT_SETTINGS.timezone;
  let tz: string | undefined;
  try {
    tz = readZone();
  } catch {
    return fallback;
  }
  if (!tz || !IANAZone.isValidZone(tz)) return fallback;
  const offset = (zone: string) => DateTime.fromJSDate(now).setZone(zone).offset;
  return offset(tz) === offset(fallback) ? fallback : tz;
}
