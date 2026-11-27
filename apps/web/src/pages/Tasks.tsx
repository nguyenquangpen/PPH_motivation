import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { Priority, TaskDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { qk, TASK_CHANGE, useGoals, useInvalidate, useTimezone } from '../api/queries';
import { TaskForm } from '../components/TaskForm';
import { TaskDrawer } from '../components/TaskDrawer';
import { useTaskActions } from '../components/taskActions';
import { Badge, Modal, QueryView, useToast } from '../components/ui';
import { fmtDue } from '../lib/format';
import { byManualOrder, loadOrder, reorderIds, saveOrder } from '../lib/taskOrder';
import { TaskBoard } from '../components/TaskBoard';

type Tab = 'today' | 'upcoming' | 'done' | 'all';
type Group = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Hôm nay' }, { id: 'upcoming', label: 'Sắp tới' },
  { id: 'done', label: 'Hoàn thành' }, { id: 'all', label: 'Tất cả' },
];
const GROUP_ORDER: Group[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done'];
const GROUP_LABEL: Record<Group, string> = {
  overdue: 'Quá hạn', today: 'Hôm nay', tomorrow: 'Ngày mai', week: 'Trong 7 ngày tới', later: 'Sau đó',
  none: 'Không có hạn', done: 'Đã xong',
};
const TAB_GROUPS: Record<Tab, Group[]> = {
  today: ['overdue', 'today'], upcoming: ['tomorrow', 'week', 'later', 'none'], done: ['done'], all: GROUP_ORDER,
};
const PRIORITY_DOT: Record<Priority, string> = {
  CRITICAL: 'bg-rose-500', HIGH: 'bg-amber-500', MEDIUM: 'bg-indigo-400', LOW: 'bg-slate-300 dark:bg-slate-600',
};
const PRIORITY_TEXT: Record<Priority, string> = { CRITICAL: 'Khẩn cấp', HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp' };

const isOpen = (t: TaskDto) => t.status === 'TODO' || t.status === 'IN_PROGRESS';

function groupOf(t: TaskDto, now: DateTime): Group {
  if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return 'done';
  if (!t.deadline) return 'none';
  const sod = now.startOf('day');
  const d = DateTime.fromISO(t.deadline).setZone(now.zone);
  if (t.missed || d < sod) return 'overdue';
  const days = Math.floor(d.startOf('day').diff(sod, 'days').days);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days < 7 ? 'week' : 'later';
}

type DnD = {
  dragId: string | null; overId: string | null;
  start: (id: string) => void; end: () => void; over: (id: string | null) => void; drop: (targetId: string) => void;
};

function TaskRow({ t, goal, tz, dnd, onOpen }: { t: TaskDto; goal?: string; tz: string; dnd: DnD; onOpen: () => void }) {
  const { complete } = useTaskActions();
  const open = isOpen(t);
  const done = t.status === 'COMPLETED';
  const cancelled = t.status === 'CANCELLED';
  const isOver = dnd.overId === t.id && dnd.dragId !== t.id;
  return (
    <li
      draggable={open}
      onDragStart={(e) => { e.dataTransfer?.setData('text/plain', t.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; dnd.start(t.id); }}
      onDragEnd={dnd.end}
      onDragOver={(e) => { if (dnd.dragId && dnd.dragId !== t.id) { e.preventDefault(); dnd.over(t.id); } }}
      onDrop={(e) => { e.preventDefault(); dnd.drop(t.id); }}
      onClick={onOpen}
      className={`group flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${dnd.dragId === t.id ? 'opacity-40' : ''} ${isOver ? 'shadow-[inset_0_2px_0_0_rgb(79,70,229)]' : ''}`}
    >
      <span className={`mt-1 w-3 shrink-0 select-none text-center text-slate-300 dark:text-slate-600 ${open ? 'cursor-grab opacity-0 group-hover:opacity-100' : 'invisible'}`} aria-hidden title="Kéo để sắp xếp hoặc đổi ngày">⋮</span>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-500 text-white' : cancelled ? 'bg-slate-200 text-slate-500 dark:bg-slate-700' : 'bg-slate-100 dark:bg-slate-800'}`}
        aria-hidden
      >
        {done ? '✓' : cancelled ? '–' : <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[t.priority]}`} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${done || cancelled ? 'muted line-through' : ''}`} title={t.title}>{t.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs muted">
          {t.status === 'IN_PROGRESS' && <Badge color="blue">Đang làm</Badge>}
          {goal && <span className="max-w-[14rem] truncate" title={goal}>◎ {goal}</span>}
          {open && <span>{PRIORITY_TEXT[t.priority]}</span>}
          {open && t.deadline && (
            <span className={t.missed ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>⏱ {fmtDue(t.deadline, tz)}</span>
          )}
          {done && t.completedAt && <span>Xong {fmtDue(t.completedAt, tz)}</span>}
        </div>
      </div>
      {open && (
        <button
          className="btn-ghost btn-sm shrink-0 opacity-0 focus:opacity-100 group-hover:opacity-100"
          aria-label={`Hoàn thành ${t.title}`} title="Đánh dấu xong"
          disabled={complete.isPending}
          onClick={(e) => { e.stopPropagation(); complete.mutate({ id: t.id }); }}
        >
          ✓ Xong
        </button>
      )}
    </li>
  );
}

function TaskListView({ onOpen }: { onOpen: (id: string) => void }) {
  const tz = useTimezone();
  const toast = useToast();
  const inv = useInvalidate();
  const [sp, setSp] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(loadOrder);
  const goals = useGoals();
  const goalName = useMemo(() => new Map((goals.data ?? []).map((g) => [g.id, g.title])), [goals.data]);

  // Old deep links (?missed=true, ?due=today) land on "Hôm nay", which pins overdue tasks on top.
  const tab: Tab = TABS.find((x) => x.id === sp.get('tab'))?.id ?? 'today';
  const goalId = sp.get('goalId') || '';
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    next.delete('missed'); next.delete('due');
    if (v) next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
  };

  const q = useQuery({ queryKey: [...qk.tasks, { goalId }], queryFn: () => api.listTasks({ goalId: goalId || undefined }) });
  const now = DateTime.now().setZone(tz);

  const move = useMutation({
    mutationFn: (v: { id: string; deadline: string | null }) => api.updateTask(v.id, { deadline: v.deadline }),
    onSuccess: () => inv(TASK_CHANGE),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  /** Reschedule to a calendar day (keeps the time of day when it is still in the future, else end of day). */
  const reschedule = (t: TaskDto, date: DateTime | null) => {
    let deadline: string | null = null;
    if (date) {
      deadline = date.toISODate();
      if (t.deadline) {
        const o = DateTime.fromISO(t.deadline).setZone(tz);
        const cand = date.set({ hour: o.hour, minute: o.minute, second: 0, millisecond: 0 });
        if (cand > now) deadline = cand.toISO({ suppressMilliseconds: true });
      }
    }
    move.mutate({ id: t.id, deadline });
    toast(date ? `Đã chuyển “${t.title}” sang ${date.toFormat('dd/MM')}` : `Đã bỏ hạn của “${t.title}”`);
  };

  const dropTargets = [
    { id: 'today', label: 'Hôm nay', date: now.startOf('day') as DateTime | null },
    { id: 'tomorrow', label: 'Ngày mai', date: now.startOf('day').plus({ days: 1 }) as DateTime | null },
    { id: 'nextweek', label: `Tuần sau (${now.startOf('week').plus({ weeks: 1 }).toFormat('dd/MM')})`, date: now.startOf('week').plus({ weeks: 1 }) as DateTime | null },
    { id: 'none', label: 'Không có hạn', date: null as DateTime | null },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <QueryView q={q} unavailable="Chưa có Task.">
        {(all) => {
          const s = search.trim().toLowerCase();
          const withGroup = all.map((t) => ({ t, g: groupOf(t, now) }));
          const count = (id: Tab) => withGroup.filter((x) => TAB_GROUPS[id].includes(x.g) && (id !== 'done' || x.t.status === 'COMPLETED')).length;
          const visible = withGroup.filter((x) => TAB_GROUPS[tab].includes(x.g) && (tab !== 'done' || x.t.status === 'COMPLETED') && (!s || x.t.title.toLowerCase().includes(s)));
          const sections = TAB_GROUPS[tab]
            .map((g) => ({
              g,
              rows: visible.filter((x) => x.g === g).map((x) => x.t).sort(g === 'done' ? (a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') : byManualOrder(order)),
                        }))
            .filter((x) => x.rows.length > 0);
          const visibleIds = sections.flatMap((x) => x.rows.map((t) => t.id));
          const byId = new Map(all.map((t) => [t.id, t]));

          const dnd: DnD = {
            dragId, overId,
            start: setDragId,
            end: () => { setDragId(null); setOverId(null); },
            over: setOverId,
            drop: (targetId) => {
              const dragged = dragId ? byId.get(dragId) : undefined;
              const target = byId.get(targetId);
              setDragId(null); setOverId(null);
              if (!dragged || !target || dragged.id === target.id) return;
              const next = reorderIds(order, visibleIds, dragged.id, target.id);
              setOrder(next); saveOrder(next);
              // Dropping across sections also moves the task to that section's day.
              const gd = groupOf(dragged, now); const gt = groupOf(target, now);
              if (gd === gt) return;
              if (gt === 'today') reschedule(dragged, now.startOf('day'));
              else if (gt === 'tomorrow') reschedule(dragged, now.startOf('day').plus({ days: 1 }));
              else if (gt === 'none') reschedule(dragged, null);
              else if ((gt === 'week' || gt === 'later') && target.deadline) reschedule(dragged, DateTime.fromISO(target.deadline).setZone(tz).startOf('day'));
            },
          };

          return (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
                {TABS.map((x) => (
                  <button
                    key={x.id} role="tab" aria-selected={tab === x.id}
                    onClick={() => setParam('tab', x.id === 'today' ? null : x.id)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === x.id ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300' : 'border-transparent muted hover:text-slate-800 dark:hover:text-slate-100'}`}
                  >
                    {x.label}
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{count(x.id)}</span>
                  </button>
                ))}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input className="w-56" aria-label="Tìm kiếm" placeholder="Tìm Task…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select aria-label="Mục tiêu" value={goalId} onChange={(e) => setParam('goalId', e.target.value)}>
                  <option value="">Mọi mục tiêu</option>
                  {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
                {(goalId || search) && (
                  <button className="link text-sm" onClick={() => { setSearch(''); setParam('goalId', null); }}>Xóa bộ lọc</button>
                )}
              </div>

              {dragId && (
                <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-sm dark:border-indigo-900 dark:bg-indigo-950" aria-label="Thả vào đây để đổi ngày">
                  <span className="muted">Thả vào để đổi hạn:</span>
                  {dropTargets.map((d) => (
                    <div
                      key={d.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const t = dragId ? byId.get(dragId) : undefined;
                        setDragId(null); setOverId(null);
                        if (t) reschedule(t, d.date);
                      }}
                      className="rounded-md border border-dashed border-indigo-400 bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-slate-900 dark:text-indigo-300"
                    >
                      {d.label}
                    </div>
                  ))}
                </div>
              )}

              {sections.length === 0 ? (
                <section className="card py-10 text-center">
                  <p className="text-2xl" aria-hidden>🎉</p>
                  <p className="mt-1 font-medium">{tab === 'today' ? 'Hôm nay không còn việc nào' : 'Không có Task phù hợp'}</p>
                  <p className="text-sm muted">{tab === 'today' ? 'Nghỉ ngơi hoặc xem mục “Sắp tới”.' : 'Thử đổi bộ lọc hoặc tạo Task mới.'}</p>
                </section>
              ) : (
                <div className="flex flex-col gap-4">
                  {sections.map(({ g, rows }) => (
                    <section key={g} aria-label={GROUP_LABEL[g]} className="card overflow-hidden p-0">
                      <h2 className={`flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold dark:border-slate-800 dark:bg-slate-800/50 ${g === 'overdue' ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                        {GROUP_LABEL[g]} <span className="text-xs font-normal muted">{rows.length}</span>
                      </h2>
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {rows.map((t) => (
                          <TaskRow key={t.id} t={t} tz={tz} goal={t.goalId ? goalName.get(t.goalId) : undefined} dnd={dnd} onOpen={() => onOpen(t.id)} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </QueryView>

    </div>
  );
}

export function TasksPage() {
  const [sp, setSp] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Old deep links (?missed=, ?due=, ?tab=) were list-only, so they open the list view.
  const legacy = ['missed', 'due', 'tab'].some((k) => sp.has(k));
  const view = sp.get('view') ?? (legacy ? 'list' : 'board');
  const setView = (v: string) => {
    const next = new URLSearchParams(sp);
    next.set('view', v);
    setSp(next, { replace: true });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Công việc</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Kiểu hiển thị">
            {([['board', 'Bảng'], ['list', 'Danh sách']] as const).map(([v, label]) => (
              <button
                key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${view === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'muted hover:text-slate-800 dark:hover:text-slate-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Tạo Task</button>
        </div>
      </div>

      {view === 'list' ? <TaskListView onOpen={setOpenId} /> : <TaskBoard onOpen={setOpenId} onCreate={() => setShowForm(true)} />}

      {showForm && (
        <Modal title="Tạo Task" onClose={() => setShowForm(false)} width="max-w-3xl">
          <TaskForm onCancel={() => setShowForm(false)} onDone={() => setShowForm(false)} />
        </Modal>
      )}
      {openId && <TaskDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
