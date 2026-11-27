import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { Priority, TaskDto, TaskStatus } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, useGoals, useTimezone } from '../api/queries';
import { CancelDialog, useTaskActions } from './taskActions';
import { QueryView, useToast } from './ui';
import { byManualOrder, loadOrder, reorderIds, saveOrder } from '../lib/taskOrder';
import { fmtDue } from '../lib/format';

const COLUMNS: { status: TaskStatus; label: string; bar: string; limit?: number }[] = [
  { status: 'TODO', label: 'Cần làm', bar: 'border-t-amber-400' },
  { status: 'IN_PROGRESS', label: 'Đang làm', bar: 'border-t-emerald-500' },
  { status: 'COMPLETED', label: 'Hoàn thành', bar: 'border-t-indigo-500', limit: 30 },
  { status: 'CANCELLED', label: 'Đã hủy', bar: 'border-t-slate-400', limit: 15 },
];
const PRIORITY_CHIP: Record<Priority, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  MEDIUM: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};
const PRIORITY_TEXT: Record<Priority, string> = { CRITICAL: 'Khẩn cấp', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp' };

/** Kanban board: columns = status, drag a card to another column to change its status. */
export function TaskBoard({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const tz = useTimezone();
  const toast = useToast();
  const goals = useGoals();
  const { start, complete, undo } = useTaskActions();
  const goalName = useMemo(() => new Map((goals.data ?? []).map((g) => [g.id, g.title])), [goals.data]);
  const [goalId, setGoalId] = useState('');
  const [search, setSearch] = useState('');
  const [day, setDay] = useState(() => DateTime.now().setZone(tz).toISODate() ?? ''); // '' = mọi ngày
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(loadOrder);
  const [cancelTask, setCancelTask] = useState<TaskDto | null>(null);
  const q = useQuery({ queryKey: [...qk.tasks, { goalId }], queryFn: () => api.listTasks({ goalId: goalId || undefined }) });
  const now = DateTime.now().setZone(tz);
  const today = now.toISODate() ?? '';
  const dayOf = (iso: string | null) => (iso ? DateTime.fromISO(iso).setZone(tz).toISODate() : null);
  const shiftDay = (n: number) => setDay(DateTime.fromISO(day || today).plus({ days: n }).toISODate() ?? today);

  const clear = () => { setDragId(null); setOverCol(null); setOverCard(null); };

  /** Status change by dropping on a column. Only transitions the server allows. */
  const changeStatus = (t: TaskDto, to: TaskStatus) => {
    if (t.status === to) return;
    if (to === 'IN_PROGRESS' && t.status === 'TODO') start.mutate(t.id);
    else if (to === 'IN_PROGRESS' && t.status === 'COMPLETED') undo.mutate(t.id);
    else if (to === 'COMPLETED' && (t.status === 'TODO' || t.status === 'IN_PROGRESS')) complete.mutate({ id: t.id });
    else if (to === 'CANCELLED' && (t.status === 'TODO' || t.status === 'IN_PROGRESS')) setCancelTask(t);
    else if (to === 'TODO') toast('Không thể đưa về “Cần làm” — luồng là Cần làm → Đang làm → Hoàn thành', 'error');
    else if (t.status === 'CANCELLED') toast('Task đã hủy không thể chuyển sang trạng thái khác', 'error');
    else toast('Không thể chuyển Task sang cột này', 'error');
  };

  return (
    <QueryView q={q} unavailable="Chưa có Task.">
      {(all) => {
        const s = search.trim().toLowerCase();
        const byId = new Map(all.map((t) => [t.id, t]));
        // Day filter: "Cần làm" by deadline day, "Hoàn thành" by completion day. Đang làm / Đã hủy always show.
        const inDay = (t: TaskDto) => {
          if (!day) return true;
          if (t.status === 'TODO') return dayOf(t.deadline) === day;
          if (t.status === 'COMPLETED') return dayOf(t.completedAt) === day;
          return true;
        };
        const hiddenTodo = all.filter((t) => t.status === 'TODO' && !inDay(t)).length;
        const cols = COLUMNS.map((c) => {
          const rows = all.filter((t) => t.status === c.status && inDay(t) && (!s || t.title.toLowerCase().includes(s)));
          const sorted = c.status === 'COMPLETED' || c.status === 'CANCELLED'
            ? rows.sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
            : rows.sort(byManualOrder(order));
          return { ...c, total: rows.length, rows: c.limit ? sorted.slice(0, c.limit) : sorted };
        });

        const dropOnCard = (target: TaskDto) => {
          const dragged = dragId ? byId.get(dragId) : undefined;
          clear();
          if (!dragged || dragged.id === target.id) return;
          if (dragged.status !== target.status) return changeStatus(dragged, target.status);
          if (target.status !== 'TODO' && target.status !== 'IN_PROGRESS') return;
          const col = cols.find((c) => c.status === target.status)!;
          const next = reorderIds(order, col.rows.map((t) => t.id), dragged.id, target.id);
          setOrder(next); saveOrder(next);
        };

        return (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className="w-56" aria-label="Tìm kiếm" placeholder="Tìm Task…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select aria-label="Mục tiêu" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                <option value="">Mọi mục tiêu</option>
                {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <div className="flex items-center gap-1" role="group" aria-label="Lọc theo ngày">
                <button className="btn-ghost btn-sm" onClick={() => shiftDay(-1)} aria-label="Ngày trước" disabled={!day}>‹</button>
                <input type="date" aria-label="Ngày" value={day} onChange={(e) => setDay(e.target.value)} />
                <button className="btn-ghost btn-sm" onClick={() => shiftDay(1)} aria-label="Ngày sau" disabled={!day}>›</button>
                <button className={`btn-sm ${day === today ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDay(today)}>Hôm nay</button>
                <button className={`btn-sm ${!day ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDay('')}>Tất cả ngày</button>
              </div>
              <span className="ml-auto hidden text-xs muted lg:inline">Kéo thẻ sang cột khác để đổi trạng thái</span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {cols.map((c) => (
                <section
                  key={c.status} aria-label={c.label}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(c.status); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol((o) => (o === c.status ? null : o)); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const t = dragId ? byId.get(dragId) : undefined;
                    clear();
                    if (t) changeStatus(t, c.status);
                  }}
                  className={`flex min-w-0 flex-col rounded-lg border border-t-4 bg-slate-100/70 dark:bg-slate-900/60 ${c.bar} ${overCol === c.status ? 'border-x-indigo-400 border-b-indigo-400 bg-indigo-50 dark:bg-indigo-950/40' : 'border-x-slate-200 border-b-slate-200 dark:border-x-slate-800 dark:border-b-slate-800'}`}
                >
                  <header className="flex items-center gap-2 px-3 py-2">
                    <h2 className="font-semibold">{c.label}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums dark:bg-slate-800">{c.total}</span>
                    {c.status === 'TODO' && (
                      <button className="btn-ghost btn-sm ml-auto" onClick={onCreate} aria-label="Tạo Task" title="Tạo Task">＋</button>
                    )}
                  </header>
                  <ul className="flex max-h-[calc(100vh-15rem)] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                    {c.rows.map((t) => {
                      const overdue = t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (t.missed || (!!t.deadline && DateTime.fromISO(t.deadline) < now));
                      const done = t.status === 'COMPLETED' || t.status === 'CANCELLED';
                      return (
                        <li
                          key={t.id}
                          draggable={t.status !== 'CANCELLED'}
                          onDragStart={(e) => { e.dataTransfer?.setData('text/plain', t.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }}
                          onDragEnd={clear}
                          onDragOver={(e) => { if (dragId && dragId !== t.id) { e.preventDefault(); e.stopPropagation(); setOverCol(c.status); setOverCard(t.id); } }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnCard(t); }}
                          onClick={() => onOpen(t.id)}
                          className={`cursor-pointer rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:border-indigo-300 hover:shadow dark:border-slate-700 dark:bg-slate-800 ${dragId === t.id ? 'opacity-40' : ''} ${overCard === t.id && dragId !== t.id ? 'shadow-[inset_0_2px_0_0_rgb(79,70,229)]' : ''}`}
                        >
                          <p className={`break-words text-sm font-medium ${done ? 'muted line-through' : ''}`}>{t.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            {!done && <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_CHIP[t.priority]}`}>{PRIORITY_TEXT[t.priority]}</span>}
                            {t.goalId && goalName.get(t.goalId) && (
                              <span className="max-w-[10rem] truncate rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700" title={goalName.get(t.goalId)}>◎ {goalName.get(t.goalId)}</span>
                            )}
                            {t.deadline && !done && (
                              <span className={`ml-auto tabular-nums ${overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'muted'}`}>⏱ {fmtDue(t.deadline, tz)}</span>
                            )}
                            {t.status === 'COMPLETED' && t.completedAt && <span className="ml-auto muted">Xong {fmtDue(t.completedAt, tz)}</span>}
                          </div>
                        </li>
                      );
                    })}
                    {c.rows.length === 0 && <li className="py-6 text-center text-xs muted">{dragId ? 'Thả vào đây' : 'Trống'}</li>}
                    {c.status === 'TODO' && hiddenTodo > 0 && (
                      <li className="py-1 text-center text-xs muted">
                        Còn {hiddenTodo} việc ở ngày khác / quá hạn / không có hạn —{' '}
                        <button className="link" onClick={() => setDay('')}>xem tất cả</button>
                      </li>
                    )}
                    {c.total > c.rows.length && <li className="py-1 text-center text-xs muted">… và {c.total - c.rows.length} task cũ hơn (xem “Danh sách”)</li>}
                  </ul>
                </section>
              ))}
            </div>
            {cancelTask && <CancelDialog task={cancelTask} onClose={() => setCancelTask(null)} />}
          </div>
        );
      }}
    </QueryView>
  );
}
