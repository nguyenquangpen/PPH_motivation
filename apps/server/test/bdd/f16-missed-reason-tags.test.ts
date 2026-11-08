import { describe, expect } from 'vitest';
import { bdd, createTestApp } from '../helpers.js';

const scenario = bdd('f16-missed-reason-tags.json');
const HOUR = 3600_000;
const iso = (base: string, hours: number) => new Date(new Date(base).getTime() + hours * HOUR).toISOString();

describe('F-16 Missed Reason Tags', () => {
  scenario('[F-16] Tag mặc định', async () => {
    const t = createTestApp();
    const res = await t.api.get('/api/v1/missed-reasons');
    expect(res.status).toBe(200);
    expect(res.body.map((x: { name: string; exempt: boolean }) => [x.name, x.exempt])).toEqual([
      ['Bất khả kháng', true],
      ['Lỗi hệ thống/đồng bộ', true],
      ['Goal đang Paused', true],
      ['Lịch quá tải/Assistant đề xuất sai', true],
      ['Ước lượng sai', false],
      ['Trì hoãn', false],
    ]);
    expect(res.body.filter((x: { isSystem: boolean }) => x.isSystem).map((x: { name: string }) => x.name)).toEqual(['Goal đang Paused', 'Lịch quá tải/Assistant đề xuất sai']); // Release 2 F-29: thêm tag hệ thống
  });

  scenario('[F-16] Tạo tag mới', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/missed-reasons', { name: 'Đi công tác', exempt: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Đi công tác', exempt: true, isSystem: false });
    const list = await t.api.get('/api/v1/missed-reasons');
    expect(list.body.map((x: { name: string }) => x.name)).toContain('Đi công tác');
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    const rv = await t.api.post(`/api/v1/tasks/${id}/missed-review`, { reasonTagId: res.body.id, action: 'KEEP' });
    expect(rv.status).toBe(200);
    expect(rv.body.missedReasonTagId).toBe(res.body.id);
  });

  scenario('[F-16] Tên trùng', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/missed-reasons', { name: 'Trì hoãn', exempt: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
    const res2 = await t.api.post('/api/v1/missed-reasons', { name: '  TRÌ HOÃN ', exempt: true });
    expect(res2.status).toBe(409);
    expect(t.f.count('missed_reason_tags')).toBe(6);
  });

  scenario('[F-16] Tên quá dài', async () => {
    const t = createTestApp();
    const res = await t.api.post('/api/v1/missed-reasons', { name: 'a'.repeat(51), exempt: false });
    expect(res.status).toBe(400);
    expect((await t.api.post('/api/v1/missed-reasons', { name: 'a'.repeat(50), exempt: false })).status).toBe(201);
    expect(t.f.count('missed_reason_tags')).toBe(7);
  });

  scenario('[F-16] Tag hệ thống không xóa được', async () => {
    const t = createTestApp();
    const id = t.f.tagId('Goal đang Paused');
    const res = await t.api.del(`/api/v1/missed-reasons/${id}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SYSTEM_TAG');
    const list = await t.api.get('/api/v1/missed-reasons');
    expect(list.body.map((x: { id: string }) => x.id)).toContain(id);
  });

  scenario('[F-16] Đổi cờ miễn trừ không hồi tố', async () => {
    const t = createTestApp();
    const tag = t.f.tagId('Ước lượng sai');
    const t1 = t.f.taskRaw({ contribution: 100, estimated: 120, deadline: iso(t.ctx.nowIso(), -1), reasonTagId: tag });
    t.clock.advanceHours(24);
    t.f.tick();
    const pen = t.f.xpTx('PENALTY').filter((p) => p.source_id === t1);
    expect(pen.map((p) => p.spendable_delta)).toEqual([-100]);
    const res = await t.api.patch(`/api/v1/missed-reasons/${tag}`, { exempt: true });
    expect(res.status).toBe(200);
    expect(res.body.exempt).toBe(true);
    expect(t.s.ledger.isReversed(pen[0]!.id)).toBe(false);
    // Task Missed mới dùng tag này không bị phạt
    const t2 = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    await t.api.post(`/api/v1/tasks/${t2}/missed-review`, { reasonTagId: tag, action: 'KEEP' });
    t.clock.advanceHours(24);
    t.f.tick();
    expect(t.f.xpTx('PENALTY').filter((p) => p.source_id === t2)).toHaveLength(0);
    expect(t.s.ledger.isReversed(pen[0]!.id)).toBe(false);
  });

  scenario('[F-16] Xóa tag đang dùng', async () => {
    const t = createTestApp();
    const created = await t.api.post('/api/v1/missed-reasons', { name: 'Đi công tác', exempt: true });
    const tagId = created.body.id as string;
    const id = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    expect((await t.api.post(`/api/v1/tasks/${id}/cancel`, { reasonTagId: tagId })).status).toBe(200);
    const del = await t.api.del(`/api/v1/missed-reasons/${tagId}`);
    expect(del.status).toBe(200);
    const list = await t.api.get('/api/v1/missed-reasons');
    expect(list.body.map((x: { id: string }) => x.id)).not.toContain(tagId);
    const task = await t.api.get(`/api/v1/tasks/${id}`);
    expect(task.body.missedReasonTagId).toBe(tagId);
    expect(task.body.history.at(-1).reason).toBe('Đi công tác');
    expect((await t.api.get(`/api/v1/missed-reasons/${tagId}`)).body.name).toBe('Đi công tác');
    // không còn chọn được khi review
    const id2 = t.f.taskRaw({ deadline: iso(t.ctx.nowIso(), -1) });
    expect((await t.api.post(`/api/v1/tasks/${id2}/missed-review`, { reasonTagId: tagId, action: 'KEEP' })).status).toBe(400);
  });
});
