import { z } from 'zod';

export const SettingsObject = z.object({
  multiplier: z.number().positive().max(100),
  refDuration: z.number().int().min(1).max(1440),
  minFactor: z.number().positive().max(10),
  maxFactor: z.number().positive().max(10),
  smallThreshold: z.number().int().min(0).max(10000),
  poolTarget: z.number().int().min(1).max(1_000_000),
  poolRewardXp: z.number().int().min(0).max(1_000_000),
  defaultMilestoneXp: z.number().int().min(0).max(1_000_000),
  defaultGoalXp: z.number().int().min(0).max(1_000_000),
  xpPerLevel: z.number().int().min(1).max(1_000_000),
  penaltyEnabled: z.boolean(),
  penaltyPercent: z.number().int().min(0).max(100),
  gracePeriodHours: z.number().int().min(0).max(168),
  freezesPerMonth: z.number().int().min(0).max(31),
  behindMargin: z.number().int().min(0).max(100),
  nearDueDays: z.number().int().min(0).max(365),
  presetMajor: z.number().int().min(0).max(10000),
  presetMedium: z.number().int().min(0).max(10000),
  presetMinor: z.number().int().min(0).max(10000),
  timezone: z.string().min(1),
  // ---- Release 2: Scheduling (F-26, F-28) ----
  workingHours: z.lazy(() => WorkingHoursSchema),
  insufficientMinMinutes: z.number().int().min(0).max(1440),
  insufficientMinPercent: z.number().int().min(0).max(100),
  overloadPercent: z.number().int().min(1).max(500),
});

/** Giờ làm việc theo thứ: mon..sun → danh sách khung HH:mm–HH:mm (end tối đa 24:00). Kiểm tra chồng khung ở service. */
export const Weekday = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof Weekday)[number];
const HHMM = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Định dạng HH:mm');
export const TimeWindowSchema = z.object({ start: HHMM, end: HHMM });
export type TimeWindow = z.infer<typeof TimeWindowSchema>;
export const WorkingHoursSchema = z.object({
  mon: z.array(TimeWindowSchema), tue: z.array(TimeWindowSchema), wed: z.array(TimeWindowSchema),
  thu: z.array(TimeWindowSchema), fri: z.array(TimeWindowSchema), sat: z.array(TimeWindowSchema), sun: z.array(TimeWindowSchema),
});
export type WorkingHours = z.infer<typeof WorkingHoursSchema>;
const DEFAULT_DAY: TimeWindow[] = [{ start: '08:00', end: '22:00' }];

export const SettingsSchema = SettingsObject.refine((s) => s.minFactor <= s.maxFactor, {
  message: 'MinFactor phải ≤ MaxFactor',
  path: ['minFactor'],
});
export type Settings = z.infer<typeof SettingsObject>;

export const UpdateSettingsSchema = SettingsObject.partial();

export const DEFAULT_SETTINGS: Settings = {
  multiplier: 1.0, refDuration: 60, minFactor: 0.5, maxFactor: 2.0,
  smallThreshold: 20, poolTarget: 100, poolRewardXp: 120,
  defaultMilestoneXp: 300, defaultGoalXp: 1000, xpPerLevel: 1000,
  penaltyEnabled: true, penaltyPercent: 50, gracePeriodHours: 24,
  freezesPerMonth: 2, behindMargin: 15, nearDueDays: 14,
  presetMajor: 100, presetMedium: 50, presetMinor: 10,
  timezone: 'Asia/Ho_Chi_Minh',
  workingHours: { mon: DEFAULT_DAY, tue: DEFAULT_DAY, wed: DEFAULT_DAY, thu: DEFAULT_DAY, fri: DEFAULT_DAY, sat: DEFAULT_DAY, sun: DEFAULT_DAY },
  insufficientMinMinutes: 15,
  insufficientMinPercent: 10,
  overloadPercent: 100,
};

export const SETTINGS_GROUPS: Record<string, (keyof Settings)[]> = {
  xp: ['multiplier', 'refDuration', 'minFactor', 'maxFactor'],
  pool: ['smallThreshold', 'poolTarget', 'poolRewardXp'],
  reward: ['defaultMilestoneXp', 'defaultGoalXp'],
  level: ['xpPerLevel'],
  penalty: ['penaltyEnabled', 'penaltyPercent', 'gracePeriodHours'],
  streak: ['freezesPerMonth'],
  goalWarning: ['behindMargin', 'nearDueDays'],
  preset: ['presetMajor', 'presetMedium', 'presetMinor'],
  general: ['timezone'],
  scheduling: ['workingHours', 'insufficientMinMinutes', 'insufficientMinPercent', 'overloadPercent'],
};
