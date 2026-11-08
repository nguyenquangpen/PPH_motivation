/**
 * E2E cho các scenario NFR chỉ kiểm chứng được trên giao diện (nfr-non-functional.json):
 * NFR-005 (x2), 4.3 truy vết số liệu, NFR-011 Dark Mode, NFR-006 màn hình 1366×768.
 * Dựng API thật (SQLite :memory:) + Vite dev server thật, điều khiển Microsoft Edge (headless).
 * Ảnh chụp từng màn hình lưu ở e2e/.shots/ (gitignored) để review bằng mắt.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/server/src/app.js';
import { SystemClock } from '../apps/server/src/core/clock.js';
import { openDb } from '../apps/server/src/core/db.js';
import type { AppContext } from '../apps/server/src/core/context.js';
import { localDate } from '../apps/server/src/core/time.js';
import { bdd } from '../apps/server/test/helpers.js';

const scenario = bdd('nfr-non-functional.json');
const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = join(ROOT, 'e2e', '.shots');
const VIEWPORT = { width: 1366, height: 768 };

let api: FastifyInstance;
let ctx: AppContext;
let vite: ViteDevServer;
let browser: Browser;
let baseUrl: string;
const pageErrors: string[] = [];

async function newPage(): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'vi-VN' });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e.message}`));
  return page;
}

/** Task có deadline cuối ngày hôm nay (theo timezone Owner) để hiện trong Today. */
function seedTask(title: string, contribution = 100, estimatedDuration = 120) {
  const today = localDate(ctx.nowIso(), ctx.tz());
  return ctx.db.transaction(() =>
    ctx.services.tasks.create({ title, priority: 'HIGH', contribution, estimatedDuration, deadline: today }),
  )();
}

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const db = openDb(':memory:');
  const built = buildApp(db, new SystemClock());
  api = built.app;
  ctx = built.ctx;
  await api.listen({ host: '127.0.0.1', port: 0 });
  const apiPort = (api.server.address() as { port: number }).port;

  // Dữ liệu nền: 1 goal, vài task, có XP để hiển thị
  const cat = ctx.services.goals.listCategories()[0]!;
  const goal = ctx.db.transaction(() =>
    ctx.services.goals.create({ title: 'Học 1000 từ vựng', categoryId: cat.id, targetContribution: 1000 }),
  )();
  ctx.db.transaction(() => ctx.services.goals.update(goal.id, { status: 'ACTIVE' }))();
  const done = ctx.db.transaction(() =>
    ctx.services.tasks.create({ title: 'Ôn 50 từ', priority: 'MEDIUM', contribution: 60, estimatedDuration: 60, goalId: goal.id }),
  )();
  ctx.db.transaction(() => ctx.services.tasks.complete(done.id))();

  vite = await createServer({
    configFile: join(ROOT, 'apps', 'web', 'vite.config.ts'),
    root: join(ROOT, 'apps', 'web'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: `http://127.0.0.1:${apiPort}` } } },
  });
  await vite.listen();
  baseUrl = vite.resolvedUrls!.local[0]!.replace(/\/$/, '');

  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

afterAll(async () => {
  await browser?.close();
  await vite?.close();
  await api?.close();
  expect(pageErrors, 'Không được có lỗi JavaScript trên trang').toEqual([]);
});

scenario('[NFR-005] Hoàn thành Task ≤ 2 thao tác', async () => {
  const task = seedTask('Viết báo cáo E2E');
  const page = await newPage();
  await page.goto(`${baseUrl}/`);
  let actions = 0;
  await page.getByRole('button', { name: `Hoàn thành ${task.title}` }).click();
  actions++;
  await expect.poll(() => ctx.services.tasks.get(task.id).status, { timeout: 10_000 }).toBe('COMPLETED');
  expect(actions).toBeLessThanOrEqual(2);
  await page.screenshot({ path: join(SHOTS, 'nfr005-after-complete.png'), fullPage: true });
  await page.context().close();
});

scenario('[NFR-005] Tạo Task trên một form', async () => {
  const page = await newPage();
  await page.goto(`${baseUrl}/tasks`);
  await page.getByRole('button', { name: '+ Tạo Task' }).click();
  const form = page.getByRole('form', { name: 'Tạo Task' });
  await form.getByLabel('Tiêu đề').fill('Task tạo từ E2E');
  await form.getByLabel('Đóng góp (Contribution)').fill('30');
  await form.getByLabel('Thời lượng ước tính (phút)').fill('45');
  await page.screenshot({ path: join(SHOTS, 'nfr005-create-form.png'), fullPage: true });
  const pathBefore = new URL(page.url()).pathname;
  await form.getByRole('button', { name: 'Tạo Task' }).click();
  await expect
    .poll(() => ctx.services.tasks.list().some((t) => t.title === 'Task tạo từ E2E'), { timeout: 10_000 })
    .toBe(true);
  expect(new URL(page.url()).pathname).toBe(pathBefore);
  await page.context().close();
});

scenario('[4.3] Truy vết số liệu', async () => {
  const page = await newPage();
  await page.goto(`${baseUrl}/`);
  const spendable = ctx.services.ledger.balances().spendable;
  const link = page.locator('a[href="/rewards#transactions"]', { hasText: String(spendable) }).first();
  await link.click();
  await expect.poll(() => page.url()).toContain('/rewards#transactions');
  await expect.poll(() => page.locator('#transactions').isVisible(), { timeout: 10_000 }).toBe(true);
  // Tổng giao dịch nguồn bằng số đã hiển thị
  const all = ctx.services.ledger.listXp({ pageSize: 10_000 }).items;
  expect(all.reduce((a, t) => a + t.spendableDelta, 0)).toBe(spendable);
  await page.screenshot({ path: join(SHOTS, 'nfr43-transactions.png'), fullPage: true });
  await page.context().close();
});

scenario('[NFR-011] Dark Mode (Could)', async () => {
  const page = await newPage();
  await page.goto(`${baseUrl}/`);
  const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bgDark).not.toBe(bgLight);
  await page.goto(`${baseUrl}/tasks`);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  await page.goto(`${baseUrl}/`);
  await page.screenshot({ path: join(SHOTS, 'nfr011-dark-dashboard.png'), fullPage: true });
  await page.context().close();
});

scenario('[NFR-006] Màn hình 1366×768', async () => {
  const page = await newPage();
  const routes = ['/', '/goals', '/tasks', '/rewards', '/activity', '/settings'];
  const overflow: string[] = [];
  for (const r of routes) {
    await page.goto(`${baseUrl}${r}`);
    await page.waitForLoadState('networkidle');
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    if (scrollW > clientW + 1) overflow.push(`${r}: scrollWidth ${scrollW} > ${clientW}`);
    await page.screenshot({ path: join(SHOTS, `nfr006${r === '/' ? '-dashboard' : r.replace('/', '-')}.png`), fullPage: true });
  }
  expect(overflow).toEqual([]);
  await page.context().close();
});
