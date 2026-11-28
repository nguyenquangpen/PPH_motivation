import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { qk, useGoals, useTimezone } from '../api/queries';
import { TaskForm } from './TaskForm';
import { CancelDialog, MissedReviewDialog, useTaskActions } from './taskActions';
import { TaskSessions } from './TaskSessions';
import { Badge, ErrorText, Modal, QueryView } from './ui';
import { fmtDateTime, PRIORITY_LABEL, TASK_STATUS_LABEL } from '../lib/format';
import { expectedXpLabel } from '../lib/xp';
import { ResizeHandle, useResizable } from '../lib/useResizable';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="muted shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

/** Right-hand panel: the essentials of one task + its actions. Full history/sessions live on the detail page. */
export function TaskDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const tz = useTimezone();
  const goals = useGoals();
  const q = useQuery({ queryKey: [...qk.task, id], queryFn: () => api.getTask(id) });
  const { start, complete, undo } = useTaskActions();
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [review, setReview] = useState(false);
  const rz = useResizable({ storageKey: 'pph.drawerWidth', initial: 576, min: 380, max: 1100, dir: -1 });

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !edit && !cancel && !review && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, edit, cancel, review]);

  return (
    <div className="fixed inset-0 z-30 bg-black/30" onMouseDown={onClose}>
      <aside
        role="dialog" aria-label="Chi tiết Task"
        className={`absolute right-0 top-0 h-full max-w-full border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${rz.dragging ? 'select-none' : ''}`}
        style={{ width: rz.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ResizeHandle side="left" dragging={rz.dragging} {...rz.handleProps} />
        <div className="flex h-full flex-col overflow-y-auto p-5">
        <div className="mb-3 flex justify-end">
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <QueryView q={q} unavailable="Không tìm thấy Task.">
          {(t) => {
            const active = t.status === 'TODO' || t.status === 'IN_PROGRESS';
            const goal = (goals.data ?? []).find((g) => g.id === t.goalId);
            const err = start.error ?? complete.error ?? undo.error;
            return (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="break-words text-xl font-bold">{t.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge color={t.status === 'COMPLETED' ? 'green' : t.status === 'IN_PROGRESS' ? 'blue' : 'gray'}>{TASK_STATUS_LABEL[t.status]}</Badge>
                    {t.missed && <Badge color="red">Quá hạn</Badge>}
                    {t.missedReasonTagName && <Badge color="amber">Lý do: {t.missedReasonTagName}</Badge>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {t.status === 'TODO' && <button className="btn-ghost" disabled={start.isPending} onClick={() => start.mutate(t.id)}>▶ Bắt đầu</button>}
                  {active && <button className="btn-success" disabled={complete.isPending} onClick={() => complete.mutate({ id: t.id })}>✓ Hoàn thành</button>}
                  {t.missed && <button className="btn-ghost" onClick={() => setReview(true)}>Review quá hạn</button>}
                  {t.status === 'COMPLETED' && <button className="btn-ghost" disabled={undo.isPending} onClick={() => undo.mutate(t.id)}>↶ Hoàn tác</button>}
                  <button className="btn-ghost" onClick={() => setEdit(true)}>Sửa</button>
                  {active && <button className="btn-ghost text-rose-600" onClick={() => setCancel(true)}>Hủy</button>}
                </div>
                <ErrorText error={err} />

                {t.description && <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800/60">{t.description}</p>}

                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  <Row label="Hạn">{t.deadline ? fmtDateTime(t.deadline, tz) : 'Không có'}</Row>
                  <Row label="Mục tiêu">{t.goalId ? <Link className="link" to={`/goals/${t.goalId}`}>{goal?.title ?? 'Xem Goal'}</Link> : '—'}</Row>
                  <Row label="Ưu tiên">{PRIORITY_LABEL[t.priority]}</Row>
                  <Row label="Đóng góp">{t.contribution}</Row>
                  <Row label="Thời lượng">{t.actualDuration != null ? `${t.actualDuration}/${t.estimatedDuration}` : t.estimatedDuration} phút</Row>
                  <Row label="XP">{t.xpReceived != null ? `Nhận ${t.xpReceived} XP` : expectedXpLabel(t.expectedXp)}</Row>
                  {t.completedAt && <Row label="Hoàn thành lúc">{fmtDateTime(t.completedAt, tz)}</Row>}
                </dl>

                <TaskSessions taskId={t.id} estimated={t.estimatedDuration} locked={t.status === 'COMPLETED' || t.status === 'CANCELLED'} />

                <Link to={`/tasks/${t.id}`} className="link text-sm">Mở trang đầy đủ (phiên làm việc, lịch sử) →</Link>

                {edit && (
                  <Modal title="Sửa Task" onClose={() => setEdit(false)} width="max-w-3xl">
                    <TaskForm task={t} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
                  </Modal>
                )}
                {cancel && <CancelDialog task={t} onClose={() => setCancel(false)} />}
                {review && <MissedReviewDialog task={t} onClose={() => setReview(false)} />}
              </div>
            );
          }}
        </QueryView>
        </div>
      </aside>
    </div>
  );
}
