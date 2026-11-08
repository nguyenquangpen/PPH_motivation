import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { bdd as bddR1, createTestApp, type TestApp } from '../helpers.js';

const R2_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'requirements', '2026-11-07-pph-release-2-bdd');

/** bdd() của helpers đang trỏ thư mục BDD Release 1; file Release 2 → đọc trực tiếp (tên scenario vẫn phải khớp JSON). */
export function bdd(file: string) {
  const p = join(R2_DIR, file);
  if (!existsSync(p)) return bddR1(file);
  try {
    return bddR1(file);
  } catch {
    const data = JSON.parse(readFileSync(p, 'utf8')) as { bdd: { scenario: string }[] }[];
    const names = new Set(data.flatMap((f) => f.bdd.map((s) => s.scenario)));
    return (name: string, fn: () => void | Promise<void>, timeoutMs?: number) => {
      if (!names.has(name)) throw new Error(`Scenario không có trong ${file}: "${name}"`);
      it(name, fn, timeoutMs);
    };
  }
}

export const APP_ID = 'japanese-learning-app';
export const EVENTS_URL = '/api/v1/integrations/events';

/** Given: App 'Japanese Learning App' đã đăng ký, có API key K hợp lệ. */
export async function setupApp(nowIso?: string) {
  const t = createTestApp(nowIso);
  const app = (await t.api.post('/api/v1/integrations/apps', { name: 'Japanese Learning App', appId: APP_ID })).body;
  const key = (await t.api.post(`/api/v1/integrations/apps/${app.id}/keys`, { name: 'Laptop' })).body;
  return { t, appRef: app.id as string, key: key.key as string, keyId: key.id as string };
}

export function envelope(o: { type?: string; data?: Record<string, unknown>; occurredAt?: string; eventId?: string; appId?: string } = {}) {
  const type = o.type ?? 'vocabulary.learned';
  const subject = type === 'external_app.heartbeat' ? { type: 'app', external_id: APP_ID }
    : type === 'lesson.completed' ? { type: 'lesson', external_id: 'lesson-1' }
    : type === 'learning.session.completed' ? { type: 'session', external_id: 'session-1' }
    : { type: 'vocabulary_batch', external_id: 'batch-1' };
  const data = o.data ?? (type === 'external_app.heartbeat' ? { outbox_pending: 0 }
    : type === 'lesson.completed' ? { title: 'Bài 1' }
    : type === 'learning.session.completed' ? { duration_minutes: 30, activity: 'mixed', started_at: '2026-11-06T09:00:00+07:00', ended_at: '2026-11-06T09:30:00+07:00' }
    : { count: 20, level: 'N3' });
  const occurred = o.occurredAt ?? '2026-11-06T09:30:00+07:00';
  return {
    event_id: o.eventId ?? randomUUID(),
    event_type: type,
    schema_version: 1,
    source: { app_id: o.appId ?? APP_ID, app_version: '1.4.2' },
    subject,
    data,
    occurred_at: occurred,
    recorded_at: occurred,
    metadata: {},
  };
}

export const send = (t: TestApp, key: string | null, body: unknown) =>
  t.api.call('POST', EVENTS_URL, body, key ? { authorization: 'Bearer ' + key } : {});

export async function rule(t: TestApp, appRef: string, goalId: string, o: Record<string, unknown> = {}) {
  const r = await t.api.post('/api/v1/integrations/rules', {
    appRef, eventType: 'vocabulary.learned', goalId, mode: 'PER_UNIT', field: 'count', factor: 1, defaultDurationMinutes: 20, ...o,
  });
  if (r.status !== 201) throw new Error('rule create failed: ' + JSON.stringify(r.body));
  return r.body;
}

export const eventRow = (t: TestApp, id: string) =>
  t.db.prepare('SELECT * FROM integration_events WHERE event_id = ?').get(id) as Record<string, any> | undefined;

export const process = (t: TestApp) => t.s.integrations.processPending();
