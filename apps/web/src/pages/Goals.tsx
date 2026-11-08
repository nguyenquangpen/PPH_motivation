import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GoalStatus, type GoalDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { GOAL_CHANGE, qk, useCategories, useInvalidate } from '../api/queries';
import { errorMessage } from '../api/client';
import { GoalForm } from '../components/GoalForm';
import { Badge, Empty, Modal, ProgressBar, QueryView, useToast } from '../components/ui';
import { daysRemainingLabel, fmtDate, fmtNum, GOAL_STATUS_LABEL, WARNING_LABEL } from '../lib/format';

export function GoalsPage() {
  const [status, setStatus] = useState<GoalStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GoalDto | 'new' | null>(null);
  const cats = useCategories();
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: [...qk.goals, { status }], queryFn: () => api.listGoals(status || undefined) });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: () => { toast('Đã xóa Goal'); return inv(GOAL_CHANGE); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((g) => (!categoryId || g.categoryId === categoryId) && (!s || g.title.toLowerCase().includes(s)));
  }, [q.data, categoryId, search]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mục tiêu</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>+ Tạo Goal</button>
      </div>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Trạng thái</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus | '')}>
            <option value="">Tất cả</option>
            {GoalStatus.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Danh mục</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tất cả</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Tìm kiếm</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên Goal…" />
        </label>
      </div>

      <QueryView q={q} unavailable="Chưa có Goal.">
        {() =>
          filtered.length === 0 ? <Empty>Không có Goal phù hợp.</Empty> : (
            <ul className="flex flex-col gap-3">
              {filtered.map((g) => (
                <li key={g.id} className="card">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link to={`/goals/${g.id}`} className="text-base font-semibold hover:underline">{g.icon ? `${g.icon} ` : ''}{g.title}</Link>
                    <Badge>{GOAL_STATUS_LABEL[g.status]}</Badge>
                    <Badge color="blue">{g.categoryName}</Badge>
                    {g.progress.warnings.map((w) => <Badge key={w} color="amber">{WARNING_LABEL[w] ?? w}</Badge>)}
                    <div className="ml-auto flex gap-2">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(g)}>Sửa</button>
                      <button
                        className="btn-ghost btn-sm text-rose-600"
                        onClick={() => window.confirm(`Xóa Goal “${g.title}”? Task liên kết và lịch sử đóng góp được giữ nguyên.`) && del.mutate(g.id)}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                  <ProgressBar percent={g.progress.displayPercent} overflow={g.progress.overflowContribution} warn={g.progress.warnings.length > 0} size="lg" />
                  <div className="mt-1 flex flex-wrap gap-4 text-xs muted">
                    <span>{fmtNum(g.progress.completedContribution)}/{fmtNum(g.targetContribution)}</span>
                    <span>Ngày đích: {fmtDate(g.targetDate)}</span>
                    <span>{daysRemainingLabel(g.progress.daysRemaining)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>

      {editing && (
        <Modal title={editing === 'new' ? 'Tạo Goal' : 'Sửa Goal'} onClose={() => setEditing(null)} width="max-w-2xl">
          <GoalForm goal={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
