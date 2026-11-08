import type { SessionDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';

/** STUB — Agent A. F-21 phiên làm việc của Task. Giữ chữ ký public. */
export class SessionService {
  constructor(private ctx: AppContext) {}
  listByTask(_taskId: string): SessionDto[] {
    void this.ctx;
    return [];
  }
  totalMinutes(_taskId: string): number {
    return 0;
  }
}
