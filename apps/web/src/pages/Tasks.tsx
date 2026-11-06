import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TaskStatus, type TaskDto } from '@pph/shared';
import { api, type TaskFilters } from '../api/endpoints';
import { qk, useGoals, useTimezone } from '../api/queries';
import { TaskForm } from '../components/TaskForm';
import { CompleteButton, MissedReviewDialog } from '../components/taskActions';
import { Badge, Empty, QueryView } from '../components/ui';
import { fmtDateTime, PRIORITY_LABEL, TASK_STATUS_LABEL } from '../lib/format';
import { expectedXpLabel } from '../lib/xp';

const STATUS_COLOR: Record<TaskStatus, string> = { TODO: 'gray', IN_PROGRESS: 'blue', COMPLETED: 'green', CANCELLED: 'gray' };

export function TasksPage() {
  const tz = useTimezone();
  const [sp, setSp] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [review, setReview] = useState<TaskDto | null>(null);
  const goals = useGoals();
  const goalName = useMemo(() => new Map((goals.data ?? []).map((g) => [g.id, g.title])), [goals.data]);

  const filters: TaskFilters = {
    status: (sp.get('status') as TaskStatus) || undefined,
    goalId: sp.get('goalId') || undefined,
    missed: sp.get('missed') === 'true' ? true : undefined,
    due: sp.get('due') === 'today' ? 'today' : undefined,
  };
  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
  };

  const q = useQuery({ queryKey: [...qk.tasks, filters], queryFn: () => api.listTasks(filters) });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Công việc</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Đóng form' : '+ Tạo Task'}</button>
      </div>

      {showForm && (
        <section className="card mb-4">
          <h2 className="card-title">Tạo Task</h2>
          <TaskForm onCancel={() => setShowForm(false)} />
        </section>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Trạng thái</span>
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Tất cả</option>
            {TaskStatus.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Goal</span>
          <select value={filters.goalId ?? ''} onChange={(e) => setFilter('goalId', e.target.value)}>
            <option value="">Tất cả</option>
            {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={!!filters.missed} onChange={(e) => setFilter('missed', e.target.checked ? 'true' : null)} />
          Quá hạn (cần review)
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={!!filters.due} onChange={(e) => setFilter('due', e.target.checked ? 'today' : null)} />
          Đến hạn hôm nay
        </label>
      </div>

      <section className="card">
        <QueryView q={q} unavailable="Chưa có Task.">
          {(tasks) =>
            tasks.length === 0 ? <Empty>Không có Task phù hợp.</Empty> : (
              <table className="tbl">
                <colgroup>
                  <col /><col className="w-28" /><col className="w-24" /><col className="w-20" /><col className="w-40" />
                  <col className="w-36" /><col className="w-36" /><col className="w-48" />
                </colgroup>
                <thead>
                  <tr><th>Tiêu đề</th><th>Trạng thái</th><th>Ưu tiên</th><th>Đóng góp</th><th>XP dự kiến</th><th>Deadline</th><th>Goal</th><th></th></tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="truncate"><Link to={`/tasks/${t.id}`} className="font-medium hover:underline" title={t.title}>{t.title}</Link></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Badge color={STATUS_COLOR[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                          {t.missed && <Badge color="red">Quá hạn</Badge>}
                        </div>
                      </td>
                      <td>{PRIORITY_LABEL[t.priority]}</td>
                      <td className="tabular-nums">{t.contribution}</td>
                      <td className="text-xs">{t.status === 'COMPLETED' && t.xpReceived != null ? `Nhận ${t.xpReceived} XP` : expectedXpLabel(t.expectedXp)}</td>
                      <td className="text-xs">{fmtDateTime(t.deadline, tz)}</td>
                      <td className="truncate text-xs">{t.goalId ? <Link className="link" to={`/goals/${t.goalId}`}>{goalName.get(t.goalId) ?? 'Goal'}</Link> : '—'}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {t.missed && <button className="btn-ghost btn-sm" onClick={() => setReview(t)}>Review</button>}
                          {(t.status === 'TODO' || t.status === 'IN_PROGRESS') && <CompleteButton task={t} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </QueryView>
      </section>
      {review && <MissedReviewDialog task={review} onClose={() => setReview(null)} />}
    </div>
  );
}
