import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { qk, useGoals } from '../api/queries';
import { ActivityList } from '../components/ActivityList';
import { ActivityType } from '@pph/shared';
import { Field } from '../components/ui';
import { ACTIVITY_TYPE_LABEL, activityTypeLabel } from '../lib/format';

/** Groups for the type picker (by prefix); anything unmatched lands in "Khác". */
const TYPE_GROUPS: { label: string; match: (t: ActivityType) => boolean }[] = [
  { label: 'Task', match: (t) => t.startsWith('TASK_') },
  { label: 'Goal', match: (t) => t.startsWith('GOAL_') },
  { label: 'Milestone', match: (t) => t.startsWith('MILESTONE_') },
  { label: 'XP & Level', match: (t) => t.startsWith('XP_') || t === 'LEVEL_UP' },
  { label: 'Cửa hàng', match: (t) => t.startsWith('SHOP_') || t.startsWith('REDEMPTION_') },
  { label: 'Category & lý do bỏ lỡ', match: (t) => t.startsWith('CATEGORY_') || t.startsWith('REASON_TAG_') },
];
const GROUPED = [
  ...TYPE_GROUPS.map((g) => ({ label: g.label, types: ActivityType.filter(g.match) })),
  { label: 'Khác', types: ActivityType.filter((t) => !TYPE_GROUPS.some((g) => g.match(t))) },
];

/** Multi-select for activity types: pick from a grouped select, selected types show as removable chips. */
function TypePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const add = (t: string) => { if (t && !value.includes(t)) onChange([...value, t]); };
  return (
    <div className="flex flex-col gap-1">
      <Field label="Loại">
        <select value="" onChange={(e) => add(e.target.value)} className="max-w-[16rem]" aria-label="Thêm loại hoạt động">
          <option value="">{value.length ? `+ Thêm loại (${value.length} đã chọn)` : 'Tất cả loại'}</option>
          {GROUPED.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.types.map((t) => <option key={t} value={t} disabled={value.includes(t)}>{ACTIVITY_TYPE_LABEL[t]}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      {value.length > 0 && (
        <ul className="flex max-w-[24rem] flex-wrap gap-1" aria-label="Loại đã chọn">
          {value.map((t) => (
            <li key={t}>
              <button
                type="button" title={`Bỏ lọc ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
              >
                {activityTypeLabel(t)} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
        <TypePicker
          value={get('type').split(',').map((t) => t.trim()).filter(Boolean)}
          onChange={(v) => set('type', v.join(','))}
        />
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
