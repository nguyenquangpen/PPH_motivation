import type { FastifyInstance } from 'fastify';
import type { DB } from './db.js';
import type { Clock } from './clock.js';
import type { EventBus } from './events.js';
import type { Scheduler } from './scheduler.js';
import type { SettingsService } from '../modules/settings/service.js';
import type { ActivityService } from '../modules/activity/service.js';
import type { NotificationService } from '../modules/notifications/service.js';
import type { LedgerService } from '../modules/ledger/service.js';
import type { XpService } from '../modules/xp/service.js';
import type { TaskService } from '../modules/tasks/service.js';
import type { GoalService } from '../modules/goals/service.js';
import type { MilestoneService } from '../modules/milestones/service.js';
import type { ShopService } from '../modules/shop/service.js';
import type { PenaltyService } from '../modules/penalty/service.js';
import type { StreakService } from '../modules/streak/service.js';
import type { DashboardService } from '../modules/dashboard/service.js';

export interface Services {
  settings: SettingsService;
  activity: ActivityService;
  notifications: NotificationService;
  ledger: LedgerService;
  xp: XpService;
  tasks: TaskService;
  goals: GoalService;
  milestones: MilestoneService;
  shop: ShopService;
  penalty: PenaltyService;
  streak: StreakService;
  dashboard: DashboardService;
}

export interface AppContext {
  db: DB;
  clock: Clock;
  events: EventBus;
  scheduler: Scheduler;
  services: Services;
  /** Thời điểm hiện tại, ISO UTC */
  nowIso(): string;
  /** Timezone Owner hiện tại (từ Settings) */
  tz(): string;
}

/**
 * Hợp đồng module. Thứ tự gọi: tất cả init() (tạo service) → tất cả wire() (đăng ký event/job) → routes().
 */
export interface HubModule {
  name: string;
  init(ctx: AppContext): void;
  wire?(ctx: AppContext): void;
  routes?(app: FastifyInstance, ctx: AppContext): void;
}
