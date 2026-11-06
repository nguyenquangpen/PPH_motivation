import type { DashboardDto } from '@pph/shared';
import type { AppContext } from '../../core/context.js';
import { localDate } from '../../core/time.js';

/**
 * F-17 Dashboard API — chỉ đọc qua service của các module khác.
 */
export class DashboardService {
  constructor(private ctx: AppContext) {}

  get(): DashboardDto {
    const s = this.ctx.services;
    const tz = this.ctx.tz();
    const today = localDate(this.ctx.nowIso(), tz);
    const settings = s.settings.get();

    const dueTasks = s.tasks.list({ due: 'today' }).filter((t) => t.status !== 'CANCELLED');
    const completedToday = s.tasks.count({ completedToday: true });
    const missed = s.tasks.count({ missed: true });

    const b = s.ledger.balances();
    const streak = s.streak.get();

    return {
      today: { date: today, dueToday: dueTasks.length, completedToday, missed, tasks: dueTasks },
      goals: s.goals.list({ status: ['ACTIVE', 'NOT_STARTED', 'PAUSED'] }),
      reward: {
        lifetimeXp: b.lifetime, spendableXp: b.spendable, level: s.ledger.levelOf(b.lifetime), xpPerLevel: settings.xpPerLevel,
        xpToday: s.ledger.xpToday(), pool: s.ledger.pool(), poolTarget: settings.poolTarget,
        recent: s.ledger.listXp({ page: 1, pageSize: 5 }).items,
      },
      streak: { current: streak.current, longest: streak.longest, freezesLeft: streak.freezesLeft },
      alerts: { unreadNotifications: s.notifications.unreadCount(), missedReview: s.penalty.missedReviewCount() },
      achievements: s.milestones.recentAchievements(5),
    };
  }
}
