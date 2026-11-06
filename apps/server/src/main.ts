import { join, resolve } from 'node:path';
import { buildApp } from './app.js';
import { backupDb, hasBackupFor } from './core/backup.js';
import { SystemClock } from './core/clock.js';
import { openDb } from './core/db.js';
import { localDate } from './core/time.js';

const DATA_DIR = resolve(process.env.PPH_DATA_DIR ?? join(process.cwd(), '..', '..', 'data'));
const PORT = Number(process.env.PPH_PORT ?? 4317);

async function main() {
  const db = openDb(join(DATA_DIR, 'hub.db'));
  const clock = new SystemClock();
  const { app, ctx } = buildApp(db, clock);
  const backupDir = join(DATA_DIR, 'backups');

  const runBackup = async () => {
    const date = localDate(ctx.nowIso(), ctx.tz());
    if (!hasBackupFor(backupDir, date)) {
      try {
        console.log(`[backup] ${await backupDb(db, backupDir, date)}`);
      } catch (e) {
        console.error('[backup] failed', e);
      }
    }
  };

  app.post('/api/v1/system/backup', async () => ({ file: await backupDb(db, backupDir, localDate(ctx.nowIso(), ctx.tz())) }));

  // Catch-up khi khởi động (F-15 đánh giá bù, Freeze, cảnh báo...) rồi chạy định kỳ.
  ctx.scheduler.tick(ctx.nowIso());
  await runBackup();
  setInterval(() => ctx.scheduler.tick(ctx.nowIso()), 60_000);
  setInterval(() => void runBackup(), 60 * 60_000);

  await app.listen({ host: '127.0.0.1', port: PORT });
  console.log(`Personal Productivity Hub API: http://127.0.0.1:${PORT}  (data: ${DATA_DIR})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
