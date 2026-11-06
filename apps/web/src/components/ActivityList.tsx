import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ActivityItemDto } from '@pph/shared';
import { api, type ActivityFilters } from '../api/endpoints';
import { qk, useTimezone } from '../api/queries';
import { activityTypeLabel, fmtDateTime } from '../lib/format';
import { Empty, Pagination, QueryView } from './ui';

function short(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

function Row({ a, tz }: { a: ActivityItemDto; tz: string }) {
  return (
    <tr>
      <td className="whitespace-nowrap text-xs muted">{fmtDateTime(a.createdAt, tz)}</td>
      <td className="text-xs" title={a.type}>
        <div className="truncate font-medium">{activityTypeLabel(a.type)}</div>
        {activityTypeLabel(a.type) !== a.type && <div className="truncate muted">{a.type}</div>}
      </td>
      <td>
        <div>{a.message}</div>
        {(a.before != null || a.after != null) && (
          <div className="break-all text-xs muted">
            {a.before != null && <>Trước: {short(a.before)} </>}
            {a.after != null && <>· Sau: {short(a.after)}</>}
          </div>
        )}
      </td>
      <td className="text-xs">
        <div className="flex flex-col">
          {a.goalId && <Link className="link" to={`/goals/${a.goalId}`}>Goal</Link>}
          {a.taskId && <Link className="link" to={`/tasks/${a.taskId}`}>Task</Link>}
          {a.itemId && <Link className="link" to="/rewards">Vật phẩm</Link>}
        </div>
      </td>
    </tr>
  );
}

export function ActivityList({ filters, onPage }: { filters: ActivityFilters; onPage?: (p: number) => void }) {
  const tz = useTimezone();
  const q = useQuery({
    queryKey: [...qk.activity, filters],
    queryFn: () => api.activity(filters),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryView q={q} unavailable="Lịch sử hoạt động chưa sẵn sàng.">
      {(p) =>
        p.items.length === 0 ? <Empty>Không có hoạt động.</Empty> : (
          <>
            <table className="tbl">
              <colgroup><col className="w-36" /><col className="w-40" /><col /><col className="w-20" /></colgroup>
              <thead><tr><th>Thời gian</th><th>Loại</th><th>Mô tả</th><th>Liên kết</th></tr></thead>
              <tbody>{p.items.map((a) => <Row key={a.id} a={a} tz={tz} />)}</tbody>
            </table>
            {onPage && <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPage={onPage} />}
          </>
        )
      }
    </QueryView>
  );
}
