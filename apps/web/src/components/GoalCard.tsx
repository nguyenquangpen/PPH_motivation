import { Link } from 'react-router-dom';
import type { GoalDto } from '@pph/shared';
import { Badge, ProgressRing } from './ui';
import { daysRemainingLabel, fmtNum, GOAL_STATUS_LABEL, WARNING_LABEL } from '../lib/format';

/** Compact goal tile for grid layouts: ring + title + the two numbers that matter. */
export function GoalCard({ g, actions }: { g: GoalDto; actions?: React.ReactNode }) {
  const p = g.progress;
  const warn = p.warnings.length > 0;
  return (
    <div className="card flex min-w-0 flex-col gap-3 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <ProgressRing percent={p.displayPercent} warn={warn} />
        <div className="min-w-0 flex-1">
          <Link to={`/goals/${g.id}`} className="block truncate font-semibold hover:underline" title={g.title}>
            {g.icon ? `${g.icon} ` : ''}{g.title}
          </Link>
          <p className="truncate text-xs muted">{g.categoryName} · {GOAL_STATUS_LABEL[g.status]}</p>
          <p className="mt-0.5 text-xs tabular-nums">
            {fmtNum(p.completedContribution)}/{fmtNum(p.targetContribution ?? g.targetContribution)}
            {p.overflowContribution > 0 && (
              <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                +{p.overflowContribution} vượt mục tiêu
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={warn ? 'font-medium text-amber-700 dark:text-amber-400' : 'muted'}>{daysRemainingLabel(p.daysRemaining)}</span>
        {p.warnings.map((w) => <Badge key={w} color="amber">{WARNING_LABEL[w] ?? w}</Badge>)}
        {actions && <div className="ml-auto flex gap-1">{actions}</div>}
      </div>
    </div>
  );
}
