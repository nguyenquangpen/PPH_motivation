import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { qk, useGoals } from '../api/queries';
import { ActivityList } from '../components/ActivityList';
import { Field } from '../components/ui';

/** Common activity types; the server accepts a comma-separated list. */
const COMMON_TYPES = [
  'TASK_CREATED', 'TASK_UPDATED', 'TASK_COMPLETED', 'TASK_UNDONE', 'TASK_CANCELLED', 'TASK_DELETED',
  'GOAL_CREATED', 'GOAL_UPDATED', 'GOAL_COMPLETED', 'MILESTONE_COMPLETED', 'REDEEM', 'PENALTY', 'SETTINGS_CHANGED',
];

export function ActivityPage() {
  const [sp, setSp] = useSearchParams();
  const goals = useGoals();
  const tasks = useQuery({ queryKey: [...qk.tasks, 'all'], queryFn: () => api.listTasks() });
  const [page, setPage] = useState(1);

  const get = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
    setPage(1);
  };

  const filters = {
    from: get('from') || undefined, to: get('to') || undefined, goalId: get('goalId') || undefined,
    taskId: get('taskId') || undefined, type: get('type') || undefined, page,
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Hoạt động</h1>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <Field label="Từ ngày"><input type="date" value={get('from')} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label="Đến ngày"><input type="date" value={get('to')} onChange={(e) => set('to', e.target.value)} /></Field>
        <Field label="Goal">
          <select value={get('goalId')} onChange={(e) => set('goalId', e.target.value)} className="max-w-[14rem]">
            <option value="">Tất cả</option>
            {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
        <Field label="Task">
          <select value={get('taskId')} onChange={(e) => set('taskId', e.target.value)} className="max-w-[14rem]">
            <option value="">Tất cả</option>
            {(tasks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
        <Field label="Loại" hint="Nhiều loại cách nhau bởi dấu phẩy">
          <input list="activity-types" value={get('type')} onChange={(e) => set('type', e.target.value.trim())} placeholder="VD: TASK_COMPLETED" />
        </Field>
        <datalist id="activity-types">{COMMON_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        {[...sp.keys()].length > 0 && (
          <button className="btn-ghost" onClick={() => { setSp(new URLSearchParams(), { replace: true }); setPage(1); }}>Xóa bộ lọc</button>
        )}
      </div>
      <section className="card">
        <ActivityList filters={filters} onPage={setPage} />
      </section>
    </div>
  );
}
