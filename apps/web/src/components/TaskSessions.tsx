import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CalendarSyncState, SessionDto, SuggestionOptionDto, TaskWarningDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, SESSION_CHANGE, useInvalidate, useTimezone } from '../api/queries';
import { errorMessage, isApiError, isNotFound } from '../api/client';
import { Badge, Empty, ErrorText, Modal, QueryView, useToast } from './ui';
import { fmtDateTime, isoToLocalInput, localInputToIso } from '../lib/format';

export const SYNC_BADGE: Record<CalendarSyncState, { label: string; color: string }> = {
  NONE: { label: 'Chưa đồng bộ', color: 'gray' },
  PENDING: { label: 'Đang chờ', color: 'amber' },
  SYNCED: { label: 'Đã đồng bộ', color: 'green' },
  ERROR: { label: 'Lỗi', color: 'red' },
  DETACHED: { label: 'Đã gỡ', color: 'gray' },
  INACTIVE: { label: 'Ngừng', color: 'gray' },
};

export const WARNING_KIND_LABEL: Record<TaskWarningDto['kind'], string> = {
  INSUFFICIENT: 'Thiếu thời gian',
  BIG_TASK_UNDER_SCHEDULED: 'Task lớn chưa xếp đủ',
};

function SessionForm({ taskId, s, onDone }: { taskId: string; s?: SessionDto; onDone: () => void }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const [start, setStart] = useState(isoToLocalInput(s?.start, tz));
  const [end, setEnd] = useState(isoToLocalInput(s?.end, tz));
  const m = useMutation({
    mutationFn: () => {
      const b = { start: localInputToIso(start, tz) ?? '', end: localInputToIso(end, tz) ?? '' };
      return s ? api.updateSession(s.id, b) : api.createSession(taskId, b);
    },
    onSuccess: async () => { toast(s ? 'Đã sửa phiên' : 'Đã thêm phiên'); await inv(SESSION_CHANGE); onDone(); },
  });
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1"><span className="text-xs muted">Bắt đầu ({tz})</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Bắt đầu" required />
        </label>
        <label className="flex flex-col gap-1"><span className="text-xs muted">Kết thúc</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Kết thúc" required />
        </label>
        <button className="btn-primary btn-sm" disabled={!start || !end || m.isPending}>{s ? 'Lưu' : 'Thêm phiên'}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Hủy</button>
      </div>
      <ErrorText error={m.error} />
    </form>
  );
}

export function SuggestionsDialog({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: [...qk.sessions, 'suggestions', taskId], queryFn: () => api.suggestions(taskId), staleTime: 0 });
  const apply = useMutation({
    mutationFn: (o: SuggestionOptionDto) => api.applySuggestion(taskId, o.sessions),
    onSuccess: async () => { toast('Đã xếp lịch theo gợi ý'); await inv(SESSION_CHANGE); onClose(); },
  });
  const conflict = isApiError(apply.error) && apply.error.status === 409;
  return (
    <Modal title="Gợi ý lịch" onClose={onClose} width="max-w-2xl">
      <QueryView q={q} unavailable="Chức năng gợi ý lịch chưa sẵn sàng.">
        {(d) => (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Còn cần xếp: <strong>{d.remainingMinutes} phút</strong> · trước {fmtDateTime(d.windowEnd, tz)}</p>
            {d.message && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{d.message}</p>}
            {!d.calendarDataAvailable && !d.message && <p className="text-xs muted">Chưa có dữ liệu lịch Google — gợi ý chỉ dựa trên giờ làm việc.</p>}
            {d.options.length === 0 ? <Empty>Không có phương án nào.</Empty> : (
              <ul className="flex flex-col gap-2">
                {d.options.slice(0, 3).map((o) => (
                  <li key={o.index} className="rounded-md border border-slate-200 p-3 dark:border-slate-700" data-testid="suggestion-option">
                    <div className="mb-1 flex items-center gap-2">
                      <strong>Phương án {o.index + 1}</strong>
                      <Badge color="blue">{o.kind === 'CONTIGUOUS' ? 'Liền mạch' : 'Chia nhỏ'}</Badge>
                      <span className="text-sm">{o.totalMinutes} phút</span>
                      {!o.complete && <Badge color="amber">Chưa đủ</Badge>}
                      <button className="btn-primary btn-sm ml-auto" disabled={apply.isPending} onClick={() => apply.mutate(o)}>Chọn</button>
                    </div>
                    <ul className="text-sm muted">
                      {o.sessions.map((s, i) => <li key={i}>{fmtDateTime(s.start, tz)} – {fmtDateTime(s.end, tz).slice(11)}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {conflict ? (
              <div role="alert" className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                Lịch đã thay đổi, tải lại gợi ý
                <button className="btn-ghost btn-sm ml-auto" onClick={() => { apply.reset(); void q.refetch(); }}>Tải lại</button>
              </div>
            ) : <ErrorText error={apply.error} />}
          </div>
        )}
      </QueryView>
    </Modal>
  );
}

export function AcceptButton({ kind, refId }: { kind: 'TASK' | 'DAY'; refId: string }) {
  const inv = useInvalidate();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.acceptWarning(kind, refId),
    onSuccess: () => { toast('Đã chấp nhận lịch'); return inv(['warnings', 'dashboard']); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return <button className="btn-ghost btn-sm" disabled={m.isPending} onClick={() => m.mutate()}>Chấp nhận lịch này</button>;
}

export function useScheduleWarnings() {
  return useQuery({ queryKey: qk.warnings, queryFn: api.warnings, retry: false });
}

export function TaskSessions({ taskId, estimated, locked }: { taskId: string; estimated: number; locked: boolean }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const q = useQuery({ queryKey: [...qk.sessions, taskId], queryFn: () => api.listSessions(taskId) });
  const w = useScheduleWarnings();
  const del = useMutation({
    mutationFn: api.deleteSession,
    onSuccess: () => { toast('Đã xóa phiên'); return inv(SESSION_CHANGE); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const sessions = q.data ?? [];
  const scheduled = sessions.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const warnings = (w.data?.tasks ?? []).filter((x) => x.taskId === taskId && !x.accepted);

  return (
    <section className="card" id="sessions">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="card-title mb-0">Phiên làm việc</h2>
        <span className="text-sm muted">Ước tính {estimated} · Đã xếp {scheduled} phút</span>
        {!locked && (
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setSuggest(true)}>Gợi ý lịch</button>
            <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setEditId(null); }}>+ Thêm phiên</button>
          </div>
        )}
      </div>
      {warnings.map((x) => (
        <div key={x.kind} className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
          <Badge color="amber">{WARNING_KIND_LABEL[x.kind] ?? x.kind}</Badge>
          <span>Thiếu {x.missingMinutes} phút (đã xếp {x.scheduledMinutes}/{x.estimatedMinutes})</span>
          <span className="ml-auto"><AcceptButton kind="TASK" refId={x.taskId} /></span>
        </div>
      ))}
      {locked && <p className="mb-2 text-xs muted">Task đã kết thúc — không thể sửa phiên.</p>}
      {adding && !locked && <div className="mb-2"><SessionForm taskId={taskId} onDone={() => setAdding(false)} /></div>}
      <QueryView q={q} unavailable="Chức năng phiên làm việc chưa sẵn sàng.">
        {(list) => list.length === 0 ? <Empty>Chưa có phiên nào.</Empty> : (
          <table className="tbl">
            <colgroup><col /><col className="w-20" /><col className="w-32" /><col className="w-36" /></colgroup>
            <thead><tr><th>Thời gian</th><th>Phút</th><th>Lịch Google</th><th></th></tr></thead>
            <tbody>
              {list.map((s) => editId === s.id ? (
                <tr key={s.id}><td colSpan={4}><SessionForm taskId={taskId} s={s} onDone={() => setEditId(null)} /></td></tr>
              ) : (
                <tr key={s.id}>
                  <td>{fmtDateTime(s.start, tz)} – {fmtDateTime(s.end, tz)}{s.source === 'LINKED' && <span className="ml-1 text-xs muted">(liên kết)</span>}</td>
                  <td className="tabular-nums">{s.minutes}</td>
                  <td><Badge color={SYNC_BADGE[s.calendar]?.color}>{SYNC_BADGE[s.calendar]?.label ?? s.calendar}</Badge></td>
                  <td className="text-right">
                    {!locked && (
                      <>
                        <button className="btn-ghost btn-sm mr-1" onClick={() => { setEditId(s.id); setAdding(false); }}>Sửa</button>
                        <button className="btn-ghost btn-sm text-rose-600" disabled={del.isPending} onClick={() => window.confirm('Xóa phiên này?') && del.mutate(s.id)}>Xóa</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
      {w.isError && !isNotFound(w.error) && <ErrorText error={w.error} />}
      {suggest && <SuggestionsDialog taskId={taskId} onClose={() => setSuggest(false)} />}
    </section>
  );
}
