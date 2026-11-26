/**
 * E2E Release 2: chụp và kiểm tra các màn hình mới (Task + phiên + gợi ý, Dashboard cảnh báo lịch,
 * Cài đặt Google Calendar / giờ làm việc, trang Tích hợp) ở 1366×768, sáng và tối.
 * Google Calendar dùng FakeCalendarProvider (không gọi mạng). Ảnh: e2e/.shots/r2-*.png
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/server/src/app.js';
import { SystemClock } from '../apps/server/src/core/clock.js';
import { openDb } from '../apps/server/src/core/db.js';
import type { AppContext } from '../apps/server/src/core/context.js';
import { FakeCalendarProvider } from '../apps/server/src/modules/calendar/fake-provider.js';

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = join(ROOT, 'e2e', '.shots');
const VIEWPORT = { width: 1366, height: 768 };

let api: FastifyInstance;
let ctx: AppContext;
let vite: ViteDevServer;
let browser: Browser;
let baseUrl: string;
let taskId: string;
const pageErrors: string[] = [];

const tomorrowAt = (h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

async function newPage(theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'vi-VN' });
  await context.addInitScript((t) => {
    try { localStorage.setItem('pph-theme', t); } catch { /* ignore */ }
  }, theme);
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${page.url()}: ${e.message}`));
  return page;
}

async function checkNoOverflow(page: Page, label: string) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, `${label}: không được cuộn ngang`).toBeLessThanOrEqual(cw + 1);
}

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const fake = new FakeCalendarProvider();
  fake.addExternalEvent({ title: 'Họp nhóm', start: tomorrowAt(9), end: tomorrowAt(10) });
  fake.addExternalEvent({ title: 'Học N3', start: tomorrowAt(19), end: tomorrowAt(21) });

  const built = buildApp(openDb(':memory:'), new SystemClock(), { calendarProvider: fake });
  api = built.app;
  ctx = built.ctx;
  await api.listen({ host: '127.0.0.1', port: 0 });
  const apiPort = (api.server.address() as { port: number }).port;

  const s = ctx.services;
  const tx = <T>(fn: () => T) => ctx.db.transaction(fn)();
  await s.calendar.connect();
  await s.calendar.pullNow();

  const cat = s.goals.listCategories()[0]!;
  const goal = tx(() => s.goals.create({ title: 'Học 1000 từ', categoryId: cat.id, targetContribution: 1000 }));
  tx(() => s.goals.update(goal.id, { status: 'ACTIVE' }));
  const task = tx(() => s.tasks.create({ title: 'Viết báo cáo nghiên cứu', priority: 'HIGH', contribution: 100, estimatedDuration: 120, goalId: goal.id }));
  taskId = task.id;
  tx(() => s.sessions.create(task.id, { start: tomorrowAt(10), end: tomorrowAt(10, 30) }));
  await s.calendar.pushNow();

  const app = tx(() => s.integrations.createApp({ name: 'Japanese Learning App', appId: 'japanese-learning-app' }));
  const key = tx(() => s.integrations.createKey(app.id, { name: 'Laptop' }));
  tx(() => s.integrations.createRule({ appRef: app.id, eventType: 'vocabulary.learned', goalId: goal.id, mode: 'PER_UNIT', field: 'count', factor: 1, defaultDurationMinutes: 20 }));
  const now = new Date().toISOString().replace('Z', '+00:00');
  tx(() => s.integrations.ingest(`Bearer ${key.key}`, {
    event_id: crypto.randomUUID(), event_type: 'vocabulary.learned', schema_version: 1,
    source: { app_id: 'japanese-learning-app', app_version: '1.0.0' }, subject: { type: 'vocabulary_batch', external_id: 'e2e-1' },
    data: { count: 20, level: 'N3' }, occurred_at: now, recorded_at: now, metadata: {},
  }));
  s.integrations.processPending();

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

for (const theme of ['light', 'dark'] as const) {
  it(`Release 2 screens render at 1366×768 (${theme})`, async () => {
    const page = await newPage(theme);
    const shot = (name: string) => page.screenshot({ path: join(SHOTS, `r2-${theme}-${name}.png`), fullPage: true });

    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => page.getByText('Cảnh báo lịch').first().isVisible()).toBe(true);
    await checkNoOverflow(page, 'dashboard');
    await shot('dashboard');

    await page.goto(`${baseUrl}/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => page.getByText('Phiên làm việc').first().isVisible()).toBe(true);
    await checkNoOverflow(page, 'task detail');
    await shot('task-detail');
    await page.getByRole('button', { name: /Gợi ý lịch/ }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    await shot('suggestions');

    await page.goto(`${baseUrl}/settings`);
    await page.waitForLoadState('networkidle');
    await checkNoOverflow(page, 'settings');
    await shot('settings');

    await page.goto(`${baseUrl}/integrations`);
    await page.waitForLoadState('networkidle');
    await checkNoOverflow(page, 'integrations');
    await shot('integrations');
    await page.context().close();
  });
}
