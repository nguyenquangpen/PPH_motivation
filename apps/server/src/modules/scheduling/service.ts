import type { AppContext } from '../../core/context.js';

/** STUB — Agent A. F-26…F-29 giờ làm việc, gợi ý, cảnh báo. Giữ chữ ký public. */
export class SchedulingService {
  constructor(private ctx: AppContext) {}
  /** F-29: Task có cảnh báo thiếu thời gian hoặc có phiên trong ngày quá tải (kể cả đã chấp nhận), bất kể trạng thái Task. */
  isInfeasible(_taskId: string): boolean {
    void this.ctx;
    return false;
  }
}
