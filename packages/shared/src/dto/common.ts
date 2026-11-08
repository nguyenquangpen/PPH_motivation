import { z } from 'zod';

export const Title = z.string().trim().min(1, 'Title bắt buộc').max(200);
export const Description = z.string().max(5000).nullish();
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD');
export const IsoDateTime = z.string().datetime({ offset: true });
export const Uuid = z.string().uuid();
export const Contribution = z.number().int().min(0).max(10000);
export const Duration = z.number().int().min(1).max(1440);
export const PositiveXp = z.number().int().min(1).max(1_000_000);
export const NonNegXp = z.number().int().min(0).max(1_000_000);

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
