import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ErrorCode, MilestoneCondition, TaskStatus, type CreateMilestoneInput, type GoalDetailDto, type MilestoneDto,
} from '@pph/shared';
import { api } from '../api/endpoints';
import { GOAL_CHANGE, qk, useInvalidate, useSettings, useTimezone } from '../api/queries';
import { errorMessage, isApiError } from '../api/client';
import { ActivityList } from '../components/ActivityList';
import { GoalForm } from '../components/GoalForm';
import { TaskForm } from '../components/TaskForm';
import { Badge, Empty, ErrorText, Field, Modal, ProgressBar, QueryView, useToast } from '../components/ui';
import {
  daysRemainingLabel, fmtDate, fmtDateTime, fmtNum, GOAL_STATUS_LABEL, TASK_STATUS_LABEL, WARNING_LABEL,
} from '../lib/format';

const COND_LABEL: Record<MilestoneCondition, string> = {
  CONTRIBUTION_THRESHOLD: 'Ngưỡng đóng góp', LINKED_TASKS: 'Task liên kết',
};

function MilestoneForm({ goalId, ms, onDone }: { goalId: string; ms?: MilestoneDto; onDone: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const { settings } = useSettings();
  const [title, setTitle] = useState(ms?.title ?? '');
  const [description, setDescription] = useState(ms?.description ?? '');
  const [targetDate, setTargetDate] = useState(ms?.targetDate ?? '');
  const [cond, setCond] = useState<MilestoneCondition>(ms?.conditionType ?? 'CONTRIBUTION_THRESHOLD');
  const [threshold, setThreshold] = useState(ms?.threshold != null ? String(ms.threshold) : '');
  const [rewardXp, setRewardXp] = useState(ms?.rewardXp != null ? String(ms.rewardXp) : '');
  const m = useMutation({
    mutationFn: () => {
      const body: CreateMilestoneInput = {
        title: title.trim(),
        description: description.trim() ? description : null,
        targetDate: targetDate || null,
        conditionType: cond,
        threshold: cond === 'CONTRIBUTION_THRESHOLD' ? Number(threshold) : null,
        rewardXp: rewardXp.trim() === '' ? null : Number(rewardXp),
      };
      return ms ? api.updateMilestone(ms.id, body) : api.createMilestone(goalId, body);
    },
    onSuccess: () => { toast(ms ? 'Đã lưu Milestone' : 'Đã tạo Milestone'); onDone(); return inv(GOAL_CHANGE); },
  });
  const th = Number(threshold);
  const invalid = !title.trim() || (cond === 'CONTRIBUTION_THRESHOLD' && (!Number.isInteger(th) || th < 1));
  const submit = (e: FormEvent) => { e.preventDefault(); if (!invalid) m.mutate(); };
  return (
    <form onSubmit={submit} className="grid grid-cols-12 gap-3">
      <Field label="Tiêu đề" className="col-span-12"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
      <Field label="Điều kiện" className="col-span-6">
        <select value={cond} onChange={(e) => setCond(e.target.value as MilestoneCondition)}>
          {MilestoneCondition.map((c) => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
        </select>
      </Field>
      {cond === 'CONTRIBUTION_THRESHOLD' ? (
        <Field label="Ngưỡng đóng góp" className="col-span-6"><input type="number" min={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></Field>
      ) : (
        <p className="col-span-6 self-end text-xs muted">Gắn Task vào Milestone trong form Task. Hoàn thành khi mọi Task liên kết (trừ đã hủy) hoàn thành.</p>
      )}
      <Field label="XP thưởng" className="col-span-6" hint={`Để trống = mặc định (${settings.defaultMilestoneXp})`}>
        <input type="number" min={0} value={rewardXp} onChange={(e) => setRewardXp(e.target.value)} />
      </Field>
      <Field label="Ngày đích" className="col-span-6"><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
      <Field label="Mô tả" className="col-span-12"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="col-span-12"><ErrorText error={m.error} /></div>
      <div className="col-span-12 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>Hủy</button>
        <button type="submit" className="btn-primary" disabled={invalid || m.isPending}>{ms ? 'Lưu' : 'Tạo Milestone'}</button>
      </div>
    </form>
  );
}

function Milestones({ g }: { g: GoalDetailDto }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<MilestoneDto | 'new' | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.deleteMilestone(id),
    onSuccess: () => { toast('Đã xóa Milestone'); return inv(GOAL_CHANGE); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="card-title mb-0">Milestone</h2>
        <button className="btn-ghost btn-sm" onClick={() => setEditing('new')}>+ Thêm Milestone</button>
      </div>
      {g.milestones.length === 0 ? <Empty>Chưa có Milestone.</Empty> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {g.milestones.map((ms) => {
            const pct = ms.conditionType === 'CONTRIBUTION_THRESHOLD' && ms.threshold
              ? (g.progress.completedContribution / ms.threshold) * 100 : null;
            return (
              <li key={ms.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{ms.status === 'COMPLETED' ? '🏆 ' : ''}{ms.title}</span>
                  <Badge color={ms.status === 'COMPLETED' ? 'green' : 'gray'}>{ms.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang chờ'}</Badge>
                  <span className="text-xs muted">
                    {COND_LABEL[ms.conditionType]}
                    {ms.conditionType === 'CONTRIBUTION_THRESHOLD' ? ` ≥ ${fmtNum(ms.threshold)}` : ` (${ms.linkedTaskIds.length} Task)`}
                    {' · '}Thưởng {fmtNum(ms.effectiveRewardXp)} XP
                    {ms.targetDate && ` · Đích ${fmtDate(ms.targetDate)}`}
                    {ms.completedAt && ` · Xong ${fmtDateTime(ms.completedAt, tz)}`}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(ms)}>Sửa</button>
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm(`Xóa Milestone “${ms.title}”?`) && del.mutate(ms.id)}>Xóa</button>
                  </div>
                </div>
                {pct != null && ms.status !== 'COMPLETED' && <div className="mt-1"><ProgressBar percent={pct} size="sm" /></div>}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <Modal title={editing === 'new' ? 'Thêm Milestone' : 'Sửa Milestone'} onClose={() => setEditing(null)}>
          <MilestoneForm goalId={g.id} ms={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

function CompleteGoalButton({ g }: { g: GoalDetailDto }) {
  const inv = useInvalidate();
  const toast = useToast();
  const m = useMutation({
    mutationFn: async () => {
      try {
        return await api.completeGoal(g.id);
      } catch (e) {
        if (isApiError(e) && e.code === ErrorCode.CONFIRM_REQUIRED) {
          if (!window.confirm(`${e.message}\n\nGoal chưa đạt 100%. Vẫn đánh dấu hoàn thành?`)) return null;
          return api.completeGoal(g.id, true);
        }
        throw e;
      }
    },
    onSuccess: (r) => {
      if (!r) return;
      toast('Đã đánh dấu Goal hoàn thành');
      return inv(GOAL_CHANGE);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  if (g.status === 'COMPLETED') return null;
  return (
    <button className="btn-success" disabled={m.isPending} onClick={() => m.mutate()}>Đánh dấu hoàn thành</button>
  );
}

function GoalBody({ g }: { g: GoalDetailDto }) {
  const tz = useTimezone();
  const [edit, setEdit] = useState(false);
  const [addTask, setAddTask] = useState(false);
  const [actPage, setActPage] = useState(1);
  const p = g.progress;
  const statuses = [...TaskStatus, ...Object.keys(g.tasksByStatus).filter((s) => !(TaskStatus as readonly string[]).includes(s))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/goals" className="link text-sm">← Mục tiêu</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{g.icon ? `${g.icon} ` : ''}{g.title}</h1>
        <Badge>{GOAL_STATUS_LABEL[g.status]}</Badge>
        <Badge color="blue">{g.categoryName}</Badge>
        {p.warnings.map((w) => <Badge key={w} color="amber">{WARNING_LABEL[w] ?? w}</Badge>)}
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={() => setEdit(true)}>Sửa</button>
          <CompleteGoalButton g={g} />
        </div>
      </div>

      <section className="card">
        <ProgressBar percent={p.displayPercent} overflow={p.overflowContribution} warn={p.warnings.length > 0} size="lg" />
        <div className="mt-3 grid grid-cols-6 gap-3 text-sm">
          <div><div className="text-xs muted">Đã đóng góp</div><div className="font-semibold">{fmtNum(p.completedContribution)}</div></div>
          <div><div className="text-xs muted">Mục tiêu</div><div className="font-semibold">{fmtNum(g.targetContribution)}</div></div>
          <div><div className="text-xs muted">Còn lại</div><div className="font-semibold">{fmtNum(p.remainingContribution)}</div></div>
          <div><div className="text-xs muted">Vượt</div><div className="font-semibold">{fmtNum(p.overflowContribution)}</div></div>
          <div><div className="text-xs muted">Ngày đích</div><div className="font-semibold">{fmtDate(g.targetDate)}</div><div className="text-xs muted">{daysRemainingLabel(p.daysRemaining)}</div></div>
          <div><div className="text-xs muted">Kỳ vọng</div><div className="font-semibold">{p.expectedPercent != null ? `${p.expectedPercent.toFixed(1)}%` : '—'}</div></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs muted">
          <span>Bắt đầu: {fmtDate(g.startDate)}</span>
          <span>XP thưởng: {g.goalRewardXp != null ? fmtNum(g.goalRewardXp) : 'mặc định'}{g.goalRewardGranted ? ' (đã nhận)' : ''}</span>
          {g.completedAt && <span>Hoàn thành lúc {fmtDateTime(g.completedAt, tz)} ({fmtNum(g.completedContributionSnapshot)} đóng góp)</span>}
        </div>
        {g.description && <p className="mt-3 whitespace-pre-wrap text-sm">{g.description}</p>}
      </section>

      <Milestones g={g} />

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title mb-0">Task liên quan</h2>
          <button className="btn-ghost btn-sm" onClick={() => setAddTask(true)}>+ Thêm Task</button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {statuses.map((s) => {
            const list = g.tasksByStatus[s] ?? [];
            return (
              <div key={s} className="min-w-0">
                <h3 className="mb-1 text-sm font-semibold">{TASK_STATUS_LABEL[s as TaskStatus] ?? s} <span className="muted">({list.length})</span></h3>
                {list.length === 0 ? <p className="text-xs muted">—</p> : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {list.map((t) => (
                      <li key={t.id} className="flex justify-between gap-2">
                        <Link to={`/tasks/${t.id}`} className="min-w-0 truncate hover:underline">{t.title}</Link>
                        <span className="shrink-0 text-xs muted">{t.contribution}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title mb-0">Hoạt động</h2>
          <Link to={`/activity?goalId=${g.id}`} className="link text-sm">Xem tất cả</Link>
        </div>
        {g.activity ? (
          g.activity.length === 0 ? <Empty>Chưa có hoạt động.</Empty> : (
            <ul className="flex flex-col gap-1 text-sm">
              {g.activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-xs muted">{fmtDateTime(a.createdAt, tz)}</span>
                  <span className="min-w-0">{a.message}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ActivityList filters={{ goalId: g.id, page: actPage }} onPage={setActPage} />
        )}
      </section>

      {edit && (
        <Modal title="Sửa Goal" onClose={() => setEdit(false)} width="max-w-2xl">
          <GoalForm goal={g} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
        </Modal>
      )}
      {addTask && (
        <Modal title="Thêm Task cho Goal" onClose={() => setAddTask(false)} width="max-w-3xl">
          <TaskForm defaultGoalId={g.id} onDone={() => setAddTask(false)} onCancel={() => setAddTask(false)} />
        </Modal>
      )}
    </div>
  );
}

export function GoalDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: [...qk.goal, id], queryFn: () => api.getGoal(id) });
  return <QueryView q={q} unavailable="Không tìm thấy Goal.">{(g) => <GoalBody g={g} />}</QueryView>;
}
