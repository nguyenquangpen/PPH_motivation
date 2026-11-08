import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { IntegrationAppDto, IntegrationAppStatus, IntegrationEventDto, IntegrationEventStatus, RuleDto } from '@pph/shared';
import { api, type IntegrationEventFilters, type RuleInput } from '../api/endpoints';
import { qk, useGoals, useInvalidate, useTimezone, XP_CHANGE } from '../api/queries';
import { errorMessage } from '../api/client';
import { Badge, Empty, ErrorText, Field, Modal, Pagination, QueryView, useToast } from '../components/ui';
import { endOfDayIso, fmtDateTime, startOfDayIso } from '../lib/format';

const APP_STATUS: Record<IntegrationAppStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Hoạt động', color: 'green' },
  INACTIVE: { label: 'Không hoạt động', color: 'amber' },
  NO_DATA: { label: 'Chưa có dữ liệu', color: 'gray' },
};
const EVENT_STATUS: Record<IntegrationEventStatus, { label: string; color: string }> = {
  RECEIVED: { label: 'Đã nhận', color: 'blue' },
  PROCESSED: { label: 'Đã xử lý', color: 'green' },
  IGNORED: { label: 'Bỏ qua', color: 'gray' },
  FAILED: { label: 'Lỗi', color: 'red' },
};
const FREQ_LABEL = { DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần', NONE: 'Không theo dõi' } as const;
const EVENT_TYPES = ['vocabulary.learned', 'lesson.completed', 'learning.session.completed'];
const FIELDS = ['count', 'duration_minutes', 'items_reviewed'] as const;

const useApps = () => useQuery({ queryKey: [...qk.integrations, 'apps'], queryFn: api.listApps });

// ================= Key created dialog =================
export function KeyCreatedDialog({ keyValue, onClose }: { keyValue: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(keyValue); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Modal title="Key mới" onClose={onClose}>
      <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        Key chỉ hiển thị một lần. Hãy sao chép và lưu lại ngay.
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-slate-100 px-2 py-1.5 text-sm dark:bg-slate-800" data-testid="created-key">{keyValue}</code>
        <button className="btn-primary btn-sm" onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
      </div>
      <div className="mt-3 flex justify-end"><button className="btn-ghost btn-sm" onClick={onClose}>Đóng</button></div>
    </Modal>
  );
}

// ================= Apps =================
function AppCard({ app }: { app: IntegrationAppDto }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const [keyName, setKeyName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const refresh = () => inv(['integrations']);
  const upd = useMutation({ mutationFn: (f: 'DAILY' | 'WEEKLY' | 'NONE') => api.updateApp(app.id, { expectedFrequency: f }), onSuccess: refresh, onError });
  const del = useMutation({ mutationFn: () => api.deleteApp(app.id), onSuccess: () => { toast('Đã xóa app'); return refresh(); }, onError });
  const createKey = useMutation({
    mutationFn: () => api.createKey(app.id, keyName.trim()),
    onSuccess: (k) => { setKeyName(''); setCreated(k.key); return refresh(); }, onError,
  });
  const revoke = useMutation({ mutationFn: api.revokeKey, onSuccess: () => { toast('Đã thu hồi key'); return refresh(); }, onError });
  const st = APP_STATUS[app.status] ?? { label: app.status, color: 'gray' };
  return (
    <li className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{app.name}</strong>
        <code className="text-xs muted">{app.appId}</code>
        <Badge color={st.color}>{st.label}</Badge>
        <label className="ml-auto flex items-center gap-1 text-xs">
          Tần suất mong đợi
          <select value={app.expectedFrequency} onChange={(e) => upd.mutate(e.target.value as 'DAILY' | 'WEEKLY' | 'NONE')} aria-label={`Tần suất ${app.name}`}>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm(`Xóa app “${app.name}”?`) && del.mutate()}>Xóa</button>
      </div>
      <div className="mt-1 flex flex-wrap gap-4 text-xs muted">
        <span>Hoạt động cuối: {fmtDateTime(app.lastActivityAt, tz)}</span>
        <span>Heartbeat: {fmtDateTime(app.lastHeartbeatAt, tz)}</span>
        <span>Sự kiện: {app.eventCount}</span>
        <span className={app.failedCount > 0 ? 'text-rose-600 dark:text-rose-400' : ''}>Lỗi: {app.failedCount}</span>
      </div>
      <table className="tbl mt-2">
        <colgroup><col /><col className="w-24" /><col className="w-36" /><col className="w-36" /><col className="w-24" /></colgroup>
        <thead><tr><th>Key</th><th>Đuôi</th><th>Tạo lúc</th><th>Thu hồi</th><th></th></tr></thead>
        <tbody>
          {(app.keys ?? []).length === 0 && <tr><td colSpan={5} className="muted">Chưa có key.</td></tr>}
          {(app.keys ?? []).map((k) => (
            <tr key={k.id} className={k.revokedAt ? 'opacity-60' : ''}>
              <td>{k.name}</td>
              <td className="font-mono text-xs">••••{k.last4}</td>
              <td className="text-xs">{fmtDateTime(k.createdAt, tz)}</td>
              <td className="text-xs">{k.revokedAt ? fmtDateTime(k.revokedAt, tz) : '—'}</td>
              <td className="text-right">
                {!k.revokedAt && <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm(`Thu hồi key “${k.name}”?`) && revoke.mutate(k.id)}>Thu hồi</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (keyName.trim()) createKey.mutate(); }}>
        <input className="w-60" placeholder="Tên key" maxLength={50} value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label={`Tên key ${app.name}`} />
        <button className="btn-ghost btn-sm" disabled={!keyName.trim() || createKey.isPending}>Tạo key</button>
      </form>
      {created && <KeyCreatedDialog keyValue={created} onClose={() => setCreated(null)} />}
    </li>
  );
}

function AppsSection() {
  const q = useApps();
  const inv = useInvalidate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const add = useMutation({
    mutationFn: () => api.createApp({ name: name.trim(), appId: appId.trim() }),
    onSuccess: () => { setName(''); setAppId(''); toast('Đã đăng ký app'); return inv(['integrations']); },
  });
  return (
    <section className="card">
      <h2 className="card-title">App đã đăng ký</h2>
      <QueryView q={q} unavailable="Chức năng tích hợp chưa sẵn sàng.">
        {(apps) => apps.length === 0 ? <Empty>Chưa có app nào.</Empty> : (
          <ul className="flex flex-col gap-3">{apps.map((a) => <AppCard key={a.id} app={a} />)}</ul>
        )}
      </QueryView>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Field label="Tên app"><input className="w-56" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="app_id" hint="a-z, 0-9, dấu gạch ngang, 3–50 ký tự">
          <input className="w-56" value={appId} pattern="[a-z0-9\-]{3,50}" onChange={(e) => setAppId(e.target.value)} />
        </Field>
        <button className="btn-primary btn-sm mb-5" disabled={!name.trim() || !appId.trim() || add.isPending}>Đăng ký app</button>
      </form>
      <ErrorText error={add.error} />
    </section>
  );
}

// ================= Rules =================
type RuleDraft = { appRef: string; eventType: string; goalId: string; mode: 'PER_UNIT' | 'FIXED'; field: string; factor: string; fixed: string; duration: string; enabled: boolean };
const emptyDraft = (): RuleDraft => ({ appRef: '', eventType: '', goalId: '', mode: 'PER_UNIT', field: 'count', factor: '1', fixed: '10', duration: '15', enabled: true });
const toDraft = (r: RuleDto): RuleDraft => ({
  appRef: r.appRef, eventType: r.eventType, goalId: r.goalId, mode: r.mode, field: r.field ?? 'count',
  factor: String(r.factor ?? 1), fixed: String(r.fixed ?? 0), duration: String(r.defaultDurationMinutes), enabled: r.enabled,
});

function RuleForm({ rule, onDone }: { rule?: RuleDto; onDone: () => void }) {
  const apps = useApps();
  const goals = useGoals();
  const inv = useInvalidate();
  const toast = useToast();
  const [d, setD] = useState<RuleDraft>(rule ? toDraft(rule) : emptyDraft());
  const set = (p: Partial<RuleDraft>) => setD((x) => ({ ...x, ...p }));
  const save = useMutation({
    mutationFn: () => {
      const b: RuleInput = {
        appRef: d.appRef, eventType: d.eventType.trim(), goalId: d.goalId, mode: d.mode,
        field: d.mode === 'PER_UNIT' ? d.field : null, factor: d.mode === 'PER_UNIT' ? Number(d.factor) : null,
        fixed: d.mode === 'FIXED' ? Number(d.fixed) : null, defaultDurationMinutes: Number(d.duration), enabled: d.enabled,
      };
      return rule ? api.updateRule(rule.id, b) : api.createRule(b);
    },
    onSuccess: async () => { toast(rule ? 'Đã lưu quy tắc' : 'Đã thêm quy tắc'); await inv(['integrations']); onDone(); },
  });
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid grid-cols-4 gap-2">
        <Field label="App">
          <select value={d.appRef} onChange={(e) => set({ appRef: e.target.value })} required>
            <option value="">— Chọn —</option>
            {(apps.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Loại sự kiện">
          <input list="event-types" value={d.eventType} onChange={(e) => set({ eventType: e.target.value })} required />
        </Field>
        <Field label="Goal">
          <select value={d.goalId} onChange={(e) => set({ goalId: e.target.value })} required>
            <option value="">— Chọn —</option>
            {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
        <Field label="Cách tính">
          <select value={d.mode} onChange={(e) => set({ mode: e.target.value as RuleDraft['mode'] })}>
            <option value="PER_UNIT">Theo đơn vị</option>
            <option value="FIXED">Cố định</option>
          </select>
        </Field>
        {d.mode === 'PER_UNIT' ? (
          <>
            <Field label="Trường">
              <select value={d.field} onChange={(e) => set({ field: e.target.value })}>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            </Field>
            <Field label="Hệ số"><input type="number" step="any" min={0} value={d.factor} onChange={(e) => set({ factor: e.target.value })} /></Field>
          </>
        ) : (
          <Field label="Đóng góp cố định"><input type="number" min={0} value={d.fixed} onChange={(e) => set({ fixed: e.target.value })} /></Field>
        )}
        <Field label="Thời lượng mặc định (phút)"><input type="number" min={1} max={1440} value={d.duration} onChange={(e) => set({ duration: e.target.value })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Bật</label>
      </div>
      <datalist id="event-types">{EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <ErrorText error={save.error} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>Hủy</button>
        <button className="btn-primary btn-sm" disabled={save.isPending}>Lưu</button>
      </div>
    </form>
  );
}

function RulesSection() {
  const q = useQuery({ queryKey: [...qk.integrations, 'rules'], queryFn: api.listRules });
  const inv = useInvalidate();
  const toast = useToast();
  const [edit, setEdit] = useState<RuleDto | 'new' | null>(null);
  const del = useMutation({
    mutationFn: api.deleteRule,
    onSuccess: () => { toast('Đã xóa quy tắc'); return inv(['integrations']); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <section className="card">
      <div className="mb-2 flex items-center">
        <h2 className="card-title mb-0">Quy tắc quy đổi</h2>
        <button className="btn-primary btn-sm ml-auto" onClick={() => setEdit('new')}>+ Thêm quy tắc</button>
      </div>
      <QueryView q={q} unavailable="Chức năng quy tắc chưa sẵn sàng.">
        {(rules) => rules.length === 0 ? <Empty>Chưa có quy tắc.</Empty> : (
          <table className="tbl">
            <colgroup><col className="w-32" /><col className="w-48" /><col /><col className="w-44" /><col className="w-20" /><col className="w-20" /><col className="w-32" /></colgroup>
            <thead><tr><th>App</th><th>Loại sự kiện</th><th>Goal</th><th>Cách tính</th><th>Phút</th><th>Bật</th><th></th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="truncate">{r.appName}</td>
                  <td className="truncate font-mono text-xs">{r.eventType}</td>
                  <td className="truncate">{r.goalTitle}</td>
                  <td className="text-xs">{r.mode === 'PER_UNIT' ? `${r.field} × ${r.factor}` : `Cố định ${r.fixed}`}</td>
                  <td>{r.defaultDurationMinutes}</td>
                  <td>{r.enabled ? <Badge color="green">Bật</Badge> : <Badge>Tắt</Badge>}</td>
                  <td className="text-right">
                    <button className="btn-ghost btn-sm mr-1" onClick={() => setEdit(r)}>Sửa</button>
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm('Xóa quy tắc này?') && del.mutate(r.id)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
      {edit && (
        <Modal title={edit === 'new' ? 'Thêm quy tắc' : 'Sửa quy tắc'} onClose={() => setEdit(null)} width="max-w-3xl">
          <RuleForm rule={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />
        </Modal>
      )}
    </section>
  );
}

// ================= Events =================
function EventDrawer({ e, onClose }: { e: IntegrationEventDto; onClose: () => void }) {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const retry = useMutation({
    mutationFn: () => api.retryEvent(e.eventId),
    onSuccess: async () => { toast('Đã thử lại sự kiện'); await inv(['integrations', ...XP_CHANGE, 'goals', 'goal', 'streak']); onClose(); },
  });
  const st = EVENT_STATUS[e.status] ?? { label: e.status, color: 'gray' };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside role="dialog" aria-label="Chi tiết sự kiện" className="h-full w-[28rem] max-w-full overflow-y-auto bg-white p-4 shadow-xl dark:bg-slate-900" onMouseDown={(x) => x.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Chi tiết sự kiện</h2>
          <Badge color={st.color}>{st.label}</Badge>
          <button className="btn-ghost btn-sm ml-auto" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="muted">event_id</dt><dd className="break-all font-mono text-xs">{e.eventId}</dd>
          <dt className="muted">App</dt><dd>{e.appName}</dd>
          <dt className="muted">Loại</dt><dd className="font-mono text-xs">{e.eventType}</dd>
          <dt className="muted">Xảy ra lúc</dt><dd>{fmtDateTime(e.occurredAt, tz)}</dd>
          <dt className="muted">Nhận lúc</dt><dd>{fmtDateTime(e.receivedAt, tz)}</dd>
          {e.status === 'PROCESSED' ? (
            <>
              <dt className="muted">Đóng góp</dt><dd>{e.contribution ?? '—'}</dd>
              <dt className="muted">XP</dt><dd>{e.xp ?? '—'}</dd>
              <dt className="muted">Goal</dt><dd className="break-all">{e.goalId ?? '—'}</dd>
            </>
          ) : (
            <><dt className="muted">Lý do</dt><dd>{e.reason ?? '—'}</dd></>
          )}
        </dl>
        <h3 className="mb-1 mt-3 text-sm font-semibold">Payload</h3>
        <pre className="max-h-96 overflow-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">{JSON.stringify(e.payload, null, 2)}</pre>
        {e.status === 'FAILED' && (
          <div className="mt-3 flex justify-end"><button className="btn-primary btn-sm" disabled={retry.isPending} onClick={() => retry.mutate()}>Thử lại</button></div>
        )}
        <div className="mt-2"><ErrorText error={retry.error} /></div>
      </aside>
    </div>
  );
}

function EventsSection() {
  const tz = useTimezone();
  const apps = useApps();
  const [f, setF] = useState<{ appRef: string; status: string; type: string; from: string; to: string; page: number }>({ appRef: '', status: '', type: '', from: '', to: '', page: 1 });
  const [open, setOpen] = useState<IntegrationEventDto | null>(null);
  const filters: IntegrationEventFilters = {
    appRef: f.appRef || undefined, status: f.status || undefined, eventType: f.type || undefined,
    from: startOfDayIso(f.from, tz), to: endOfDayIso(f.to, tz), page: f.page,
  };
  const q = useQuery({ queryKey: [...qk.integrations, 'events', filters], queryFn: () => api.listEvents(filters) });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, page: 1, ...p }));
  return (
    <section className="card">
      <h2 className="card-title">Lịch sử sự kiện</h2>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <Field label="App">
          <select value={f.appRef} onChange={(e) => set({ appRef: e.target.value })}>
            <option value="">Tất cả</option>
            {(apps.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Loại"><input list="event-types-f" className="w-52" value={f.type} onChange={(e) => set({ type: e.target.value })} /></Field>
        <datalist id="event-types-f">{EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        <Field label="Từ ngày"><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="Đến ngày"><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
      </div>
      <QueryView q={q} unavailable="Lịch sử sự kiện chưa sẵn sàng.">
        {(p) => p.items.length === 0 ? <Empty>Chưa có sự kiện.</Empty> : (
          <>
            <table className="tbl">
              <colgroup><col className="w-36" /><col className="w-32" /><col /><col className="w-28" /><col /></colgroup>
              <thead><tr><th>Xảy ra lúc</th><th>App</th><th>Loại</th><th>Trạng thái</th><th>Kết quả</th></tr></thead>
              <tbody>
                {p.items.map((e) => {
                  const st = EVENT_STATUS[e.status] ?? { label: e.status, color: 'gray' };
                  return (
                    <tr key={e.eventId} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setOpen(e)}>
                      <td className="text-xs">{fmtDateTime(e.occurredAt, tz)}</td>
                      <td className="truncate">{e.appName}</td>
                      <td className="truncate font-mono text-xs">{e.eventType}</td>
                      <td><Badge color={st.color}>{st.label}</Badge></td>
                      <td className="truncate text-xs">{e.status === 'PROCESSED' ? `+${e.contribution ?? 0} đóng góp · ${e.xp ?? 0} XP` : e.reason ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPage={(page) => setF((x) => ({ ...x, page }))} />
          </>
        )}
      </QueryView>
      {open && <EventDrawer e={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Tích hợp</h1>
      <p className="text-sm muted">
        Kết nối app ngoài (ví dụ app học tiếng Nhật) để tự động ghi nhận tiến độ Goal. Đăng ký app, tạo key, rồi gửi tài liệu tích hợp cho app ngoài
        (<code>docs/integration/2026-11-07-japanese-app-integration.md</code> trong thư mục dự án) — tài liệu mô tả cách gửi sự kiện tới Hub bằng key.
      </p>
      <AppsSection />
      <RulesSection />
      <EventsSection />
    </div>
  );
}
