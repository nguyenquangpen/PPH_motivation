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
import type { SessionService } from '../modules/sessions/service.js';
import type { SchedulingService } from '../modules/scheduling/service.js';
import type { CalendarService } from '../modules/calendar/service.js';
import type { IntegrationService } from '../modules/integrations/service.js';
import type { CalendarProvider, SecretStore } from '../modules/calendar/provider.js';

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
  // Release 2
  sessions: SessionService;
  scheduling: SchedulingService;
  calendar: CalendarService;
  integrations: IntegrationService;
}

/** Phụ thuộc tiêm vào khi dựng app (test truyền FakeCalendarProvider + secret store trong bộ nhớ). */
export interface AppOptions {
  calendarProvider?: CalendarProvider;
  secretStore?: SecretStore;
  /** Thư mục dữ liệu (để module tự tạo file key khi cần); undefined khi DB :memory: */
  dataDir?: string;
}

export interface AppContext {
  db: DB;
  clock: Clock;
  events: EventBus;
  scheduler: Scheduler;
  services: Services;
  options: AppOptions;
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
