import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { UnlockType, XpSourceType, XpTxType, type CreateRewardItemInput, type RewardItemDto } from '@pph/shared';
import { api, type XpTxFilters } from '../api/endpoints';
import { qk, useGoals, useInvalidate, useTimezone, XP_CHANGE } from '../api/queries';
import { errorMessage } from '../api/client';
import { Badge, Empty, ErrorText, Field, Modal, Pagination, ProgressBar, QueryView, useToast } from '../components/ui';
import { endOfDayIso, fmtDateTime, fmtNum, fmtXp, startOfDayIso, XP_SOURCE_LABEL, XP_TYPE_LABEL } from '../lib/format';

const UNLOCK_LABEL: Record<UnlockType, string> = {
  LEVEL: 'Đạt Level ≥ N', MILESTONE_COMPLETED: 'Hoàn thành Milestone', GOAL_COMPLETED: 'Hoàn thành Goal',
};

function Summary() {
  const q = useQuery({ queryKey: [...qk.xp, 'summary'], queryFn: api.xpSummary });
  return (
    <section className="card">
      <h2 className="card-title">Tổng quan XP</h2>
      <QueryView q={q} unavailable="Chưa có dữ liệu XP.">
        {(s) => {
          const inLevel = ((Math.max(s.lifetimeXp, 0) % s.xpPerLevel) / s.xpPerLevel) * 100;
          return (
            <div className="grid grid-cols-6 gap-4">
              <div><div className="text-xs muted">Level</div><div className="text-2xl font-bold">{s.level}</div></div>
              <div><div className="text-xs muted">Lifetime XP</div><div className="text-2xl font-bold tabular-nums">{fmtNum(s.lifetimeXp)}</div></div>
              <div><div className="text-xs muted">Spendable XP</div><div className={`text-2xl font-bold tabular-nums ${s.spendableXp < 0 ? 'text-rose-600' : ''}`}>{fmtNum(s.spendableXp)}</div></div>
              <div><div className="text-xs muted">XP hôm nay</div><div className="text-2xl font-bold tabular-nums">{fmtNum(s.xpToday)}</div></div>
              <div className="col-span-2">
                <div className="text-xs muted">Tiến độ lên Level {s.level + 1}</div>
                <ProgressBar percent={inLevel} size="sm" />
                <div className="mt-2 text-xs muted">Pool {s.pool}/{s.poolTarget}</div>
                <ProgressBar percent={s.poolTarget > 0 ? (Math.max(s.pool, 0) / s.poolTarget) * 100 : 0} size="sm" />
              </div>
            </div>
          );
        }}
      </QueryView>
    </section>
  );
}

function ItemForm({ item, onDone }: { item?: RewardItemDto; onDone: () => void }) {
  const inv = useInvalidate();
  const toast = useToast();
  const goals = useGoals();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? String(item.priceXp) : '');
  const [icon, setIcon] = useState(item?.icon ?? '');
  const [unlockType, setUnlockType] = useState<UnlockType | ''>(item?.unlockType ?? '');
  const [unlockValue, setUnlockValue] = useState(item?.unlockValue ?? '');
  const [msGoal, setMsGoal] = useState('');
  const milestones = useQuery({
    queryKey: [...qk.milestones, msGoal], queryFn: () => api.listMilestones(msGoal), enabled: !!msGoal,
  });

  const m = useMutation({
    mutationFn: () => {
      const body: CreateRewardItemInput = {
        name: name.trim(), description: description.trim() ? description : null, priceXp: Number(price),
        icon: icon.trim() || null, unlockType: unlockType || null, unlockValue: unlockType ? unlockValue || null : null,
      };
      return item ? api.updateItem(item.id, body) : api.createItem(body);
    },
    onSuccess: () => { toast(item ? 'Đã lưu vật phẩm' : 'Đã thêm vật phẩm'); onDone(); return inv(['shop', 'activity']); },
  });
  const p = Number(price);
  const invalid = !name.trim() || !Number.isInteger(p) || p < 1 || p > 1_000_000 || (!!unlockType && !unlockValue);
  const submit = (e: FormEvent) => { e.preventDefault(); if (!invalid) m.mutate(); };

  return (
    <form onSubmit={submit} className="grid grid-cols-12 gap-3">
      <Field label="Tên" className="col-span-8"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Biểu tượng" className="col-span-4"><input value={icon} maxLength={50} onChange={(e) => setIcon(e.target.value)} placeholder="🎁" /></Field>
      <Field label="Giá (XP)" className="col-span-4"><input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <Field label="Điều kiện mở khóa" className="col-span-8">
        <select value={unlockType} onChange={(e) => { setUnlockType(e.target.value as UnlockType | ''); setUnlockValue(''); }}>
          <option value="">Không có</option>
          {UnlockType.map((u) => <option key={u} value={u}>{UNLOCK_LABEL[u]}</option>)}
        </select>
      </Field>
      {unlockType === 'LEVEL' && (
        <Field label="Level tối thiểu" className="col-span-4"><input type="number" min={1} value={unlockValue} onChange={(e) => setUnlockValue(e.target.value)} /></Field>
      )}
      {unlockType === 'GOAL_COMPLETED' && (
        <Field label="Goal" className="col-span-8">
          <select value={unlockValue} onChange={(e) => setUnlockValue(e.target.value)}>
            <option value="">— Chọn Goal —</option>
            {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
      )}
      {unlockType === 'MILESTONE_COMPLETED' && (
        <>
          <Field label="Goal của Milestone" className="col-span-6">
            <select value={msGoal} onChange={(e) => setMsGoal(e.target.value)}>
              <option value="">— Chọn Goal —</option>
              {(goals.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </Field>
          <Field label="Milestone" className="col-span-6">
            <select value={unlockValue} onChange={(e) => setUnlockValue(e.target.value)}>
              <option value="">{unlockValue && !msGoal ? 'Milestone hiện tại' : '— Chọn Milestone —'}</option>
              {(milestones.data ?? []).map((ms) => <option key={ms.id} value={ms.id}>{ms.title}</option>)}
            </select>
          </Field>
        </>
      )}
      <Field label="Mô tả" className="col-span-12"><textarea rows={2} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="col-span-12"><ErrorText error={m.error} /></div>
      <div className="col-span-12 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>Hủy</button>
        <button type="submit" className="btn-primary" disabled={invalid || m.isPending}>{item ? 'Lưu' : 'Thêm'}</button>
      </div>
    </form>
  );
}

function Shop() {
  const inv = useInvalidate();
  const toast = useToast();
  const [editing, setEditing] = useState<RewardItemDto | 'new' | null>(null);
  const q = useQuery({ queryKey: [...qk.shop, 'items'], queryFn: api.listItems });
  const redeem = useMutation({
    mutationFn: (id: string) => api.redeem(id),
    onSuccess: (r) => { toast(`Đã đổi “${r?.itemName ?? 'vật phẩm'}”`); return inv(XP_CHANGE); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: () => { toast('Đã xóa vật phẩm'); return inv(['shop', 'activity']); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="card-title mb-0">Cửa hàng phần thưởng</h2>
        <button className="btn-ghost btn-sm" onClick={() => setEditing('new')}>+ Thêm vật phẩm</button>
      </div>
      <QueryView q={q} unavailable="Cửa hàng chưa sẵn sàng.">
        {(items) =>
          items.length === 0 ? <Empty>Chưa có vật phẩm.</Empty> : (
            <ul className="grid grid-cols-3 gap-3">
              {items.map((it) => (
                <li key={it.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{it.icon ? `${it.icon} ` : ''}{it.name}</div>
                      <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{fmtNum(it.priceXp)} XP</div>
                    </div>
                    {it.state === 'AVAILABLE' && <Badge color="green">Có thể đổi</Badge>}
                    {it.state === 'INSUFFICIENT_XP' && <Badge color="amber">Còn thiếu {fmtNum(it.missingXp)} XP</Badge>}
                    {it.state === 'LOCKED' && <Badge color="red" title={it.lockReason ?? ''}>Bị khóa</Badge>}
                  </div>
                  {it.state === 'LOCKED' && it.lockReason && <p className="text-xs text-rose-600 dark:text-rose-400">{it.lockReason}</p>}
                  {it.description && <p className="text-xs muted">{it.description}</p>}
                  <div className="mt-auto flex gap-2">
                    <button
                      className="btn-primary btn-sm" disabled={it.state !== 'AVAILABLE' || redeem.isPending}
                      onClick={() => window.confirm(`Đổi “${it.name}” với ${it.priceXp} XP?`) && redeem.mutate(it.id)}
                    >
                      Đổi
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(it)}>Sửa</button>
                    <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm(`Xóa “${it.name}”?`) && del.mutate(it.id)}>Xóa</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
      {editing && (
        <Modal title={editing === 'new' ? 'Thêm vật phẩm' : 'Sửa vật phẩm'} onClose={() => setEditing(null)}>
          <ItemForm item={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

function Redemptions() {
  const tz = useTimezone();
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: [...qk.shop, 'redemptions'], queryFn: api.listRedemptions });
  const undo = useMutation({
    mutationFn: (id: string) => api.undoRedemption(id),
    onSuccess: () => { toast('Đã hoàn tác đổi quà'); return inv(XP_CHANGE); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <section className="card">
      <h2 className="card-title">Lịch sử đổi quà</h2>
      <QueryView q={q} unavailable="Chưa có lịch sử đổi quà.">
        {(rs) =>
          rs.length === 0 ? <Empty>Chưa đổi vật phẩm nào.</Empty> : (
            <table className="tbl">
              <colgroup><col className="w-40" /><col /><col className="w-28" /><col className="w-48" /></colgroup>
              <thead><tr><th>Thời gian</th><th>Vật phẩm</th><th>Giá</th><th></th></tr></thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs">{fmtDateTime(r.createdAt, tz)}</td>
                    <td className="truncate">{r.itemName}</td>
                    <td className="tabular-nums">{fmtNum(r.priceXp)} XP</td>
                    <td className="text-right">
                      {r.reversed ? (
                        <span className="text-xs muted">Đã hoàn tác {fmtDateTime(r.reversedAt, tz)}</span>
                      ) : (
                        <button className="btn-ghost btn-sm" disabled={undo.isPending} onClick={() => window.confirm('Hoàn tác lần đổi này?') && undo.mutate(r.id)}>Hoàn tác</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryView>
    </section>
  );
}

function Transactions() {
  const tz = useTimezone();
  const [type, setType] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const filters: XpTxFilters = {
    type: type || undefined, sourceType: sourceType || undefined,
    from: startOfDayIso(from, tz), to: endOfDayIso(to, tz), page,
  };
  const q = useQuery({
    queryKey: [...qk.xp, 'transactions', filters], queryFn: () => api.xpTransactions(filters), placeholderData: keepPreviousData,
  });
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1); };

  return (
    <section className="card" id="transactions">
      <h2 className="card-title">Lịch sử giao dịch XP</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Loại">
          <select value={type} onChange={(e) => reset(setType)(e.target.value)}>
            <option value="">Tất cả</option>
            {XpTxType.map((t) => <option key={t} value={t}>{XP_TYPE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Nguồn">
          <select value={sourceType} onChange={(e) => reset(setSourceType)(e.target.value)}>
            <option value="">Tất cả</option>
            {XpSourceType.map((t) => <option key={t} value={t}>{XP_SOURCE_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Từ ngày"><input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></Field>
        <Field label="Đến ngày"><input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></Field>
      </div>
      <QueryView q={q} unavailable="Chưa có giao dịch.">
        {(p) =>
          p.items.length === 0 ? <Empty>Không có giao dịch.</Empty> : (
            <>
              <table className="tbl">
                <colgroup><col className="w-40" /><col className="w-40" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col /></colgroup>
                <thead><tr><th>Thời gian</th><th>Loại</th><th>Lifetime</th><th>Spendable</th><th>Nguồn</th><th>Ghi chú</th></tr></thead>
                <tbody>
                  {p.items.map((tx) => (
                    <tr key={tx.id}>
                      <td className="text-xs">{fmtDateTime(tx.createdAt, tz)}</td>
                      <td>{XP_TYPE_LABEL[tx.type] ?? tx.type}</td>
                      <td className={`tabular-nums ${tx.lifetimeDelta < 0 ? 'text-rose-600' : tx.lifetimeDelta > 0 ? 'text-emerald-600' : 'muted'}`}>{fmtXp(tx.lifetimeDelta)}</td>
                      <td className={`tabular-nums ${tx.spendableDelta < 0 ? 'text-rose-600' : tx.spendableDelta > 0 ? 'text-emerald-600' : 'muted'}`}>{fmtXp(tx.spendableDelta)}</td>
                      <td className="text-xs">
                        {tx.sourceType === 'TASK' && tx.sourceId ? <Link className="link" to={`/tasks/${tx.sourceId}`}>Task</Link>
                          : tx.sourceType === 'GOAL' && tx.sourceId ? <Link className="link" to={`/goals/${tx.sourceId}`}>Goal</Link>
                          : XP_SOURCE_LABEL[tx.sourceType] ?? tx.sourceType}
                      </td>
                      <td className="truncate text-xs" title={tx.reason ?? ''}>{tx.reason ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPage={setPage} />
            </>
          )
        }
      </QueryView>
    </section>
  );
}

function Reconciliation() {
  const q = useQuery({ queryKey: [...qk.xp, 'reconciliation'], queryFn: api.reconciliation, enabled: false, retry: false });
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="card-title mb-0">Đối soát số dư</h2>
        <button className="btn-ghost" disabled={q.isFetching} onClick={() => q.refetch()}>{q.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra đối soát'}</button>
      </div>
      {q.isError && <div className="mt-2"><ErrorText error={q.error} /></div>}
      {q.data && (
        <div className="mt-3">
          <p className={`mb-2 font-semibold ${q.data.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
            {q.data.ok ? '✓ Số dư khớp' : '✗ Phát hiện chênh lệch'}
          </p>
          <table className="tbl">
            <thead><tr><th>Kiểm tra</th><th>Lưu trữ</th><th>Tính lại</th><th>Chênh lệch</th></tr></thead>
            <tbody>
              {q.data.checks.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td><td className="tabular-nums">{fmtNum(c.stored)}</td>
                  <td className="tabular-nums">{fmtNum(c.recomputed)}</td>
                  <td className={`tabular-nums ${c.diff !== 0 ? 'font-semibold text-rose-600' : ''}`}>{fmtNum(c.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RewardsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Phần thưởng</h1>
      <Summary />
      <Shop />
      <Redemptions />
      <Transactions />
      <Reconciliation />
    </div>
  );
}
