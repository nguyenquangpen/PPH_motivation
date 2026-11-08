import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { qk } from '../api/queries';
import { Badge, Empty } from './ui';
import { AcceptButton, useScheduleWarnings, WARNING_KIND_LABEL } from './TaskSessions';
import { fmtDate } from '../lib/format';

export function ScheduleWarningsCard() {
  const q = useScheduleWarnings();
  const tasks = (q.data?.tasks ?? []).filter((t) => !t.accepted);
  const days = (q.data?.days ?? []).filter((d) => !d.accepted);
  return (
    <section className="card" aria-labelledby="sched-h">
      <h2 id="sched-h" className="card-title">Cảnh báo lịch</h2>
      {q.isPending ? <p className="text-sm muted">Đang tải…</p> : q.isError ? <Empty>Chưa có dữ liệu cảnh báo lịch.</Empty>
        : tasks.length + days.length === 0 ? <Empty>Không có cảnh báo.</Empty> : (
          <ul className="flex flex-col gap-2 text-sm">
            {tasks.map((t) => (
              <li key={`${t.taskId}:${t.kind}`} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge color="amber">{WARNING_KIND_LABEL[t.kind] ?? t.kind}</Badge>
                  <Link className="link min-w-0 truncate" to={`/tasks/${t.taskId}#sessions`}>{t.taskTitle}</Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs muted">Thiếu {t.missingMinutes} phút ({t.scheduledMinutes}/{t.estimatedMinutes})</span>
                  <span className="ml-auto"><AcceptButton kind="TASK" refId={t.taskId} /></span>
                </div>
              </li>
            ))}
            {days.map((d) => (
              <li key={d.date} className="flex items-center gap-2">
                <Badge color="red">Quá tải</Badge>
                <span>{fmtDate(d.date)}: {d.loadMinutes}/{d.capacityMinutes} phút</span>
                <span className="ml-auto"><AcceptButton kind="DAY" refId={d.date} /></span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export function CalendarErrorBanner() {
  const q = useQuery({ queryKey: [...qk.calendar, 'status'], queryFn: api.calendarStatus, retry: false });
  if (q.data?.status !== 'ERROR') return null;
  return (
    <div role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      Đồng bộ Google Calendar lỗi: {q.data.error ?? 'không rõ nguyên nhân'}. <Link to="/settings#calendar" className="font-semibold underline">Mở Cài đặt</Link>
    </div>
  );
}
