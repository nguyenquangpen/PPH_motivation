import type { XpSourceType, XpTxType } from '../enums.js';

export type XpTransactionDto = {
  id: string; type: XpTxType; lifetimeDelta: number; spendableDelta: number;
  sourceType: XpSourceType; sourceId: string | null; reversedTransactionId: string | null;
  reason: string | null; createdAt: string;
};

export type XpSummaryDto = {
  lifetimeXp: number; spendableXp: number; level: number; xpPerLevel: number;
  xpToday: number; pool: number; poolTarget: number;
};

export type ReconciliationDto = {
  ok: boolean;
  checks: { name: string; stored: number; recomputed: number; diff: number }[];
};
