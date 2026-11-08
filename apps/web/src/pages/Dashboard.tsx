import { CalendarErrorBanner, ScheduleWarningsCard } from '../components/ScheduleWarningsCard';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { DashboardDto, GoalDto, TaskDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, useTimezone } from '../api/queries';
import { Badge, Empty, ProgressBar, QueryView } from '../components/ui';
import { CompleteButton } from '../components/taskActions';
import { StreakCalendar } from '../components/StreakCalendar';
import {
  daysRemainingLabel, fmtDate, fmtDateTime, fmtNum, fmtXp, GOAL_STATUS_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL,
  WARNING_LABEL, XP_TYPE_LABEL,
} from '../lib/format';
import { expectedXpLabel } from '../lib/xp';

const TX_LINK = '/rewards#transactions';

function Stat({ label, value, to }: { label: string; value: ReactNode; to?: string }) {
  const v = <span className="text-xl font-bold tabular-nums">{value}</span>;
  return (
    <div className="flex flex-col">
      <span className="text-xs muted">{label}</span>
      {to ? <Link to={to} className="hover:text-indigo-600 hover:underline dark:hover:text-indigo-400" title="Xem lịch sử giao dịch">{v}</Link> : v}
    </div>
  );
}

function TodaySection({ today, tz }: { today: DashboardDto['today']; tz: string }) {
  return (
    <section className="card" aria-labelledby="today-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="today-h" className="card-title mb-0">Hôm nay <span className="text-sm font-normal muted">{fmtDate(today.date)}</span></h2>
        <Link to="/tasks" className="link text-sm">+ Tạo Task</Link>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Stat label="Đến hạn hôm nay" value={today.dueToday} />
        <Stat label="Đã hoàn thành hôm nay" value={today.completedToday} />
        <Stat label="Quá hạn" value={<span className={today.missed > 0 ? 'text-rose-600' : ''}>{today.missed}</span>} />
      </div>
      {today.tasks.length === 0 ? (
        <Empty>Không có Task nào cho hôm nay.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {today.tasks.map((t) => <TodayRow key={t.id} t={t} tz={tz} />)}
        </ul>
      )}
    </section>
  );
}

function TodayRow({ t, tz }: { t: TaskDto; tz: string }) {
  const done = t.status === 'COMPLETED';
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <Link to={`/tasks/${t.id}`} className={`block truncate font-medium hover:underline ${done ? 'line-through muted' : ''}`}>{t.title}</Link>
        <div className="flex flex-wrap items-center gap-2 text-xs muted">
          <span>{PRIORITY_LABEL[t.priority]}</span>
          {t.deadline && <span>Hạn {fmtDateTime(t.deadline, tz)}</span>}
          <span>{expectedXpLabel(t.expectedXp)}</span>
          {t.missed && <Badge color="red">Quá hạn</Badge>}
          {t.status !== 'TODO' && <Badge color={done ? 'green' : 'blue'}>{TASK_STATUS_LABEL[t.status]}</Badge>}
        </div>
      </div>
      {!done && t.status !== 'CANCELLED' && <CompleteButton task={t} />}
    </li>
  );
}

function GoalRow({ g }: { g: GoalDto }) {
  const p = g.progress;
  return (
    <li className="py-2">
      <div className="mb-1 flex items-center gap-2">
        <Link to={`/goals/${g.id}`} className="min-w-0 truncate font-medium hover:underline">{g.icon ? `${g.icon} ` : ''}{g.title}</Link>
        <Badge>{GOAL_STATUS_LABEL[g.status]}</Badge>
        {p.warnings.map((w) => <Badge key={w} color="amber">{WARNING_LABEL[w] ?? w}</Badge>)}
        <span className="ml-auto shrink-0 text-xs muted">
          {fmtNum(p.completedContribution)}/{fmtNum(p.targetContribution ?? g.targetContribution)} · {daysRemainingLabel(p.daysRemaining)}
        </span>
      </div>
      <ProgressBar percent={p.displayPercent} overflow={p.overflowContribution} warn={p.warnings.length > 0} />
    </li>
  );
}

function RewardSection({ r, tz }: { r: DashboardDto['reward']; tz: string }) {
  const poolPct = r.poolTarget > 0 ? (Math.max(r.pool, 0) / r.poolTarget) * 100 : 0;
  return (
    <section className="card" aria-labelledby="reward-h">
      <h2 id="reward-h" className="card-title">Phần thưởng</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Level" value={r.level} to={TX_LINK} />
        <Stat label="Lifetime XP" value={fmtNum(r.lifetimeXp)} to={TX_LINK} />
        <Stat label="Spendable XP" value={<span className={r.spendableXp < 0 ? 'text-rose-600' : ''}>{fmtNum(r.spendableXp)}</span>} to={TX_LINK} />
        <Stat label="XP hôm nay" value={fmtNum(r.xpToday)} to={TX_LINK} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="muted">Pool</span>
          <Link to={TX_LINK} className="font-semibold hover:underline">Pool {r.pool}/{r.poolTarget}</Link>
        </div>
        <ProgressBar percent={poolPct} size="sm" />
      </div>
      <h3 className="mb-1 mt-4 text-sm font-semibold">Giao dịch gần nhất</h3>
      {r.recent.length === 0 ? (
        <Empty>Chưa có giao dịch.</Empty>
      ) : (
        <ul className="text-sm">
          {r.recent.slice(0, 5).map((tx) => {
            const delta = tx.lifetimeDelta !== 0 ? tx.lifetimeDelta : tx.spendableDelta;
            return (
              <li key={tx.id} className="flex items-center justify-between gap-2 py-0.5">
                <span className="min-w-0 truncate">{XP_TYPE_LABEL[tx.type] ?? tx.type} <span className="text-xs muted">{fmtDateTime(tx.createdAt, tz)}</span></span>
                <Link to={TX_LINK} className={`shrink-0 font-semibold tabular-nums hover:underline ${delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {fmtXp(delta)} XP
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StreakSection({ s }: { s: DashboardDto['streak'] }) {
  // Calendar comes from GET /streak; the numbers stay from the dashboard payload.
  const q = useQuery({ queryKey: qk.streak, queryFn: api.streak, retry: false });
  return (
    <section className="card min-w-0" aria-labelledby="streak-h">
      <h2 id="streak-h" className="card-title">Chuỗi ngày</h2>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Hiện tại" value={s.current} />
        <Stat label="Dài nhất" value={s.longest} />
        <Stat label="Freeze còn lại" value={s.freezesLeft} />
      </div>
      {q.data?.calendar && <StreakCalendar calendar={q.data.calendar} />}
    </section>
  );
}

export function DashboardBody({ d, tz }: { d: DashboardDto; tz: string }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 flex min-w-0 flex-col gap-4">
        <TodaySection today={d.today} tz={tz} />
        <section className="card" aria-labelledby="goals-h">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 id="goals-h" className="card-title mb-0">Mục tiêu</h2>
            <Link to="/goals" className="link text-sm">Tất cả</Link>
          </div>
          {d.goals.length === 0 ? <Empty>Chưa có Goal đang thực hiện.</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{d.goals.map((g) => <GoalRow key={g.id} g={g} />)}</ul>
          )}
        </section>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <RewardSection r={d.reward} tz={tz} />
        <StreakSection s={d.streak} />
        <ScheduleWarningsCard />
        <section className="card" aria-labelledby="alerts-h">
          <h2 id="alerts-h" className="card-title">Cảnh báo</h2>
          <ul className="flex flex-col gap-1 text-sm">
            <li>Thông báo chưa đọc: <strong>{d.alerts.unreadNotifications}</strong></li>
            <li>
              <Link to="/tasks?missed=true" className={`link ${d.alerts.missedReview > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}`}>
                Cần review: {d.alerts.missedReview}
              </Link>
            </li>
          </ul>
        </section>
        <section className="card" aria-labelledby="ach-h">
          <h2 id="ach-h" className="card-title">Thành tựu</h2>
          {d.achievements.length === 0 ? <Empty>Chưa có Milestone hoàn thành.</Empty> : (
            <ul className="flex flex-col gap-1 text-sm">
              {d.achievements.slice(0, 5).map((a) => (
                <li key={a.milestoneId} className="flex justify-between gap-2">
                  <Link to={`/goals/${a.goalId}`} className="min-w-0 truncate hover:underline">🏆 {a.title}</Link>
                  <span className="shrink-0 text-xs muted">{fmtDateTime(a.completedAt, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const tz = useTimezone();
  const q = useQuery({ queryKey: qk.dashboard, queryFn: api.dashboard });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Tổng quan</h1>
      <CalendarErrorBanner />
      <QueryView q={q} unavailable="Dashboard chưa sẵn sàng.">{(d) => <DashboardBody d={d} tz={tz} />}</QueryView>
    </div>
  );
}
