import type { StreakDayState, StreakDto } from '@pph/shared';
import { fmtDate, STREAK_DAY_LABEL } from '../lib/format';

const DAY_CLASS: Record<StreakDayState, string> = {
  ACTIVE: 'bg-emerald-500 dark:bg-emerald-500',
  FREEZE: 'bg-cyan-400 dark:bg-cyan-500',
  EMPTY: 'bg-slate-200 dark:bg-slate-700',
};

const LEGEND: { state: StreakDayState; label: string }[] = [
  { state: 'ACTIVE', label: 'Hoạt động' },
  { state: 'FREEZE', label: 'Freeze' },
  { state: 'EMPTY', label: 'Trống' },
];

/**
 * 84-day streak calendar (oldest → newest): 12 columns of 7 days, filled top-to-bottom then left-to-right.
 * Each square has a title tooltip with the date and its state.
 */
export function StreakCalendar({ calendar }: { calendar: StreakDto['calendar'] }) {
  if (calendar.length === 0) return null;
  const counts = calendar.reduce<Record<StreakDayState, number>>(
    (acc, d) => ({ ...acc, [d.state]: (acc[d.state] ?? 0) + 1 }), { ACTIVE: 0, FREEZE: 0, EMPTY: 0 },
  );
  return (
    <div className="mt-3 flex min-w-0 flex-col gap-2">
      <div
        role="group"
        aria-label={`Lịch ${calendar.length} ngày: ${counts.ACTIVE} ngày hoạt động, ${counts.FREEZE} ngày dùng Freeze`}
        data-testid="streak-calendar"
        className="grid w-max max-w-full grid-flow-col grid-rows-[repeat(7,minmax(0,1fr))] gap-[3px]"
      >
        {calendar.map((d) => (
          <span
            key={d.date}
            data-state={d.state}
            title={`${fmtDate(d.date)}: ${STREAK_DAY_LABEL[d.state]}`}
            className={`block h-3 w-3 rounded-sm ${DAY_CLASS[d.state]}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap items-center gap-3 text-xs muted" aria-label="Chú giải">
        {LEGEND.map((l) => (
          <li key={l.state} className="flex items-center gap-1">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${DAY_CLASS[l.state]}`} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
