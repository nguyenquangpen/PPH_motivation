import { z } from 'zod';
import { UnlockType } from '../enums.js';

export const CreateRewardItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).nullish(),
  priceXp: z.number().int().min(1).max(1_000_000),
  icon: z.string().max(50).nullish(),
  unlockType: z.enum(UnlockType).nullish(),
  /** LEVEL → số level (chuỗi số); MILESTONE_COMPLETED/GOAL_COMPLETED → id */
  unlockValue: z.string().nullish(),
});
export const UpdateRewardItemSchema = CreateRewardItemSchema.partial();
export type CreateRewardItemInput = z.infer<typeof CreateRewardItemSchema>;
export type UpdateRewardItemInput = z.infer<typeof UpdateRewardItemSchema>;

export type RewardItemState = 'AVAILABLE' | 'INSUFFICIENT_XP' | 'LOCKED';

export type RewardItemDto = {
  id: string; name: string; description: string | null; priceXp: number; icon: string | null;
  unlockType: UnlockType | null; unlockValue: string | null;
  state: RewardItemState; missingXp: number; lockReason: string | null;
};

export type RedemptionDto = {
  id: string; itemId: string; itemName: string; priceXp: number; createdAt: string;
  reversed: boolean; reversedAt: string | null;
};
