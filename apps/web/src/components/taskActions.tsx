import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { MissedReviewAction, TaskDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { TASK_CHANGE, useInvalidate, useReasons, useTimezone } from '../api/queries';
import { errorMessage } from '../api/client';
import { localInputToIso } from '../lib/format';
import { ErrorText, Field, Modal, useToast } from './ui';

function completedMessage(t: TaskDto | undefined): string {
  if (!t) return 'Đã hoàn thành Task';
  if (t.expectedXp?.isSmall) return `Đã hoàn thành “${t.title}” · +${t.expectedXp.poolContribution} vào Pool`;
  const xp = t.xpReceived ?? t.expectedXp?.immediateXp;
  return `Đã hoàn thành “${t.title}”${xp != null ? ` · +${xp} XP` : ''}`;
}

/** Task lifecycle mutations with consistent invalidation and toasts. */
export function useTaskActions() {
  const inv = useInvalidate();
  const toast = useToast();
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const after = () => inv(TASK_CHANGE);

  const complete = useMutation({
    mutationFn: (v: { id: string; actualDuration?: number }) => api.completeTask(v.id, v.actualDuration),
    onSuccess: (t) => { toast(completedMessage(t)); return after(); },
    onError,
  });
  const start = useMutation({
    mutationFn: (id: string) => api.startTask(id),
    onSuccess: () => { toast('Đã bắt đầu Task'); return after(); },
    onError,
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.undoTask(id),
    onSuccess: () => { toast('Đã hoàn tác Task'); return after(); },
    onError,
  });
  return { complete, start, undo };
}

/** One-click Complete button (Dashboard / lists). */
export function CompleteButton({ task, small = true }: { task: TaskDto; small?: boolean }) {
  const { complete } = useTaskActions();
  const disabled = task.status === 'COMPLETED' || task.status === 'CANCELLED';
  return (
    <button
      className={`btn-success ${small ? 'btn-sm' : ''}`}
      disabled={disabled || complete.isPending}
      onClick={() => complete.mutate({ id: task.id })}
      aria-label={`Hoàn thành ${task.title}`}
    >
      {complete.isPending ? '…' : '✓ Hoàn thành'}
    </button>
  );
}

export function CancelDialog({ task, onClose }: { task: TaskDto; onClose: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const reasons = useReasons();
  const [tagId, setTagId] = useState('');
  const m = useMutation({
    mutationFn: () => api.cancelTask(task.id, tagId || undefined),
    onSuccess: () => { toast('Đã hủy Task'); onClose(); return inv(TASK_CHANGE); },
  });
  const needTag = task.missed;
  return (
    <Modal title="Hủy Task" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm">Hủy “{task.title}”? Task đã hủy không thể chuyển sang trạng thái khác.</p>
        {needTag && (
          <Field label="Lý do (bắt buộc vì Task đang quá hạn)">
            <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">— Chọn lý do —</option>
              {(reasons.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.exempt ? ' (miễn phạt)' : ''}</option>
              ))}
            </select>
          </Field>
        )}
        <ErrorText error={m.error} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Đóng</button>
          <button className="btn-danger" disabled={(needTag && !tagId) || m.isPending} onClick={() => m.mutate()}>Hủy Task</button>
        </div>
      </div>
    </Modal>
  );
}

export function MissedReviewDialog({ task, onClose }: { task: TaskDto; onClose: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const tz = useTimezone();
  const reasons = useReasons();
  const [tagId, setTagId] = useState(task.missedReasonTagId ?? '');
  // Task đã hủy chỉ được đổi lý do (F-15 rule 5) → action KEEP
  const cancelled = task.status === 'CANCELLED';
  const [action, setAction] = useState<MissedReviewAction>(cancelled ? 'KEEP' : 'RESCHEDULE');
  const [deadline, setDeadline] = useState(
    DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 23, minute: 59 }).toFormat("yyyy-MM-dd'T'HH:mm"),
  );
  const m = useMutation({
    mutationFn: () =>
      api.missedReview(task.id, {
        reasonTagId: tagId, action,
        newDeadline: action === 'RESCHEDULE' ? localInputToIso(deadline, tz) : undefined,
      }),
    onSuccess: () => { toast('Đã review Task quá hạn'); onClose(); return inv(TASK_CHANGE); },
  });
  const ACTIONS: { v: MissedReviewAction; label: string }[] = cancelled
    ? [{ v: 'KEEP', label: 'Chỉ đổi lý do' }]
    : [
      { v: 'RESCHEDULE', label: 'Dời deadline' },
      { v: 'CANCEL', label: 'Hủy Task' },
      { v: 'KEEP', label: 'Giữ nguyên' },
    ];
  return (
    <Modal title={cancelled ? `Đổi lý do bỏ lỡ: ${task.title}` : `Review Task quá hạn: ${task.title}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Lý do">
          <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">— Chọn lý do —</option>
            {(reasons.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.exempt ? ' (miễn phạt)' : ''}</option>
            ))}
          </select>
        </Field>
        <fieldset className="flex gap-4">
          <legend className="mb-1 text-sm font-medium">Hành động</legend>
          {ACTIONS.map((a) => (
            <label key={a.v} className="flex items-center gap-1.5">
              <input type="radio" name="review-action" checked={action === a.v} onChange={() => setAction(a.v)} />
              {a.label}
            </label>
          ))}
        </fieldset>
        {action === 'RESCHEDULE' && (
          <Field label="Deadline mới" hint={`Múi giờ ${tz}`}>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        )}
        <ErrorText error={m.error} />
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Đóng</button>
          <button
            className="btn-primary"
            disabled={!tagId || (action === 'RESCHEDULE' && !deadline) || m.isPending}
            onClick={() => m.mutate()}
          >
            Xác nhận
          </button>
        </div>
      </div>
    </Modal>
  );
}
