import { describe, expect } from 'vitest';
import { bdd, createTestApp, type TestApp } from '../helpers.js';

const scenario = bdd('f11-reward-shop.json');

const createItem = async (t: TestApp, body: Record<string, unknown>) => {
  const res = await t.api.post('/api/v1/shop/items', { name: 'Item', priceXp: 300, ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; state: string; lockReason: string | null; missingXp: number };
};
const redeem = (t: TestApp, id: string, key?: string) => t.api.post(`/api/v1/shop/items/${id}/redeem`, {}, key);
const itemView = async (t: TestApp, id: string) => {
  const res = await t.api.get('/api/v1/shop/items');
  return (res.body as { id: string; state: string; lockReason: string | null; missingXp: number }[]).find((i) => i.id === id);
};

describe('F-11 Reward Shop', () => {
  scenario('[F-11] Tạo Reward Item', async () => {
    const t = createTestApp();
    const item = await createItem(t, { name: 'Xem phim', priceXp: 300 });
    const list = await t.api.get('/api/v1/shop/items');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: item.id, name: 'Xem phim', priceXp: 300, unlockType: null, lockReason: null });
    expect(list.body[0].state).toBe('INSUFFICIENT_XP'); // Spendable 0
  });

  scenario('[F-11] Giá XP ngoài phạm vi', async () => {
    const t = createTestApp();
    const statuses = [];
    for (const priceXp of [0, 1, 1_000_000, 1_000_001]) {
      statuses.push((await t.api.post('/api/v1/shop/items', { name: `P${priceXp}`, priceXp })).status);
    }
    expect(statuses).toEqual([400, 201, 201, 400]);
    expect((await t.api.get('/api/v1/shop/items')).body.map((i: { priceXp: number }) => i.priceXp)).toEqual([1, 1_000_000]);
  });

  scenario('[F-11] Đổi thưởng thành công', async () => {
    const t = createTestApp();
    t.f.balances(500, 500);
    const item = await createItem(t, { name: 'Xem phim', priceXp: 300 });
    expect((await itemView(t, item.id))!.state).toBe('AVAILABLE');
    const res = await redeem(t, item.id);
    expect(res.status).toBe(200);
    const redeems = t.f.xpTx('REDEEM');
    expect(redeems).toHaveLength(1);
    expect(redeems[0]).toMatchObject({ lifetime_delta: 0, spendable_delta: -300, source_id: res.body.id });
    expect(t.s.ledger.balances().spendable).toBe(200);
    const hist = await t.api.get('/api/v1/shop/redemptions');
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0]).toMatchObject({ id: res.body.id, itemId: item.id, itemName: 'Xem phim', priceXp: 300, reversed: false });
    expect(t.f.activity().some((a) => a.type === 'REDEMPTION_CREATED' && a.message.includes('Xem phim'))).toBe(true);
  });

  scenario('[F-11] Spendable bằng giá', async () => {
    const t = createTestApp();
    t.f.balances(300, 300);
    const item = await createItem(t, { priceXp: 300 });
    expect((await redeem(t, item.id)).status).toBe(200);
    expect(t.s.ledger.balances().spendable).toBe(0);
  });

  scenario('[F-11] Không đủ XP', async () => {
    const t = createTestApp();
    t.f.balances(299, 299);
    const item = await createItem(t, { priceXp: 300 });
    expect(await itemView(t, item.id)).toMatchObject({ state: 'INSUFFICIENT_XP', missingXp: 1 });
    const res = await redeem(t, item.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_XP', message: 'Còn thiếu 1 XP', details: { missingXp: 1 } });
    expect(t.f.xpTx('REDEEM')).toHaveLength(0);
    expect(t.f.count('redemptions')).toBe(0);
  });

  scenario('[F-11] Spendable âm', async () => {
    const t = createTestApp();
    t.f.balances(100, -50);
    expect(t.s.ledger.balances().spendable).toBe(-50);
    const item = await createItem(t, { priceXp: 10 });
    const res = await redeem(t, item.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_XP', message: 'Còn thiếu 60 XP', details: { missingXp: 60 } });
    expect(t.f.xpTx('REDEEM')).toHaveLength(0);
  });

  scenario('[F-11] Item bị khóa theo Level', async () => {
    const t = createTestApp();
    // Given "Level 2, Spendable 5000" không dựng được qua giao dịch hợp lệ (Spendable ≤ Lifetime < 2000 ở Level 2).
    // Ý của kịch bản: Spendable dư sức trả giá, chỉ bị chặn bởi Level → Spendable 1999 ≫ giá 100.
    t.f.balances(1999, 1999);
    expect(t.s.ledger.level()).toBe(2);
    const item = await createItem(t, { priceXp: 100, unlockType: 'LEVEL', unlockValue: '3' });
    const view = await itemView(t, item.id);
    expect(view).toMatchObject({ state: 'LOCKED', lockReason: 'Bị khóa: cần Level 3' });
    const res = await redeem(t, item.id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'ITEM_LOCKED', message: 'Bị khóa: cần Level 3' });
    expect(t.f.xpTx('REDEEM')).toHaveLength(0);
  });

  scenario('[F-11] Mở khóa khi đạt Level', async () => {
    const t = createTestApp();
    t.f.balances(1990, 1990);
    const item = await createItem(t, { priceXp: 100, unlockType: 'LEVEL', unlockValue: '3' });
    expect(t.s.ledger.level()).toBe(2);
    expect((await itemView(t, item.id))!.state).toBe('LOCKED');
    t.f.xp('TASK_REWARD', 10);
    expect(t.s.ledger.level()).toBe(3);
    expect((await itemView(t, item.id))!.state).toBe('AVAILABLE');
    expect((await redeem(t, item.id)).status).toBe(200);
    expect(t.s.ledger.balances()).toEqual({ lifetime: 2000, spendable: 1900 });
  });

  scenario('[F-11] Khóa lại khi mất điều kiện', async () => {
    const t = createTestApp();
    t.f.balances(1000, 1000);
    const g = t.f.goal();
    const m = t.f.milestone(g, { status: 'COMPLETED' });
    const item = await createItem(t, { priceXp: 100, unlockType: 'MILESTONE_COMPLETED', unlockValue: m });
    expect((await itemView(t, item.id))!.state).toBe('AVAILABLE');
    // Mô phỏng hoàn tác Task khiến Milestone mở lại (module milestones do Agent khác làm).
    t.db.prepare("UPDATE milestones SET status = 'PENDING' WHERE id = ?").run(m);
    const view = await itemView(t, item.id);
    expect(view!.state).toBe('LOCKED');
    expect(view!.lockReason).toMatch(/^Bị khóa/);
    const res = await redeem(t, item.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_LOCKED');
    expect(t.f.xpTx('REDEEM')).toHaveLength(0);
  });

  scenario('[F-11] Đổi lặp', async () => {
    const t = createTestApp();
    t.f.balances(1000, 1000);
    const item = await createItem(t, { priceXp: 300 });
    const a = await redeem(t, item.id, 'op-1');
    const b = await redeem(t, item.id, 'op-1');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(t.f.xpTx('REDEEM')).toHaveLength(1);
    expect(t.f.count('redemptions')).toBe(1);
    expect(t.s.ledger.balances().spendable).toBe(700);
  });

  scenario('[F-11] Hoàn tác đổi thưởng', async () => {
    const t = createTestApp();
    t.f.balances(500, 500);
    const item = await createItem(t, { priceXp: 300 });
    const r = (await redeem(t, item.id)).body;
    expect(t.s.ledger.balances().spendable).toBe(200);
    const res = await t.api.post(`/api/v1/shop/redemptions/${r.id}/undo`, {}, 'undo-1');
    expect(res.status).toBe(200);
    const revs = t.f.xpTx('REDEEM_REVERSAL');
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ lifetime_delta: 0, spendable_delta: 300, reversed_transaction_id: t.f.xpTx('REDEEM')[0]!.id });
    expect(t.s.ledger.balances().spendable).toBe(500);
    expect(res.body).toMatchObject({ id: r.id, reversed: true });
    expect((await t.api.get('/api/v1/shop/redemptions')).body[0]).toMatchObject({ id: r.id, reversed: true, reversedAt: t.ctx.nowIso() });
  });

  scenario('[F-11] Hoàn tác đổi thưởng hai lần', async () => {
    const t = createTestApp();
    t.f.balances(500, 500);
    const item = await createItem(t, { priceXp: 300 });
    const r = (await redeem(t, item.id)).body;
    expect((await t.api.post(`/api/v1/shop/redemptions/${r.id}/undo`, {}, 'u1')).status).toBe(200);
    const txCount = t.f.xpTx().length;
    const again = await t.api.post(`/api/v1/shop/redemptions/${r.id}/undo`, {}, 'u2');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REVERSED');
    expect(t.f.xpTx()).toHaveLength(txCount);
    expect(t.s.ledger.balances().spendable).toBe(500);
  });

  scenario('[F-11] Sửa giá không ảnh hưởng lịch sử', async () => {
    const t = createTestApp();
    t.f.balances(500, 500);
    const item = await createItem(t, { name: 'Xem phim', priceXp: 300 });
    await redeem(t, item.id);
    const patch = await t.api.patch(`/api/v1/shop/items/${item.id}`, { priceXp: 500 });
    expect(patch.status).toBe(200);
    expect(patch.body.priceXp).toBe(500);
    const hist = (await t.api.get('/api/v1/shop/redemptions')).body;
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ itemName: 'Xem phim', priceXp: 300 });
  });

  scenario('[F-11] Item đã xóa', async () => {
    const t = createTestApp();
    t.f.balances(1000, 1000);
    const item = await createItem(t, { priceXp: 100 });
    expect((await t.api.del(`/api/v1/shop/items/${item.id}`)).status).toBe(200);
    expect(t.f.count('reward_items WHERE id = ? AND deleted_at IS NOT NULL', item.id)).toBe(1);
    expect((await t.api.get('/api/v1/shop/items')).body).toHaveLength(0);
    const res = await redeem(t, item.id);
    expect(res.status).toBe(404);
    expect(t.f.xpTx('REDEEM')).toHaveLength(0);
  });

  scenario('[F-11] Không giới hạn số lần đổi', async () => {
    const t = createTestApp();
    t.f.balances(900, 900);
    const item = await createItem(t, { priceXp: 300 });
    for (const k of ['a', 'b', 'c']) expect((await redeem(t, item.id, `op-${k}`)).status).toBe(200);
    expect(t.f.xpTx('REDEEM')).toHaveLength(3);
    expect(t.f.count('redemptions')).toBe(3);
    expect(t.s.ledger.balances().spendable).toBe(0);
  });
});
