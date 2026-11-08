import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { backupDb, hasBackupFor } from '../../src/core/backup.js';
import { FixedClock } from '../../src/core/clock.js';
import { openDb } from '../../src/core/db.js';
import { newId } from '../../src/core/ids.js';
import { bdd, createTestApp, DEFAULT_NOW, type TestApp } from '../helpers.js';

const scenario = bdd('nfr-non-functional.json');
const tmpDirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'pph-nfr-'));
  tmpDirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows file lock — bỏ qua */ }
  }
});

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
};

/** Sinh 10.000 Task và 50.000 giao dịch XP trực tiếp vào DB. */
function seedLarge(t: TestApp) {
  const now = t.ctx.nowIso();
  const goals = Array.from({ length: 20 }, (_, i) => t.f.goal({ title: `Goal ${i}`, target: 100000 }));
  t.db.transaction(() => {
    const insTask = t.db.prepare(
      `INSERT INTO tasks (id, title, priority, contribution, goal_id, estimated_duration, deadline, status, created_at, updated_at)
       VALUES (?, ?, 'MEDIUM', 50, ?, 60, ?, ?, ?, ?)`,
    );
    for (let i = 0; i < 10_000; i++) {
      const deadline = new Date(Date.parse(now) + ((i % 60) - 30) * 3600_000).toISOString();
      insTask.run(newId(), `Task ${i}`, goals[i % goals.length], deadline, i % 3 === 0 ? 'COMPLETED' : 'TODO', now, now);
    }
    const insTx = t.db.prepare(
      `INSERT INTO xp_transactions (id, type, lifetime_delta, spendable_delta, source_type, created_at) VALUES (?, 'TASK_REWARD', 10, 10, 'TASK', ?)`,
    );
    for (let i = 0; i < 50_000; i++) insTx.run(newId(), now);
  })();
}

describe('NFR Performance', () => {
  scenario('[NFR-004] Dashboard load', async () => {
    const t = createTestApp();
    seedLarge(t);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = performance.now();
      const r = await t.api.get('/api/v1/dashboard');
      times.push(performance.now() - s);
      expect(r.status).toBe(200);
    }
    expect(p95(times)).toBeLessThanOrEqual(2000);
  }, 120_000);

  scenario('[PC-15] Complete/Undo latency', async () => {
    const t = createTestApp();
    seedLarge(t);
    const g = t.f.goal();
    const times: number[] = [];
    for (let i = 0; i < 25; i++) {
      const task = t.f.task({ goalId: g });
      let s = performance.now();
      expect((await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, newId())).status).toBe(200);
      times.push(performance.now() - s);
      s = performance.now();
      expect((await t.api.post(`/api/v1/tasks/${task.id}/undo`, {}, newId())).status).toBe(200);
      times.push(performance.now() - s);
    }
    expect(p95(times)).toBeLessThanOrEqual(500);
  }, 120_000);
});

describe('NFR Security', () => {
  scenario('[NFR-009] Từ chối kết nối từ máy khác', async () => {
    const t = createTestApp();
    const r = await t.api.call('GET', '/api/v1/settings', undefined, {}, '192.168.1.20');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  scenario('[NFR-009] Truy cập từ localhost', async () => {
    const t = createTestApp();
    const r = await t.api.call('GET', '/api/v1/dashboard', undefined, {}, '127.0.0.1');
    expect(r.status).toBe(200);
  });
});

describe('NFR Reliability & Data', () => {
  scenario('[NFR-001] Restart không mất dữ liệu', async () => {
    const dir = tmp();
    const file = join(dir, 'hub.db');
    const clock = new FixedClock(DEFAULT_NOW);
    const db1 = openDb(file);
    const { ctx: c1 } = buildApp(db1, clock);
    const task = db1.transaction(() => c1.services.tasks.create({ title: 'T', priority: 'HIGH', contribution: 100, estimatedDuration: 60 }))();
    db1.transaction(() => c1.services.tasks.complete(task.id))();
    db1.transaction(() => c1.services.ledger.addXp({ type: 'REDEEM', amount: 10, sourceType: 'REDEMPTION', sourceId: null }))();
    // "Tắt đột ngột": không đóng kết nối, mở kết nối mới tới cùng file
    const db2 = openDb(file);
    const { ctx: c2 } = buildApp(db2, clock);
    expect(c2.services.tasks.get(task.id).status).toBe('COMPLETED');
    const types = (db2.prepare('SELECT type FROM xp_transactions').all() as { type: string }[]).map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(['TASK_REWARD', 'REDEEM']));
    db1.close();
    db2.close();
  });

  scenario('[NFR-002] Đối soát', async () => {
    const t = createTestApp();
    const g = t.f.goal();
    t.f.pool(95);
    const a = t.f.task({ contribution: 100, goalId: g });
    const b = t.f.task({ contribution: 10, goalId: g });
    t.f.complete(a.id);
    t.f.complete(b.id);
    t.f.undo(a.id);
    t.f.complete(a.id);
    t.f.xp('PENALTY', 30);
    const redeem = t.f.xp('REDEEM', 50, 'REDEMPTION');
    t.db.transaction(() => t.s.ledger.reverseXp(redeem.id))();
    const r = await t.api.get('/api/v1/xp/reconciliation');
    expect(r.body.ok).toBe(true);
    expect(r.body.checks.every((c: any) => c.diff === 0)).toBe(true);
  });

  scenario('[NFR-003] Idempotency tổng quát', async () => {
    const t = createTestApp();
    t.f.balances(500, 500);
    const task = t.f.task({ contribution: 100 });
    t.f.start(task.id);
    const item = await t.api.post('/api/v1/shop/items', { name: 'I', priceXp: 100 });
    for (let i = 0; i < 5; i++) await t.api.post(`/api/v1/tasks/${task.id}/complete`, {}, 'k-complete');
    for (let i = 0; i < 5; i++) await t.api.post(`/api/v1/shop/items/${item.body.id}/redeem`, {}, 'k-redeem');
    expect(t.f.xpTx('TASK_REWARD')).toHaveLength(1);
    expect(t.f.xpTx('REDEEM')).toHaveLength(1);
  });

  scenario('[NFR-008] Backup và khôi phục', async () => {
    const dir = tmp();
    const t = createTestApp();
    const task = t.f.task({ title: 'Backed up' });
    t.f.complete(task.id);
    const file = await backupDb(t.db, join(dir, 'backups'), '2026-11-06');
    expect(hasBackupFor(join(dir, 'backups'), '2026-11-06')).toBe(true);
    const restored = openDb(file);
    const { ctx } = buildApp(restored, new FixedClock(DEFAULT_NOW));
    expect(ctx.services.tasks.get(task.id).title).toBe('Backed up');
    expect(ctx.services.ledger.balances().lifetime).toBe(t.s.ledger.balances().lifetime);
    restored.close();
  });

  scenario('[NFR-007] Múi giờ', () => {
    const t = createTestApp('2026-11-05T17:30:00.000Z'); // 00:30 ngày 06/11 tại +07:00
    const task = t.f.task({ contribution: 100 });
    t.f.complete(task.id);
    expect(t.s.ledger.xpToday()).toBe(100);
    const cal = t.s.streak.get().calendar;
    expect(cal.find((d) => d.date === '2026-11-06')?.state).toBe('ACTIVE');
    expect(cal.find((d) => d.date === '2026-11-05')?.state ?? 'EMPTY').toBe('EMPTY');
  });
});
