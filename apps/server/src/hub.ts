import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { NotificationType } from '@pph/shared';
import { buildApp } from './app.js';
import { backupDb, hasBackupFor } from './core/backup.js';
import { SystemClock, type Clock } from './core/clock.js';
import type { AppContext } from './core/context.js';
import { openDb, type DB } from './core/db.js';
import { localDate } from './core/time.js';

export type HubNotification = {
  id: string; type: NotificationType; objectType: string | null; objectId: string | null; title: string; body: string | null;
};

export type HubOptions = {
  dataDir: string;
  port: number;
  /** Thư mục build của web (apps/web/dist). Có → server phục vụ luôn giao diện tại '/'. */
  webDist?: string;
  /** Thư mục migrations SQL khi chạy từ bản đóng gói (mặc định: cạnh source). */
  migrationsDir?: string;
  clock?: Clock;
  /** Gọi SAU khi transaction tạo notification đã commit (dùng cho toast của hệ điều hành). */
  onNotification?: (n: HubNotification) => void;
  log?: (msg: string) => void;
};

export type Hub = { app: FastifyInstance; ctx: AppContext; db: DB; url: string; stop: () => Promise<void> };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json; charset=utf-8',
};

/** Phục vụ SPA tĩnh: file có thật → trả file; đường dẫn khác (không phải /api) → index.html. */
function serveWeb(app: FastifyInstance, webDist: string): void {
  const root = normalize(webDist);
  const index = join(root, 'index.html');
  if (!existsSync(index)) throw new Error(`Không tìm thấy giao diện web đã build: ${index}`);
  app.setNotFoundHandler((req, reply) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0] ?? '/');
    if (urlPath.startsWith('/api/')) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Không có endpoint ${req.method} ${urlPath}` } });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(404).send();
    const file = normalize(join(root, urlPath));
    const safe = file === root || file.startsWith(root + sep);
    if (safe && existsSync(file) && statSync(file).isFile()) {
      const cache = urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return reply.header('cache-control', cache).type(MIME[extname(file)] ?? 'application/octet-stream').send(readFileSync(file));
    }
    return reply.header('cache-control', 'no-cache').type(MIME['.html']!).send(readFileSync(index));
  });
}

/**
 * Khởi động Hub: DB + API + scheduler (catch-up rồi mỗi 60 giây) + backup hằng ngày (+ giao diện web nếu có webDist).
 * Dùng chung cho `npm start` (CLI) và bản desktop (Electron).
 */
export async function startHub(opts: HubOptions): Promise<Hub> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const db = openDb(join(opts.dataDir, 'hub.db'), { migrationsDir: opts.migrationsDir });
  const { app, ctx } = buildApp(db, opts.clock ?? new SystemClock());
  const backupDir = join(opts.dataDir, 'backups');

  if (opts.onNotification) {
    const cb = opts.onNotification;
    ctx.events.on('notification.created', (n) => {
      // Chờ transaction hiện tại kết thúc; chỉ báo nếu notification thật sự đã được lưu (không bị rollback).
      setImmediate(() => {
        if (db.open && db.prepare('SELECT 1 FROM notifications WHERE id = ?').get(n.id)) cb(n);
      });
    });
  }

  const runBackup = async (force = false) => {
    const date = localDate(ctx.nowIso(), ctx.tz());
    if (force || !hasBackupFor(backupDir, date)) {
      try {
        const file = await backupDb(db, backupDir, date);
        log(`[backup] ${file}`);
        return file;
      } catch (e) {
        log(`[backup] failed: ${(e as Error).message}`);
      }
    }
    return null;
  };

  app.post('/api/v1/system/backup', async () => ({ file: await runBackup(true) }));
  if (opts.webDist) serveWeb(app, opts.webDist);

  // Catch-up khi khởi động (F-15 đánh giá bù, Freeze, cảnh báo...) rồi chạy định kỳ.
  ctx.scheduler.tick(ctx.nowIso());
  await runBackup();
  const tick = setInterval(() => ctx.scheduler.tick(ctx.nowIso()), 60_000);
  const backup = setInterval(() => void runBackup(), 60 * 60_000);

  await app.listen({ host: '127.0.0.1', port: opts.port });
  const port = (app.server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  log(`Personal Productivity Hub: ${url}  (data: ${opts.dataDir})`);

  return {
    app, ctx, db, url,
    stop: async () => {
      clearInterval(tick);
      clearInterval(backup);
      await app.close();
      db.close();
    },
  };
}
