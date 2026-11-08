import type { DB } from './db.js';

export type Job = { name: string; run: (nowIso: string) => void };

/**
 * Các job định kỳ. Mỗi job PHẢI idempotent (chạy lặp an toàn) vì tick() được gọi
 * khi khởi động (catch-up) và mỗi 60 giây. Mỗi job chạy trong transaction riêng.
 */
export class Scheduler {
  private jobs: Job[] = [];
  constructor(private db: DB) {}

  register(job: Job): void {
    this.jobs.push(job);
  }

  tick(nowIso: string): { name: string; error?: string }[] {
    const results: { name: string; error?: string }[] = [];
    for (const job of this.jobs) {
      try {
        this.db.transaction(() => job.run(nowIso))();
        results.push({ name: job.name });
      } catch (e) {
        results.push({ name: job.name, error: (e as Error).message });
        console.error(`[scheduler] job ${job.name} failed`, e);
      }
    }
    return results;
  }
}
