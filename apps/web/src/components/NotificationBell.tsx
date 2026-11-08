import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { NotificationDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, useInvalidate, useTimezone } from '../api/queries';
import { errorMessage, isNotFound } from '../api/client';
import { fmtDateTime, NOTIF_TYPE_LABEL } from '../lib/format';
import { useToast } from './ui';

function linkFor(n: NotificationDto): string | null {
  if (n.type === 'CALENDAR_SYNC_ERROR') return '/settings#calendar';
  if (n.type === 'EXTERNAL_APP_INACTIVE') return '/integrations';
  if (n.type === 'CALENDAR_EVENT_DELETED' && n.objectId && n.objectType !== 'SESSION') return `/tasks/${n.objectId}`;
  if (n.type === 'CALENDAR_EVENT_DELETED') return '/tasks';
  if (!n.objectId) return null;
  switch (n.objectType) {
    case 'TASK': return `/tasks/${n.objectId}`;
    case 'GOAL': return `/goals/${n.objectId}`;
    default: break;
  }
  if (n.type === 'LEVEL_UP' || n.type === 'POOL_REWARD') return '/rewards#transactions';
  return null;
}

export function NotificationBell() {
  const tz = useTimezone();
  const toast = useToast();
  const inv = useInvalidate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: qk.notifications, queryFn: api.listNotifications, refetchInterval: 60_000 });
  const items = q.data?.items ?? [];
  const unread = q.data?.unreadCount ?? 0;

  const onDone = { onSuccess: () => inv(['notifications', 'dashboard']), onError: (e: unknown) => toast(errorMessage(e), 'error') };
  const markRead = useMutation({ mutationFn: api.readNotification, ...onDone });
  const markAll = useMutation({ mutationFn: api.readAllNotifications, ...onDone });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost relative" onClick={() => setOpen((o) => !o)} aria-label={`Thông báo (${unread} chưa đọc)`}>
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-rose-600 px-1 text-center text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-96 rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <span className="font-semibold">Thông báo</span>
            <button className="link text-sm" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
              Đánh dấu tất cả đã đọc
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {q.isError && (
              <li className="px-3 py-3 text-sm muted">{isNotFound(q.error) ? 'Thông báo chưa sẵn sàng.' : errorMessage(q.error)}</li>
            )}
            {!q.isError && items.length === 0 && <li className="px-3 py-3 text-sm muted">Không có thông báo.</li>}
            {items.map((n) => {
              const to = linkFor(n);
              return (
                <li key={n.id} className={`border-b border-slate-100 px-3 py-2 text-sm dark:border-slate-800 ${n.read ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs muted">{NOTIF_TYPE_LABEL[n.type] ?? n.type} · {fmtDateTime(n.createdAt, tz)}</div>
                      {to ? (
                        <Link to={to} className="font-medium hover:underline" onClick={() => { setOpen(false); if (!n.read) markRead.mutate(n.id); }}>
                          {n.title}
                        </Link>
                      ) : (
                        <div className="font-medium">{n.title}</div>
                      )}
                      {n.body && <div className="muted">{n.body}</div>}
                    </div>
                    {!n.read && (
                      <button className="btn-ghost btn-sm shrink-0" onClick={() => markRead.mutate(n.id)}>Đã đọc</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
