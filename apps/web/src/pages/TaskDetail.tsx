import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorCode } from '@pph/shared';
import { api, type TaskDetail } from '../api/endpoints';
import { qk, TASK_CHANGE, useGoals, useInvalidate, useReasons, useTimezone } from '../api/queries';
import { errorMessage, isApiError } from '../api/client';
import { TaskForm } from '../components/TaskForm';
import { CancelDialog, MissedReviewDialog, useTaskActions } from '../components/taskActions';
import { TaskSessions } from '../components/TaskSessions';
import { Badge, ErrorText, Modal, QueryView, useToast } from '../components/ui';
import { fmtDateTime, PRIORITY_LABEL, TASK_STATUS_LABEL } from '../lib/format';
import { expectedXpLabel } from '../lib/xp';

function Attr({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function TaskBody({ t }: { t: TaskDetail }) {
  const tz = useTimezone();
  const nav = useNavigate();
  const inv = useInvalidate();
  const toast = useToast();
  const goals = useGoals();
  const reasons = useReasons();
  const { start, complete, undo } = useTaskActions();
  const [actual, setActual] = useState(t.actualDuration != null ? String(t.actualDuration) : '');
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [review, setReview] = useState(false);

  const goal = (goals.data ?? []).find((g) => g.id === t.goalId);
  const listedTag = (reasons.data ?? []).find((r) => r.id === t.missedReasonTagId);
  // Soft-deleted tags are not in the list; fetch them by id to show the old name.
  const tagById = useQuery({
    queryKey: [...qk.reasons, 'byId', t.missedReasonTagId],
    queryFn: () => api.getReason(t.missedReasonTagId ?? ''),
    enabled: !!t.missedReasonTagId && reasons.isSuccess && !listedTag, // exempt flag of soft-deleted tags
  });
  const tag = listedTag ?? tagById.data;
  const active = t.status === 'TODO' || t.status === 'IN_PROGRESS';
  const actualNum = Number(actual);
  const actualValid = actual === '' || (Number.isInteger(actualNum) && actualNum >= 1 && actualNum <= 1440);

  const del = useMutation({
    mutationFn: async () => {
      try {
        return await api.deleteTask(t.id);
      } catch (e) {
        if (isApiError(e) && e.code === ErrorCode.CONFIRM_REQUIRED) {
          if (!window.confirm(e.message)) return null;
          return api.deleteTask(t.id, true);
        }
        throw e;
      }
    },
    onSuccess: async (r) => {
      if (r === null) return;
      toast('Đã xóa Task');
      await inv(TASK_CHANGE);
      nav('/tasks');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const actionError = start.error ?? complete.error ?? undo.error;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/tasks" className="link text-sm">← Công việc</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 break-words text-2xl font-bold">{t.title}</h1>
        <Badge color={t.status === 'COMPLETED' ? 'green' : t.status === 'IN_PROGRESS' ? 'blue' : 'gray'}>{TASK_STATUS_LABEL[t.status]}</Badge>
        {t.missed && <Badge color="red">Quá hạn</Badge>}
        {(t.missedReasonTagName ?? tag?.name) && (
          <Badge color={tag?.exempt ? 'amber' : 'gray'}>Lý do: {t.missedReasonTagName ?? tag?.name}{tag?.exempt ? ' (miễn phạt)' : ''}</Badge>
        )}
      </div>

      <section className="card">
        <h2 className="card-title">Thao tác</h2>
        <div className="flex flex-wrap items-end gap-2">
          {t.status === 'TODO' && (
            <button className="btn-ghost" disabled={start.isPending} onClick={() => start.mutate(t.id)}>▶ Bắt đầu</button>
          )}
          {active && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs muted">Thời lượng thực tế (phút, tùy chọn)</span>
                <input type="number" min={1} max={1440} className="w-40" value={actual} onChange={(e) => setActual(e.target.value)} />
              </label>
              <button
                className="btn-success" disabled={!actualValid || complete.isPending}
                onClick={() => complete.mutate({ id: t.id, actualDuration: actual ? actualNum : undefined })}
              >
                ✓ Hoàn thành
              </button>
              <button className="btn-ghost" onClick={() => setCancel(true)}>Hủy Task</button>
            </>
          )}
          {t.missed && <button className="btn-ghost" onClick={() => setReview(true)}>Review quá hạn</button>}
          {t.status === 'CANCELLED' && t.missedReasonTagId && (
            <button className="btn-ghost" onClick={() => setReview(true)}>Đổi lý do</button>
          )}
          {t.status === 'COMPLETED' && (
            <button className="btn-ghost" disabled={undo.isPending} onClick={() => undo.mutate(t.id)}>↶ Hoàn tác</button>
          )}
          <button className="btn-ghost" onClick={() => setEdit(true)}>Sửa</button>
          <button className="btn-ghost ml-auto text-rose-600" disabled={del.isPending} onClick={() => window.confirm('Xóa Task này?') && del.mutate()}>Xóa</button>
        </div>
        <div className="mt-2"><ErrorText error={actionError} /></div>
      </section>

      <section className="card">
        <h2 className="card-title">Thuộc tính</h2>
        <dl className="grid grid-cols-4 gap-4 text-sm">
          <Attr label="Độ ưu tiên">{PRIORITY_LABEL[t.priority]}</Attr>
          <Attr label="Đóng góp">{t.contribution}{t.expectedXp.isSmall ? ' (Task nhỏ)' : ''}</Attr>
          <Attr label="Goal">{t.goalId ? <Link className="link" to={`/goals/${t.goalId}`}>{goal?.title ?? 'Xem Goal'}</Link> : '—'}</Attr>
          <Attr label="Milestone">{t.milestoneIds.length || '—'}</Attr>
          <Attr label="Thời lượng ước tính">{t.estimatedDuration} phút</Attr>
          <Attr label="Thời lượng thực tế">{t.actualDuration != null ? `${t.actualDuration} phút` : '—'}</Attr>
          <Attr label="Deadline">{fmtDateTime(t.deadline, tz)}</Attr>
          <Attr label="Hoàn thành lúc">{fmtDateTime(t.completedAt, tz)}</Attr>
          <Attr label="XP dự kiến">{expectedXpLabel(t.expectedXp)}{!t.expectedXp.isSmall ? '' : ` (danh nghĩa ${t.expectedXp.nominalXp})`}</Attr>
          <Attr label="XP thực nhận">
            {t.xpReceived != null ? <Link className="link" to="/rewards#transactions">{t.xpReceived} XP</Link> : '—'}
          </Attr>
          <Attr label="Tạo lúc">{fmtDateTime(t.createdAt, tz)}</Attr>
          <Attr label="Cập nhật">{fmtDateTime(t.updatedAt, tz)}</Attr>
        </dl>
        {t.description && <p className="mt-3 whitespace-pre-wrap text-sm">{t.description}</p>}
      </section>

      <TaskSessions taskId={t.id} estimated={t.estimatedDuration} locked={t.status === 'COMPLETED' || t.status === 'CANCELLED'} />

      <section className="card">
        <h2 className="card-title">Lịch sử trạng thái</h2>
        {(t.history ?? []).length === 0 ? <p className="text-sm muted">Chưa có.</p> : (
          <table className="tbl">
            <colgroup><col className="w-40" /><col className="w-32" /><col className="w-32" /><col /></colgroup>
            <thead><tr><th>Thời điểm</th><th>Từ</th><th>Sang</th><th>Lý do</th></tr></thead>
            <tbody>
              {t.history.map((h, i) => (
                <tr key={i}>
                  <td className="text-xs">{fmtDateTime(h.at, tz)}</td>
                  <td>{h.fromStatus ? TASK_STATUS_LABEL[h.fromStatus] : '—'}</td>
                  <td>{TASK_STATUS_LABEL[h.toStatus]}</td>
                  <td className="text-xs">{h.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {edit && (
        <Modal title="Sửa Task" onClose={() => setEdit(false)} width="max-w-3xl">
          <TaskForm task={t} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
        </Modal>
      )}
      {cancel && <CancelDialog task={t} onClose={() => setCancel(false)} />}
      {review && <MissedReviewDialog task={t} onClose={() => setReview(false)} />}
    </div>
  );
}

export function TaskDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: [...qk.task, id], queryFn: () => api.getTask(id) });
  return <QueryView q={q} unavailable="Không tìm thấy Task.">{(t) => <TaskBody t={t} />}</QueryView>;
}

