import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Priority, type CreateTaskInput, type TaskDto, type UpdateTaskInput } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, TASK_CHANGE, useGoals, useInvalidate, useSettings, useTimezone } from '../api/queries';
import { expectedXp, expectedXpLabel } from '../lib/xp';
import { isoToLocalInput, localInputToIso, PRIORITY_LABEL } from '../lib/format';
import { ErrorText, Field, useToast } from './ui';

type DeadlineMode = 'none' | 'date' | 'datetime';

const toInt = (s: string): number | null => (s.trim() !== '' && /^-?\d+$/.test(s.trim()) ? Number(s) : null);

export function TaskForm({ task, defaultGoalId, onDone, onCancel }: {
  task?: TaskDto; defaultGoalId?: string; onDone?: (t: TaskDto) => void; onCancel?: () => void;
}) {
  const { settings } = useSettings();
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const goals = useGoals();
  const locked = task?.status === 'COMPLETED';

  const [title, setTitle] = useState(task?.title ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'MEDIUM');
  const [contribution, setContribution] = useState(task ? String(task.contribution) : '');
  const [estimated, setEstimated] = useState(task ? String(task.estimatedDuration) : '60');
  const [actual, setActual] = useState(task?.actualDuration != null ? String(task.actualDuration) : '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [goalId, setGoalId] = useState(task?.goalId ?? defaultGoalId ?? '');
  const [milestoneIds, setMilestoneIds] = useState<string[]>(task?.milestoneIds ?? []);
  const [mode, setMode] = useState<DeadlineMode>(task?.deadline ? 'datetime' : 'none');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineDt, setDeadlineDt] = useState(isoToLocalInput(task?.deadline, tz));
  const [showMore, setShowMore] = useState(!!task || !!defaultGoalId);

  const milestones = useQuery({
    queryKey: [...qk.milestones, goalId],
    queryFn: () => api.listMilestones(goalId),
    enabled: !!goalId,
  });

  const c = toInt(contribution);
  const est = toInt(estimated);
  const act = toInt(actual);
  const preview = useMemo(
    () => (c != null && c >= 0 && est != null && est >= 1 ? expectedXp(c, est, act, settings) : null),
    [c, est, act, settings],
  );

  const deadlineValue = (): string | null | undefined => {
    if (mode === 'none') return task?.deadline ? null : undefined;
    if (mode === 'date') return deadlineDate || undefined;
    return localInputToIso(deadlineDt, tz);
  };

  const m = useMutation({
    mutationFn: async () => {
      const base = {
        title: title.trim(),
        priority,
        description: description.trim() ? description : task ? null : undefined,
        deadline: deadlineValue(),
      };
      if (task) {
        const patch: UpdateTaskInput = { ...base };
        if (!locked) {
          Object.assign(patch, {
            contribution: c ?? undefined,
            estimatedDuration: est ?? undefined,
            actualDuration: act ?? null,
            goalId: goalId || null,
            milestoneIds: goalId ? milestoneIds : [],
          });
        }
        return api.updateTask(task.id, patch);
      }
      const body: CreateTaskInput = {
        ...base,
        description: base.description ?? undefined,
        contribution: c ?? NaN,
        estimatedDuration: est ?? NaN,
        goalId: goalId || undefined,
        milestoneIds: goalId && milestoneIds.length ? milestoneIds : undefined,
      };
      return api.createTask(body);
    },
    onSuccess: (t) => {
      toast(task ? 'Đã lưu Task' : 'Đã tạo Task');
      if (!task) {
        setTitle(''); setContribution(''); setDescription(''); setMilestoneIds([]); setMode('none');
      }
      onDone?.(t);
      return inv(TASK_CHANGE);
    },
  });

  const formError =
    !title.trim() ? 'Nhập tiêu đề' :
    c == null || c < 0 || c > 10000 ? 'Đóng góp phải là số nguyên 0–10.000' :
    est == null || est < 1 || est > 1440 ? 'Thời lượng ước tính phải là số nguyên 1–1.440 phút' :
    actual && (act == null || act < 1 || act > 1440) ? 'Thời lượng thực tế phải là số nguyên 1–1.440 phút' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!formError) m.mutate();
  };

  const presets = [
    { label: 'Major', v: settings.presetMajor },
    { label: 'Medium', v: settings.presetMedium },
    { label: 'Minor', v: settings.presetMinor },
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={task ? 'Sửa Task' : 'Tạo Task'}>
      {locked && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          Task đã hoàn thành: đóng góp, Goal, Milestone và thời lượng bị khóa. Hãy Hoàn tác trước nếu cần sửa.
        </p>
      )}
      <div className="grid grid-cols-12 gap-3">
        <Field label="Tiêu đề" className="col-span-12 lg:col-span-6">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus={!task} />
        </Field>
        <Field label="Độ ưu tiên" className="col-span-6 lg:col-span-3">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Priority.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Thời lượng ước tính (phút)" className="col-span-6 lg:col-span-3">
          <input type="number" min={1} max={1440} value={estimated} disabled={locked} onChange={(e) => setEstimated(e.target.value)} />
        </Field>
        <div className="col-span-12 flex flex-wrap items-end gap-2">
          <Field label="Đóng góp (Contribution)" className="w-40">
            <input type="number" min={0} max={10000} value={contribution} disabled={locked} onChange={(e) => setContribution(e.target.value)} />
          </Field>
          {presets.map((p) => (
            <button
              key={p.label} type="button" className="btn-ghost" disabled={locked}
              onClick={() => setContribution(String(p.v))}
            >
              {p.label} ({p.v})
            </button>
          ))}
          <div className="ml-auto rounded-md bg-indigo-50 px-3 py-1.5 text-sm dark:bg-indigo-950/50" data-testid="expected-xp">
            XP dự kiến: <strong>{preview ? expectedXpLabel(preview) : '—'}</strong>
          </div>
        </div>
      </div>

      <button type="button" className="self-start text-sm link" onClick={() => setShowMore((s) => !s)}>
        {showMore ? '▾ Ẩn trường tùy chọn' : '▸ Trường tùy chọn (Goal, Milestone, deadline, mô tả)'}
      </button>

      {showMore && (
        <div className="grid grid-cols-12 gap-3 rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <Field label="Goal" className="col-span-6">
            <select value={goalId} disabled={locked} onChange={(e) => { setGoalId(e.target.value); setMilestoneIds([]); }}>
              <option value="">— Không gắn Goal —</option>
              {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
          <div className="col-span-6 flex flex-col gap-1">
            <span className="text-sm font-medium">Deadline</span>
            <div className="flex flex-wrap items-center gap-2">
              <select value={mode} onChange={(e) => setMode(e.target.value as DeadlineMode)} aria-label="Loại deadline">
                <option value="none">Không có</option>
                <option value="date">Chỉ ngày (23:59)</option>
                <option value="datetime">Ngày giờ</option>
              </select>
              {mode === 'date' && <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} aria-label="Ngày deadline" />}
              {mode === 'datetime' && <input type="datetime-local" value={deadlineDt} onChange={(e) => setDeadlineDt(e.target.value)} aria-label="Ngày giờ deadline" />}
            </div>
            <span className="text-xs muted">Múi giờ {tz}</span>
          </div>
          {goalId && (
            <div className="col-span-12">
              <span className="text-sm font-medium">Milestone</span>
              {(milestones.data ?? []).length === 0 ? (
                <p className="text-xs muted">Goal này chưa có Milestone.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-3">
                  {(milestones.data ?? []).map((ms) => (
                    <label key={ms.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox" disabled={locked} checked={milestoneIds.includes(ms.id)}
                        onChange={(e) => setMilestoneIds((ids) => (e.target.checked ? [...ids, ms.id] : ids.filter((x) => x !== ms.id)))}
                      />
                      {ms.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {task && (
            <Field label="Thời lượng thực tế (phút)" className="col-span-4">
              <input type="number" min={1} max={1440} value={actual} disabled={locked} onChange={(e) => setActual(e.target.value)} />
            </Field>
          )}
          <Field label="Mô tả" className="col-span-12">
            <textarea rows={2} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      )}

      <ErrorText error={m.error} />
      <div className="flex items-center justify-end gap-2">
        {formError && (title || contribution) && <span className="text-xs text-rose-600">{formError}</span>}
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Hủy</button>}
        <button type="submit" className="btn-primary" disabled={!!formError || m.isPending}>
          {task ? 'Lưu' : 'Tạo Task'}
        </button>
      </div>
    </form>
  );
}
