import type { BusyIntervalDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';

/** STUB — Agent B. F-22…F-25, F-34. Giữ chữ ký public. */
export class CalendarService {
  constructor(private ctx: AppContext) {}
  /** Giờ bận (đã gộp) trong khoảng [from, to); rỗng nếu chưa kết nối/lỗi. */
  busy(_from: string, _to: string): BusyIntervalDto[] {
    void this.ctx;
    return [];
  }
  /** Có dữ liệu lịch Google dùng được không (ACTIVE và đã đọc ít nhất 1 lần). */
  hasBusyData(): boolean {
    return false;
  }
}
