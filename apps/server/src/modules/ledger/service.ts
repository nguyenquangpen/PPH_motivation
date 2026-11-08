import { ErrorCode, type ReconciliationDto, type XpSourceType, type XpTransactionDto, type XpTxType } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound } from '../../core/errors.js';
import { newId } from '../../core/ids.js';
import { dayRangeUtc, localDate } from '../../core/time.js';

type XpRow = {
  id: string; type: XpTxType; lifetime_delta: number; spendable_delta: number; source_type: XpSourceType;
  source_id: string | null; reversed_transaction_id: string | null; reason: string | null; created_at: string;
};

const toDto = (r: XpRow): XpTransactionDto => ({
  id: r.id, type: r.type, lifetimeDelta: r.lifetime_delta, spendableDelta: r.spendable_delta,
  sourceType: r.source_type, sourceId: r.source_id, reversedTransactionId: r.reversed_transaction_id,
  reason: r.reason, createdAt: r.created_at,
});

const REVERSAL_OF: Partial<Record<XpTxType, XpTxType>> = {
  TASK_REWARD: 'REWARD_REVERSAL',
  POOL_REWARD: 'REWARD_REVERSAL',
  MILESTONE_REWARD: 'REWARD_REVERSAL',
  GOAL_REWARD: 'REWARD_REVERSAL',
  REDEEM: 'REDEEM_REVERSAL',
  PENALTY: 'PENALTY_REVERSAL',
};

/** Δ Lifetime / Spendable theo loại giao dịch (F-09). amount luôn dương. */
const deltasFor = (type: XpTxType, amount: number): { lifetime: number; spendable: number } => {
  switch (type) {
    case 'TASK_REWARD':
    case 'POOL_REWARD':
    case 'MILESTONE_REWARD':
    case 'GOAL_REWARD':
      return { lifetime: amount, spendable: amount };
    case 'REDEEM':
    case 'PENALTY':
      return { lifetime: 0, spendable: -amount };
    default:
      throw new Error(`deltasFor: loại ${type} chỉ tạo qua reverseXp`);
  }
};

export type XpFilters = { type?: string; sourceType?: string; sourceId?: string; from?: string; to?: string; page?: number; pageSize?: number };

/**
 * F-09 Ledger (CORE). Nguồn sự thật duy nhất cho XP, Contribution, Pool.
 * Giao dịch không bao giờ sửa/xóa; điều chỉnh bằng giao dịch đảo ngược.
 */
export class LedgerService {
  constructor(private ctx: AppContext) {}

  // ---------------- XP ----------------

  balances(): { lifetime: number; spendable: number } {
    const r = this.ctx.db
      .prepare('SELECT COALESCE(SUM(lifetime_delta),0) l, COALESCE(SUM(spendable_delta),0) s FROM xp_transactions')
      .get() as { l: number; s: number };
    return { lifetime: r.l, spendable: r.s };
  }

  levelOf(lifetime: number): number {
    const per = this.ctx.services.settings.get().xpPerLevel;
    return Math.floor(Math.max(lifetime, 0) / per) + 1;
  }

  level(): number {
    return this.levelOf(this.balances().lifetime);
  }

  /** Tạo giao dịch XP (reward/redeem/penalty). amount > 0. amount = 0 → không tạo, trả null. */
  addXp(input: { type: XpTxType; amount: number; sourceType: XpSourceType; sourceId: string | null; reason?: string }): XpTransactionDto | null {
    if (input.amount <= 0) return null;
    const d = deltasFor(input.type, input.amount);
    return this.insertXp(input.type, d.lifetime, d.spendable, input.sourceType, input.sourceId, null, input.reason ?? null);
  }

  /** Đảo ngược một giao dịch đúng một lần. */
  reverseXp(transactionId: string, reason?: string): XpTransactionDto {
    const orig = this.ctx.db.prepare('SELECT * FROM xp_transactions WHERE id = ?').get(transactionId) as XpRow | undefined;
    if (!orig) throw notFound('Giao dịch XP');
    const revType = REVERSAL_OF[orig.type];
    if (!revType) throw conflict(ErrorCode.CONFLICT, 'Không thể đảo ngược giao dịch đảo ngược');
    if (this.isReversed(transactionId)) throw conflict(ErrorCode.ALREADY_REVERSED, 'Giao dịch đã được đảo ngược');
    return this.insertXp(revType, -orig.lifetime_delta, -orig.spendable_delta, orig.source_type, orig.source_id, orig.id,
      reason ?? `Đảo ngược ${orig.type}`);
  }

  isReversed(transactionId: string): boolean {
    return !!this.ctx.db.prepare('SELECT 1 FROM xp_transactions WHERE reversed_transaction_id = ?').get(transactionId);
  }

  getXp(transactionId: string): XpTransactionDto | null {
    const r = this.ctx.db.prepare('SELECT * FROM xp_transactions WHERE id = ?').get(transactionId) as XpRow | undefined;
    return r ? toDto(r) : null;
  }

  /** Giao dịch chưa bị đảo của một nguồn theo loại (ví dụ MILESTONE_REWARD của milestone X). */
  activeXpBySource(sourceType: XpSourceType, sourceId: string, type: XpTxType): XpTransactionDto[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT t.* FROM xp_transactions t
         WHERE t.source_type = ? AND t.source_id = ? AND t.type = ?
           AND NOT EXISTS (SELECT 1 FROM xp_transactions r WHERE r.reversed_transaction_id = t.id)
         ORDER BY t.rowid`,
      )
      .all(sourceType, sourceId, type) as XpRow[];
    return rows.map(toDto);
  }

  listXp(f: XpFilters = {}): { items: XpTransactionDto[]; page: number; pageSize: number; total: number } {
    const where: string[] = [];
    const args: unknown[] = [];
    if (f.type) { where.push('type = ?'); args.push(f.type); }
    if (f.sourceType) { where.push('source_type = ?'); args.push(f.sourceType); }
    if (f.sourceId) { where.push('source_id = ?'); args.push(f.sourceId); }
    if (f.from) { where.push('created_at >= ?'); args.push(f.from); }
    if (f.to) { where.push('created_at < ?'); args.push(f.to); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pageSize = f.pageSize ?? 50;
    const page = Math.max(f.page ?? 1, 1);
    const total = (this.ctx.db.prepare(`SELECT COUNT(*) c FROM xp_transactions ${w}`).get(...args) as { c: number }).c;
    const rows = this.ctx.db
      .prepare(`SELECT * FROM xp_transactions ${w} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize) as XpRow[];
    return { items: rows.map(toDto), page, pageSize, total };
  }

  /** XP kiếm hôm nay: Σ lifetime_delta > 0 trong ngày lịch hiện tại (timezone Owner). */
  xpToday(): number {
    const tz = this.ctx.tz();
    const { start, end } = dayRangeUtc(localDate(this.ctx.nowIso(), tz), tz);
    const r = this.ctx.db
      .prepare('SELECT COALESCE(SUM(lifetime_delta),0) s FROM xp_transactions WHERE lifetime_delta > 0 AND created_at >= ? AND created_at < ?')
      .get(start, end) as { s: number };
    return r.s;
  }

  private insertXp(type: XpTxType, lifetime: number, spendable: number, sourceType: XpSourceType, sourceId: string | null,
    reversedId: string | null, reason: string | null): XpTransactionDto {
    const levelBefore = this.level();
    const id = newId();
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare(
        `INSERT INTO xp_transactions (id, type, lifetime_delta, spendable_delta, source_type, source_id, reversed_transaction_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, type, lifetime, spendable, sourceType, sourceId, reversedId, reason, now);
    const levelAfter = this.level();
    const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    const shown = lifetime !== 0 ? lifetime : spendable;
    this.ctx.services.activity.log({
      type: `XP_${type}`,
      message: lifetime > 0 ? `Nhận ${sign(shown)} XP` : `${type}: ${sign(shown)} XP`,
      after: { transactionId: id, lifetimeDelta: lifetime, spendableDelta: spendable, sourceType, sourceId },
    });
    if (levelAfter > levelBefore) {
      this.ctx.services.activity.log({ type: 'LEVEL_UP', message: `Lên Level ${levelAfter}`, before: levelBefore, after: levelAfter });
    }
    this.ctx.events.emit('xp.transaction_created', {
      transactionId: id, type, lifetimeDelta: lifetime, spendableDelta: spendable, levelBefore, levelAfter,
    });
    return { id, type, lifetimeDelta: lifetime, spendableDelta: spendable, sourceType, sourceId, reversedTransactionId: reversedId, reason, createdAt: now };
  }

  // ---------------- Contribution ----------------

  goalContribution(goalId: string): number {
    const r = this.ctx.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM contribution_ledger WHERE goal_id = ?').get(goalId) as { s: number };
    return r.s;
  }

  addContribution(goalId: string, taskId: string | null, amount: number): string {
    const before = this.goalContribution(goalId);
    const id = newId();
    this.ctx.db
      .prepare('INSERT INTO contribution_ledger (id, goal_id, task_id, type, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, goalId, taskId, 'ADD', amount, this.ctx.nowIso());
    this.ctx.events.emit('goal.contribution_changed', { goalId, before, after: before + amount });
    return id;
  }

  reverseContribution(entryId: string): string {
    const orig = this.ctx.db.prepare('SELECT * FROM contribution_ledger WHERE id = ?').get(entryId) as
      | { id: string; goal_id: string; task_id: string | null; amount: number } | undefined;
    if (!orig) throw notFound('Contribution entry');
    if (this.ctx.db.prepare('SELECT 1 FROM contribution_ledger WHERE reversed_entry_id = ?').get(entryId)) {
      throw conflict(ErrorCode.ALREADY_REVERSED, 'Contribution đã được đảo ngược');
    }
    const before = this.goalContribution(orig.goal_id);
    const id = newId();
    this.ctx.db
      .prepare('INSERT INTO contribution_ledger (id, goal_id, task_id, type, amount, reversed_entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, orig.goal_id, orig.task_id, 'REVERSAL', -orig.amount, entryId, this.ctx.nowIso());
    this.ctx.events.emit('goal.contribution_changed', { goalId: orig.goal_id, before, after: before - orig.amount });
    return id;
  }

  // ---------------- Pool ----------------

  pool(): number {
    const r = this.ctx.db.prepare('SELECT COALESCE(SUM(amount),0) s FROM pool_ledger').get() as { s: number };
    return r.s;
  }

  /** POOL_ADD rồi trả POOL_REWARD cho mỗi PoolTarget vượt qua (F-08). Trả id entry ADD. */
  poolAdd(taskId: string | null, amount: number): string {
    const id = newId();
    const now = this.ctx.nowIso();
    this.ctx.db.prepare('INSERT INTO pool_ledger (id, type, amount, task_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, 'ADD', amount, taskId, now);
    const s = this.ctx.services.settings.get();
    while (this.pool() >= s.poolTarget) {
      const tx = this.addXp({ type: 'POOL_REWARD', amount: s.poolRewardXp, sourceType: 'POOL', sourceId: null, reason: 'Accumulation Pool đầy' });
      this.ctx.db
        .prepare('INSERT INTO pool_ledger (id, type, amount, task_id, xp_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newId(), 'PAYOUT', -s.poolTarget, null, tx?.id ?? null, now);
    }
    return id;
  }

  poolDeduct(taskId: string | null, amount: number): string {
    const id = newId();
    this.ctx.db
      .prepare('INSERT INTO pool_ledger (id, type, amount, task_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'DEDUCT', -amount, taskId, this.ctx.nowIso());
    return id;
  }

  // ---------------- Reconciliation ----------------

  reconciliation(): ReconciliationDto {
    const db = this.ctx.db;
    const checks: ReconciliationDto['checks'] = [];
    const bal = this.balances();
    // Lifetime: tổng theo từng giao dịch vs tổng theo loại
    const byType = db.prepare('SELECT type, SUM(lifetime_delta) l, SUM(spendable_delta) s FROM xp_transactions GROUP BY type').all() as
      { type: string; l: number; s: number }[];
    const lt = byType.reduce((a, r) => a + r.l, 0);
    const sp = byType.reduce((a, r) => a + r.s, 0);
    checks.push({ name: 'lifetimeXp', stored: bal.lifetime, recomputed: lt, diff: bal.lifetime - lt });
    checks.push({ name: 'spendableXp', stored: bal.spendable, recomputed: sp, diff: bal.spendable - sp });
    // Mỗi giao dịch bị đảo phải có tổng cặp = 0
    const badPairs = db
      .prepare(`SELECT COUNT(*) c FROM xp_transactions r JOIN xp_transactions o ON r.reversed_transaction_id = o.id
                WHERE r.lifetime_delta + o.lifetime_delta <> 0 OR r.spendable_delta + o.spendable_delta <> 0`)
      .get() as { c: number };
    checks.push({ name: 'reversalPairs', stored: 0, recomputed: badPairs.c, diff: badPairs.c });
    // Pool
    const pool = this.pool();
    const poolRe = db.prepare("SELECT COALESCE(SUM(CASE type WHEN 'ADD' THEN amount ELSE amount END),0) s FROM pool_ledger").get() as { s: number };
    checks.push({ name: 'pool', stored: pool, recomputed: poolRe.s, diff: pool - poolRe.s });
    // Contribution mỗi goal = Σ contribution của các completion chưa undo
    const goals = db.prepare('SELECT DISTINCT goal_id FROM contribution_ledger').all() as { goal_id: string }[];
    for (const g of goals) {
      const stored = this.goalContribution(g.goal_id);
      const re = db
        .prepare('SELECT COALESCE(SUM(contribution),0) s FROM task_completions WHERE goal_id = ? AND undone_at IS NULL')
        .get(g.goal_id) as { s: number };
      checks.push({ name: `goal:${g.goal_id}`, stored, recomputed: re.s, diff: stored - re.s });
    }
    return { ok: checks.every((c) => c.diff === 0), checks };
  }
}
