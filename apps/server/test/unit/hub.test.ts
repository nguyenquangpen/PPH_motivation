import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startHub, type Hub, type HubNotification } from '../../src/hub.js';

const dirs: string[] = [];
const hubs: Hub[] = [];
afterEach(async () => {
  for (const h of hubs.splice(0)) await h.stop();
  for (const d of dirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows lock */ }
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pph-hub-'));
  dirs.push(root);
  const web = join(root, 'web');
  mkdirSync(join(web, 'assets'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>Hub</title>');
  writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(root, 'secret.txt'), 'secret');
  return { root, web, data: join(root, 'data') };
}

const silent = () => {};

describe('startHub', () => {
  it('phục vụ giao diện web, SPA fallback, chặn path traversal, 404 JSON cho API', async () => {
    const fx = fixture();
    const hub = await startHub({ dataDir: fx.data, port: 0, webDist: fx.web, log: silent });
    hubs.push(hub);
    const get = (p: string) => hub.app.inject({ method: 'GET', url: p });

    const index = await get('/');
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('<title>Hub</title>');

    expect((await get('/tasks/abc')).body).toContain('<title>Hub</title>');
    const js = await get('/assets/app.js');
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.headers['cache-control']).toContain('immutable');

    const traversal = await get('/..%2Fsecret.txt');
    expect(traversal.body).not.toContain('secret');

    const api404 = await get('/api/v1/khong-ton-tai');
    expect(api404.statusCode).toBe(404);
    expect(api404.json().error.code).toBe('NOT_FOUND');

    expect((await get('/api/v1/health')).json().ok).toBe(true);
  });

  it('tạo DB + backup ngày đầu tiên trong dataDir', async () => {
    const fx = fixture();
    const hub = await startHub({ dataDir: fx.data, port: 0, log: silent });
    hubs.push(hub);
    const r = await hub.app.inject({ method: 'POST', url: '/api/v1/system/backup' });
    expect(r.json().file).toContain(join(fx.data, 'backups'));
  });

  it('onNotification chỉ được gọi sau khi transaction commit', async () => {
    const fx = fixture();
    const got: HubNotification[] = [];
    const hub = await startHub({ dataDir: fx.data, port: 0, log: silent, onNotification: (n) => got.push(n) });
    hubs.push(hub);
    const { db, ctx } = hub;

    // Bị rollback → không báo
    expect(() =>
      db.transaction(() => {
        ctx.services.notifications.notify({ type: 'LEVEL_UP', dedupeKey: 'rollback', title: 'Không được hiện' });
        throw new Error('rollback');
      })(),
    ).toThrow();
    // Commit → báo đúng 1 lần
    db.transaction(() => ctx.services.ledger.addXp({ type: 'GOAL_REWARD', amount: 1000, sourceType: 'GOAL', sourceId: null }))();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(got.map((n) => n.title)).toEqual(['Lên Level 2']);
    expect(got[0]!.type).toBe('LEVEL_UP');
  });
});
