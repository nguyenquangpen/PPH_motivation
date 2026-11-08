import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, Weekday, type CalendarStatus, type TimeWindow, type WorkingHours } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, useInvalidate, useSettings, useTimezone } from '../api/queries';
import { errorMessage, isNotFound } from '../api/client';
import { Badge, Empty, ErrorText, useToast } from './ui';
import { fmtDateTime } from '../lib/format';

const STATUS_BADGE: Record<CalendarStatus, { label: string; color: string }> = {
  NOT_CONNECTED: { label: 'Chưa kết nối', color: 'gray' },
  ACTIVE: { label: 'Đang hoạt động', color: 'green' },
  ERROR: { label: 'Lỗi', color: 'red' },
};

// ================= Google Calendar =================
function OauthClientForm() {
  const toast = useToast();
  const inv = useInvalidate();
  const q = useQuery({ queryKey: [...qk.calendar, 'oauth-client'], queryFn: api.getOauthClient, retry: false });
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  useEffect(() => { if (q.data?.clientId) setClientId(q.data.clientId); }, [q.data?.clientId]);
  const save = useMutation({
    mutationFn: () => api.putOauthClient({ clientId: clientId.trim(), clientSecret: secret.trim() }),
    onSuccess: () => { setSecret(''); toast('Đã lưu OAuth client'); return inv(['calendar']); },
  });
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="mb-1 font-semibold">OAuth client</h3>
      <ol className="mb-2 list-decimal pl-5 text-xs muted">
        <li>Vào Google Cloud Console, tạo một project mới.</li>
        <li>APIs &amp; Services → Library → bật <strong>Google Calendar API</strong>.</li>
        <li>OAuth consent screen: chọn <strong>External</strong>, điền thông tin, rồi chuyển sang <strong>In production</strong>.</li>
        <li>Credentials → Create credentials → <strong>OAuth client ID</strong>, loại <strong>Desktop app</strong>.</li>
        <li>Dán Client ID và Client Secret vào đây, bấm Lưu, rồi bấm Kết nối.</li>
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1"><span className="text-sm">Client ID</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client ID" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Client Secret {q.data?.hasSecret && <span className="text-xs muted">(đã lưu — nhập để thay)</span>}</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Client Secret" />
        </label>
      </div>
      <div className="mt-2"><ErrorText error={save.error} /></div>
      <div className="mt-2 flex justify-end">
        <button className="btn-primary btn-sm" disabled={!clientId.trim() || !secret.trim() || save.isPending} onClick={() => save.mutate()}>Lưu</button>
      </div>
    </div>
  );
}

function BusyCalendars() {
  const toast = useToast();
  const inv = useInvalidate();
  const q = useQuery({ queryKey: [...qk.calendar, 'list'], queryFn: api.calendarList, retry: false });
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (q.data) setSel(q.data.filter((c) => c.selectedForBusy).map((c) => c.id)); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.setBusyCalendars(sel),
    onSuccess: () => { toast('Đã lưu lịch bận'); return inv(['calendar', 'warnings']); },
  });
  if (q.isError) return isNotFound(q.error) ? null : <ErrorText error={q.error} />;
  if (!q.data) return null;
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="mb-1 font-semibold">Lịch dùng để tính giờ bận</h3>
      {q.data.length === 0 ? <Empty>Không có lịch.</Empty> : (
        <ul className="flex flex-col gap-1">
          {q.data.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox" checked={sel.includes(c.id)}
                  onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                />
                {c.name}{c.primary && <Badge color="blue">Chính</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2"><ErrorText error={save.error} /></div>
      <div className="mt-2 flex justify-end">
        <button className="btn-primary btn-sm" disabled={sel.length === 0 || save.isPending} onClick={() => save.mutate()}>Lưu</button>
      </div>
    </div>
  );
}

export function CalendarSection() {
  const tz = useTimezone();
  const toast = useToast();
  const inv = useInvalidate();
  const [polling, setPolling] = useState(false);
  const pollFrom = useRef<CalendarStatus | null>(null);
  const q = useQuery({
    queryKey: [...qk.calendar, 'status'], queryFn: api.calendarStatus, retry: false,
    refetchInterval: polling ? 2000 : false,
  });
  const st = q.data;
  useEffect(() => {
    if (!polling || !st) return;
    if (st.connectError && !st.connecting) {
      setPolling(false);
      toast(`Kết nối lỗi: ${st.connectError}`, 'error');
      return;
    }
    if (st.status === 'ACTIVE' || (st.status === 'ERROR' && pollFrom.current !== 'ERROR')) {
      setPolling(false);
      toast(st.status === 'ACTIVE' ? 'Đã kết nối Google Calendar' : `Kết nối lỗi: ${st.error ?? ''}`, st.status === 'ACTIVE' ? 'ok' : 'error');
      void inv(['calendar']);
    }
  }, [polling, st, toast, inv]);
  useEffect(() => {
    if (!polling) return;
    const t = setTimeout(() => setPolling(false), 5 * 60_000);
    return () => clearTimeout(t);
  }, [polling]);

  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const connect = useMutation({
    mutationFn: api.calendarConnect,
    onSuccess: (r) => { pollFrom.current = st?.status ?? null; window.open(r.authUrl, '_blank'); setPolling(true); },
    onError,
  });
  const disconnect = useMutation({
    mutationFn: api.calendarDisconnect,
    onSuccess: () => { toast('Đã ngắt kết nối'); return inv(['calendar']); }, onError,
  });
  const sync = useMutation({
    mutationFn: api.calendarSync,
    onSuccess: () => { toast('Đã yêu cầu đồng bộ'); return inv(['calendar', 'sessions', 'warnings']); }, onError,
  });

  return (
    <section className="card" id="calendar">
      <h2 className="card-title">Google Calendar</h2>
      {q.isError && !isNotFound(q.error) && <ErrorText error={q.error} />}
      {q.isError && isNotFound(q.error) && <Empty>Chức năng Google Calendar chưa sẵn sàng.</Empty>}
      {st && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <Badge color={STATUS_BADGE[st.status]?.color}>{STATUS_BADGE[st.status]?.label ?? st.status}</Badge>
          {st.accountEmail && <span>{st.accountEmail}</span>}
          <span className="muted">Đồng bộ lần cuối: {fmtDateTime(st.lastSuccessAt, tz)}</span>
          {st.pendingChanges > 0 && <span className="muted">Chờ đẩy: {st.pendingChanges}</span>}
          {polling && <span className="muted">Đang chờ xác nhận trên trình duyệt…</span>}
          <div className="ml-auto flex gap-2">
            {st.status !== 'ACTIVE' && <button className="btn-primary btn-sm" disabled={connect.isPending || polling} onClick={() => connect.mutate()}>Kết nối</button>}
            {st.status !== 'NOT_CONNECTED' && (
              <>
                <button className="btn-ghost btn-sm" disabled={sync.isPending} onClick={() => sync.mutate()}>Đồng bộ ngay</button>
                <button className="btn-ghost btn-sm text-rose-600" disabled={disconnect.isPending} onClick={() => window.confirm('Ngắt kết nối Google Calendar?') && disconnect.mutate()}>Ngắt kết nối</button>
              </>
            )}
          </div>
        </div>
      )}
      {st?.status === 'ERROR' && st.error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{st.error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <OauthClientForm />
        {st && st.status !== 'NOT_CONNECTED' && <BusyCalendars />}
      </div>
    </section>
  );
}

// ================= Working hours =================
const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật',
};

export function WorkingHoursEditor({ initial }: { initial: WorkingHours }) {
  const toast = useToast();
  const inv = useInvalidate();
  const [wh, setWh] = useState<WorkingHours>(initial);
  useEffect(() => setWh(initial), [initial]);
  const save = useMutation({
    mutationFn: () => api.putWorkingHours(wh),
    onSuccess: () => { toast('Đã lưu giờ làm việc'); return inv(['settings', 'warnings']); },
  });
  const setDay = (d: Weekday, f: (ws: TimeWindow[]) => TimeWindow[]) => setWh((w) => ({ ...w, [d]: f(w[d] ?? []) }));
  return (
    <section className="card" id="working-hours">
      <h2 className="card-title">Giờ làm việc</h2>
      <div className="flex flex-col gap-2">
        {Weekday.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-2" data-testid={`wh-${d}`}>
            <span className="w-20 text-sm font-medium">{WEEKDAY_LABEL[d]}</span>
            {(wh[d] ?? []).length === 0 && <span className="text-xs muted">Nghỉ</span>}
            {(wh[d] ?? []).map((w, i) => (
              <span key={i} className="flex items-center gap-1">
                <input
                  type="time" className="w-28" value={w.start} aria-label={`${WEEKDAY_LABEL[d]} bắt đầu ${i + 1}`}
                  onChange={(e) => setDay(d, (ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                />
                –
                <input
                  type="time" className="w-28" value={w.end === '24:00' ? '23:59' : w.end} aria-label={`${WEEKDAY_LABEL[d]} kết thúc ${i + 1}`}
                  onChange={(e) => setDay(d, (ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                />
                <button className="btn-ghost btn-sm" aria-label={`Xóa khung ${WEEKDAY_LABEL[d]} ${i + 1}`} onClick={() => setDay(d, (ws) => ws.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
            <button
              className="btn-ghost btn-sm" aria-label={`Thêm khung ${WEEKDAY_LABEL[d]}`}
              onClick={() => setDay(d, (ws) => [...ws, { start: '08:00', end: '12:00' }])}
            >
              + Khung
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2"><ErrorText error={save.error} /></div>
      <div className="mt-2 flex justify-end">
        <button className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>Lưu giờ làm việc</button>
      </div>
    </section>
  );
}

export function WorkingHoursSection() {
  const { settings } = useSettings();
  const q = useQuery({ queryKey: [...qk.settings, 'working-hours'], queryFn: api.getWorkingHours, retry: false });
  const initial = q.data ?? settings.workingHours ?? DEFAULT_SETTINGS.workingHours;
  if (q.isPending) return <section className="card"><h2 className="card-title">Giờ làm việc</h2><p className="text-sm muted">Đang tải…</p></section>;
  return <WorkingHoursEditor initial={initial} />;
}
