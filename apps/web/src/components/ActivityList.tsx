import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { ActivityItemDto } from '@pph/shared';
import { api, type ActivityFilters } from '../api/endpoints';
import { qk, useTimezone } from '../api/queries';
import { activityTypeLabel } from '../lib/format';
import { Empty, Pagination, QueryView } from './ui';

function short(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

const ICONS: [string, string, string][] = [
  ['TASK_', '✓', 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'],
  ['GOAL_', '◎', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'],
  ['MILESTONE_', '⚑', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'],
  ['XP_', '★', 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'],
  ['LEVEL_UP', '★', 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'],
  ['SHOP_', '◈', 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'],
  ['REDEMPTION_', '◈', 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'],
  ['STREAK_', '↯', 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'],
  ['CHECKIN_', '☑', 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'],
  ['INTEGRATION_', '⇄', 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'],
];
function iconOf(type: string): { glyph: string; cls: string } {
  const m = ICONS.find(([p]) => type.startsWith(p));
  return m ? { glyph: m[1], cls: m[2] } : { glyph: '•', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

function dayLabel(day: DateTime, now: DateTime): string {
  const diff = Math.round(now.startOf('day').diff(day, 'days').days);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return day.toFormat('dd/MM/yyyy');
}

function Item({ a, tz }: { a: ActivityItemDto; tz: string }) {
  const { glyph, cls } = iconOf(a.type);
  const time = DateTime.fromISO(a.createdAt, { setZone: true }).setZone(tz).toFormat('HH:mm');
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${cls}`} aria-hidden>{glyph}</span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm">{a.message}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs muted">
          <span title={a.type}>{activityTypeLabel(a.type)}</span>
          {a.goalId && <Link className="link" to={`/goals/${a.goalId}`}>Xem Goal</Link>}
          {a.taskId && <Link className="link" to={`/tasks/${a.taskId}`}>Xem Task</Link>}
          {a.itemId && <Link className="link" to="/rewards">Xem vật phẩm</Link>}
        </div>
        {(a.before != null || a.after != null) && (
          <p className="mt-0.5 break-all text-xs muted">
            {a.before != null && <>Trước: {short(a.before)} </>}
            {a.after != null && <>· Sau: {short(a.after)}</>}
          </p>
        )}
      </div>
      <time className="shrink-0 pt-0.5 text-xs tabular-nums muted" dateTime={a.createdAt}>{time}</time>
    </li>
  );
}

/** Activity feed grouped by local day (newest first). */
export function ActivityList({ filters, onPage }: { filters: ActivityFilters; onPage?: (p: number) => void }) {
  const tz = useTimezone();
  const q = useQuery({
    queryKey: [...qk.activity, filters],
    queryFn: () => api.activity(filters),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryView q={q} unavailable="Lịch sử hoạt động chưa sẵn sàng.">
      {(p) => {
        if (p.items.length === 0) return <Empty>Không có hoạt động.</Empty>;
        const now = DateTime.now().setZone(tz);
        const groups: { key: string; label: string; items: ActivityItemDto[] }[] = [];
        for (const a of p.items) {
          const day = DateTime.fromISO(a.createdAt, { setZone: true }).setZone(tz).startOf('day');
          const key = day.toISODate() ?? a.createdAt;
          const last = groups[groups.length - 1];
          if (last && last.key === key) last.items.push(a);
          else groups.push({ key, label: dayLabel(day, now), items: [a] });
        }
        return (
          <>
            {groups.map((g) => (
              <section key={g.key} className="mb-2">
                <h3 className="sticky top-12 z-10 -mx-1 bg-white/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide muted dark:bg-slate-900/95">{g.label}</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.items.map((a) => <Item key={a.id} a={a} tz={tz} />)}
                </ul>
              </section>
            ))}
            {onPage && <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPage={onPage} />}
          </>
        );
      }}
    </QueryView>
  );
}
