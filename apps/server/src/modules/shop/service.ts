import {
  ErrorCode, type CreateRewardItemInput, type RedemptionDto, type RewardItemDto, type RewardItemState, type UnlockType,
  type UpdateRewardItemInput,
} from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { conflict, notFound, rule, validation } from '../../core/errors.js';
import { newId } from '../../core/ids.js';

type ItemRow = {
  id: string; name: string; description: string | null; price_xp: number; icon: string | null;
  unlock_type: UnlockType | null; unlock_value: string | null; created_at: string; updated_at: string; deleted_at: string | null;
};

type RedemptionRow = {
  id: string; item_id: string; item_name: string; price_xp: number; xp_transaction_id: string;
  reversal_transaction_id: string | null; reversed_at: string | null; created_at: string;
};

const redemptionDto = (r: RedemptionRow): RedemptionDto => ({
  id: r.id, itemId: r.item_id, itemName: r.item_name, priceXp: r.price_xp, createdAt: r.created_at,
  reversed: r.reversed_at !== null, reversedAt: r.reversed_at,
});

/**
 * F-11 Reward Shop. Trạng thái Item (LOCKED / INSUFFICIENT_XP / AVAILABLE) là dẫn xuất, tính tại thời điểm đọc,
 * nên Item tự khóa lại khi điều kiện không còn thỏa (ví dụ Milestone bị mở lại).
 */
export class ShopService {
  constructor(private ctx: AppContext) {}

  listItems(): RewardItemDto[] {
    const rows = this.ctx.db
      .prepare('SELECT * FROM reward_items WHERE deleted_at IS NULL ORDER BY created_at, rowid')
      .all() as ItemRow[];
    const { spendable } = this.ctx.services.ledger.balances();
    return rows.map((r) => this.toDto(r, spendable));
  }

  getItem(id: string): RewardItemDto {
    return this.toDto(this.row(id), this.ctx.services.ledger.balances().spendable);
  }

  createItem(input: CreateRewardItemInput): RewardItemDto {
    const unlock = this.normalizeUnlock(input.unlockType ?? null, input.unlockValue ?? null);
    const id = newId();
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare(
        `INSERT INTO reward_items (id, name, description, price_xp, icon, unlock_type, unlock_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.description ?? null, input.priceXp, input.icon ?? null, unlock.type, unlock.value, now, now);
    const dto = this.getItem(id);
    this.ctx.services.activity.log({ type: 'SHOP_ITEM_CREATED', message: `Tạo phần thưởng '${dto.name}'`, itemId: id, after: dto });
    return dto;
  }

  updateItem(id: string, input: UpdateRewardItemInput): RewardItemDto {
    const before = this.row(id);
    const beforeDto = this.toDto(before, this.ctx.services.ledger.balances().spendable);
    const unlockTouched = input.unlockType !== undefined || input.unlockValue !== undefined;
    const unlock = unlockTouched
      ? this.normalizeUnlock(
        input.unlockType !== undefined ? input.unlockType : before.unlock_type,
        input.unlockValue !== undefined ? input.unlockValue : before.unlock_value,
      )
      : { type: before.unlock_type, value: before.unlock_value };
    this.ctx.db
      .prepare(
        `UPDATE reward_items SET name = ?, description = ?, price_xp = ?, icon = ?, unlock_type = ?, unlock_value = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name ?? before.name,
        input.description !== undefined ? input.description : before.description,
        input.priceXp ?? before.price_xp,
        input.icon !== undefined ? input.icon : before.icon,
        unlock.type, unlock.value, this.ctx.nowIso(), id,
      );
    const dto = this.getItem(id);
    this.ctx.services.activity.log({
      type: 'SHOP_ITEM_UPDATED', message: `Sửa phần thưởng '${dto.name}'`, itemId: id, before: beforeDto, after: dto,
    });
    return dto;
  }

  deleteItem(id: string): { id: string; deleted: true } {
    const r = this.row(id);
    this.ctx.db.prepare('UPDATE reward_items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(this.ctx.nowIso(), this.ctx.nowIso(), id);
    this.ctx.services.activity.log({ type: 'SHOP_ITEM_DELETED', message: `Xóa phần thưởng '${r.name}'`, itemId: id });
    return { id, deleted: true };
  }

  /** Đổi thưởng: kiểm tra xóa → khóa → đủ Spendable, rồi REDEEM + Redemption (snapshot tên, giá) + Activity. */
  redeem(itemId: string): RedemptionDto {
    const item = this.row(itemId);
    const spendable = this.ctx.services.ledger.balances().spendable;
    const dto = this.toDto(item, spendable);
    if (dto.state === 'LOCKED') {
      throw rule(ErrorCode.ITEM_LOCKED, dto.lockReason ?? 'Bị khóa', { lockReason: dto.lockReason });
    }
    if (dto.state === 'INSUFFICIENT_XP') {
      throw rule(ErrorCode.INSUFFICIENT_XP, `Còn thiếu ${dto.missingXp} XP`, { missingXp: dto.missingXp });
    }
    const id = newId();
    const tx = this.ctx.services.ledger.addXp({
      type: 'REDEEM', amount: item.price_xp, sourceType: 'REDEMPTION', sourceId: id, reason: `Đổi '${item.name}'`,
    })!;
    const now = this.ctx.nowIso();
    this.ctx.db
      .prepare(
        `INSERT INTO redemptions (id, item_id, item_name, price_xp, xp_transaction_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, item.id, item.name, item.price_xp, tx.id, now);
    this.ctx.services.activity.log({
      type: 'REDEMPTION_CREATED', message: `Đổi thưởng '${item.name}' (−${item.price_xp} XP)`, itemId: item.id,
      after: { redemptionId: id, priceXp: item.price_xp, transactionId: tx.id },
    });
    return this.redemption(id);
  }

  undoRedemption(redemptionId: string): RedemptionDto {
    const r = this.ctx.db.prepare('SELECT * FROM redemptions WHERE id = ?').get(redemptionId) as RedemptionRow | undefined;
    if (!r) throw notFound('Redemption');
    if (r.reversed_at !== null || this.ctx.services.ledger.isReversed(r.xp_transaction_id)) {
      throw conflict(ErrorCode.ALREADY_REVERSED, 'Redemption đã được hoàn tác');
    }
    const rev = this.ctx.services.ledger.reverseXp(r.xp_transaction_id, `Hoàn tác đổi '${r.item_name}'`);
    this.ctx.db
      .prepare('UPDATE redemptions SET reversal_transaction_id = ?, reversed_at = ? WHERE id = ?')
      .run(rev.id, this.ctx.nowIso(), redemptionId);
    this.ctx.services.activity.log({
      type: 'REDEMPTION_REVERSED', message: `Hoàn tác đổi thưởng '${r.item_name}' (+${r.price_xp} XP)`, itemId: r.item_id,
      after: { redemptionId, transactionId: rev.id },
    });
    return this.redemption(redemptionId);
  }

  listRedemptions(): RedemptionDto[] {
    const rows = this.ctx.db.prepare('SELECT * FROM redemptions ORDER BY created_at DESC, rowid DESC').all() as RedemptionRow[];
    return rows.map(redemptionDto);
  }

  // ---------------- internals ----------------

  private redemption(id: string): RedemptionDto {
    return redemptionDto(this.ctx.db.prepare('SELECT * FROM redemptions WHERE id = ?').get(id) as RedemptionRow);
  }

  private row(id: string): ItemRow {
    const r = this.ctx.db.prepare('SELECT * FROM reward_items WHERE id = ? AND deleted_at IS NULL').get(id) as ItemRow | undefined;
    if (!r) throw notFound('Phần thưởng');
    return r;
  }

  /** null nếu điều kiện thỏa; ngược lại là lockReason. */
  private lockReason(r: ItemRow): string | null {
    if (!r.unlock_type) return null;
    const v = r.unlock_value ?? '';
    switch (r.unlock_type) {
      case 'LEVEL': {
        const n = Number(v);
        return this.ctx.services.ledger.level() >= n ? null : `Bị khóa: cần Level ${n}`;
      }
      case 'MILESTONE_COMPLETED': {
        if (this.ctx.services.milestones.isCompleted(v)) return null;
        const t = this.title('milestones', v);
        return `Bị khóa: cần hoàn thành Milestone${t ? ` '${t}'` : ''}`;
      }
      case 'GOAL_COMPLETED': {
        if (this.ctx.services.goals.isCompleted(v)) return null;
        const t = this.title('goals', v);
        return `Bị khóa: cần hoàn thành Goal${t ? ` '${t}'` : ''}`;
      }
      default:
        return null;
    }
  }

  private title(table: 'milestones' | 'goals', id: string): string | null {
    const r = this.ctx.db.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(id) as { title: string } | undefined;
    return r?.title ?? null;
  }

  private toDto(r: ItemRow, spendable: number): RewardItemDto {
    const lockReason = this.lockReason(r);
    const missingXp = Math.max(r.price_xp - spendable, 0);
    const state: RewardItemState = lockReason ? 'LOCKED' : missingXp > 0 ? 'INSUFFICIENT_XP' : 'AVAILABLE';
    return {
      id: r.id, name: r.name, description: r.description, priceXp: r.price_xp, icon: r.icon,
      unlockType: r.unlock_type, unlockValue: r.unlock_value, state, missingXp, lockReason,
    };
  }

  private normalizeUnlock(type: UnlockType | null, value: string | null): { type: UnlockType | null; value: string | null } {
    if (!type) return { type: null, value: null };
    const v = (value ?? '').trim();
    if (!v) throw validation('Thiếu giá trị điều kiện mở khóa', { field: 'unlockValue' });
    if (type === 'LEVEL') {
      if (!/^\d+$/.test(v) || Number(v) < 1) throw validation('Level mở khóa phải là số nguyên ≥ 1', { field: 'unlockValue' });
      return { type, value: String(Number(v)) };
    }
    const table = type === 'MILESTONE_COMPLETED' ? 'milestones' : 'goals';
    if (!this.ctx.db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(v)) {
      throw notFound(type === 'MILESTONE_COMPLETED' ? 'Milestone' : 'Goal', { field: 'unlockValue' });
    }
    return { type, value: v };
  }
}
