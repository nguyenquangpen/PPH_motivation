import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { api } from '../api/endpoints';
import { qk, useGoals, useTimezone } from '../api/queries';
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

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: 'today', label: 'Hôm nay', days: 0 }, { id: '7', label: '7 ngày', days: 6 },
  { id: '30', label: '30 ngày', days: 29 }, { id: 'all', label: 'Tất cả', days: null },
];
const CATS = TYPE_GROUPS.slice(0, 5).map((g) => g.label);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
    >
      {children}
    </button>
  );
}

export function ActivityPage() {
  const tz = useTimezone();
  const [sp, setSp] = useSearchParams();
  const goals = useGoals();
  const tasks = useQuery({ queryKey: [...qk.tasks, 'all'], queryFn: () => api.listTasks() });
  const [page, setPage] = useState(1);

  const get = (k: string) => sp.get(k) ?? '';
  const setMany = (kv: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(kv)) { if (v) next.set(k, v); else next.delete(k); }
    setSp(next, { replace: true });
    setPage(1);
  };
  const set = (k: string, v: string) => setMany({ [k]: v });

  const today = DateTime.now().setZone(tz).startOf('day');
  const range = RANGES.find((r) => r.days != null && get('from') === today.minus({ days: r.days }).toISODate() && !get('to'));
  const activeRange = range?.id ?? (get('from') || get('to') ? 'custom' : 'all');
  const pickRange = (r: (typeof RANGES)[number]) => setMany({ from: r.days == null ? '' : today.minus({ days: r.days }).toISODate() ?? '', to: '' });

  const picked = get('type').split(',').map((t) => t.trim()).filter(Boolean);
  const cat = get('cat');
  const catTypes = GROUPED.find((g) => g.label === cat)?.types ?? [];
  const types = picked.length ? picked : catTypes;

  const filters = {
    from: get('from') || undefined, to: get('to') || undefined, goalId: get('goalId') || undefined,
    taskId: get('taskId') || undefined, type: types.length ? types.join(',') : undefined, page,
  };
  const advancedCount = [get('goalId'), get('taskId'), picked.length ? 'x' : '', get('to')].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">Hoạt động</h1>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => <Chip key={r.id} active={activeRange === r.id} onClick={() => pickRange(r)}>{r.label}</Chip>)}
        {activeRange === 'custom' && <Chip active onClick={() => {}}>Tùy chọn</Chip>}
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
        <Chip active={!cat} onClick={() => set('cat', '')}>Mọi loại</Chip>
        {CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => set('cat', cat === c ? '' : c)}>{c}</Chip>)}
      </div>

      <details className="mb-4 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" open={advancedCount > 0}>
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium muted">
          Bộ lọc nâng cao{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </summary>
        <div className="flex flex-wrap items-start gap-3 border-t border-slate-100 p-3 dark:border-slate-800">
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
          <TypePicker value={picked} onChange={(v) => set('type', v.join(','))} />
          {[...sp.keys()].length > 0 && (
            <button className="btn-ghost" onClick={() => { setSp(new URLSearchParams(), { replace: true }); setPage(1); }}>Xóa bộ lọc</button>
          )}
        </div>
      </details>

      <section className="card">
        <ActivityList filters={filters} onPage={setPage} />
      </section>
    </div>
  );
}
