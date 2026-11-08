import type { HubModule } from '../core/context.js';
import { settingsModule } from './settings/index.js';
import { activityModule } from './activity/index.js';
import { notificationsModule } from './notifications/index.js';
import { ledgerModule } from './ledger/index.js';
import { xpModule } from './xp/index.js';
import { tasksModule } from './tasks/index.js';
import { goalsModule } from './goals/index.js';
import { milestonesModule } from './milestones/index.js';
import { shopModule } from './shop/index.js';
import { penaltyModule } from './penalty/index.js';
import { streakModule } from './streak/index.js';
import { dashboardModule } from './dashboard/index.js';
import { sessionsModule } from './sessions/index.js';
import { calendarModule } from './calendar/index.js';
import { schedulingModule } from './scheduling/index.js';
import { integrationsModule } from './integrations/index.js';

/** Thứ tự = thứ tự đăng ký event handler. KHÔNG sửa file này khi làm song song. */
export const MODULES: HubModule[] = [
  settingsModule,
  activityModule,
  notificationsModule,
  ledgerModule,
  xpModule,
  tasksModule,
  goalsModule,
  milestonesModule,
  shopModule,
  penaltyModule,
  streakModule,
  sessionsModule,
  calendarModule,
  schedulingModule,
  integrationsModule,
  dashboardModule,
];
