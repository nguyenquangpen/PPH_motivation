import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { CreateGoalInput, GoalDto, GoalStatus, UpdateGoalInput } from '@pph/shared';
import { api } from '../api/endpoints';
import { GOAL_CHANGE, useCategories, useInvalidate, useSettings } from '../api/queries';
import { GOAL_STATUS_LABEL } from '../lib/format';
import { ErrorText, Field, useToast } from './ui';

const MANUAL_STATUSES: GoalStatus[] = ['NOT_STARTED', 'ACTIVE', 'PAUSED', 'ARCHIVED'];

export function GoalForm({ goal, onDone, onCancel }: { goal?: GoalDto; onDone?: (g: GoalDto) => void; onCancel?: () => void }) {
  const cats = useCategories();
  const { settings } = useSettings();
  const inv = useInvalidate();
  const toast = useToast();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? '');
  const [startDate, setStartDate] = useState(goal?.startDate ?? '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [target, setTarget] = useState(goal ? String(goal.targetContribution) : '');
  const [rewardXp, setRewardXp] = useState(goal?.goalRewardXp != null ? String(goal.goalRewardXp) : '');
  const [icon, setIcon] = useState(goal?.icon ?? '');
  const [color, setColor] = useState(goal?.color ?? '');
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'NOT_STARTED');

  const m = useMutation({
    mutationFn: () => {
      const body: CreateGoalInput = {
        title: title.trim(),
        description: description.trim() ? description : null,
        categoryId,
        startDate: startDate || null,
        targetDate: targetDate || null,
        targetContribution: Number(target),
        goalRewardXp: rewardXp.trim() === '' ? null : Number(rewardXp),
        icon: icon.trim() || null,
        color: color.trim() || null,
      };
      if (goal) {
        const patch: UpdateGoalInput = { ...body };
        if (status !== goal.status && status !== 'COMPLETED') patch.status = status;
        return api.updateGoal(goal.id, patch);
      }
      return api.createGoal(body);
    },
    onSuccess: (g) => {
      toast(goal ? 'Đã lưu Goal' : 'Đã tạo Goal');
      onDone?.(g);
      return inv(GOAL_CHANGE);
    },
  });

  const t = Number(target);
  const invalid = !title.trim() || !categoryId || !Number.isInteger(t) || t < 1 || t > 1_000_000 ||
    (!!startDate && !!targetDate && targetDate < startDate);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid) m.mutate();
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-12 gap-3">
      <Field label="Tiêu đề" className="col-span-12">
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field
        label="Danh mục" className="col-span-6"
        hint={<Link to="/settings#categories" className="link">Quản lý danh mục</Link>}
      >
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">— Chọn danh mục —</option>
          {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Mục tiêu đóng góp (target)" className="col-span-6">
        <input type="number" min={1} max={1000000} value={target} onChange={(e) => setTarget(e.target.value)} required />
      </Field>
      <Field label="Ngày bắt đầu" className="col-span-6">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <Field label="Ngày đích" className="col-span-6">
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="XP thưởng khi hoàn thành" className="col-span-6" hint={`Để trống = mặc định (${settings.defaultGoalXp})`}>
        <input type="number" min={0} value={rewardXp} onChange={(e) => setRewardXp(e.target.value)} />
      </Field>
      {goal && (
        <Field label="Trạng thái" className="col-span-6" hint="Hoàn thành chỉ qua nút “Đánh dấu hoàn thành”">
          <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            {goal.status === 'COMPLETED' && <option value="COMPLETED">{GOAL_STATUS_LABEL.COMPLETED}</option>}
            {MANUAL_STATUSES.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
      )}
      <Field label="Biểu tượng" className="col-span-3">
        <input value={icon} maxLength={50} onChange={(e) => setIcon(e.target.value)} placeholder="🎯" />
      </Field>
      <Field label="Màu" className="col-span-3">
        <input value={color} maxLength={30} onChange={(e) => setColor(e.target.value)} placeholder="#6366f1" />
      </Field>
      <Field label="Mô tả" className="col-span-12">
        <textarea rows={3} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {!!startDate && !!targetDate && targetDate < startDate && (
        <p className="col-span-12 text-sm text-rose-600">Ngày đích phải sau hoặc bằng ngày bắt đầu.</p>
      )}
      <div className="col-span-12"><ErrorText error={m.error} /></div>
      <div className="col-span-12 flex justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Hủy</button>}
        <button type="submit" className="btn-primary" disabled={invalid || m.isPending}>{goal ? 'Lưu' : 'Tạo Goal'}</button>
      </div>
    </form>
  );
}
