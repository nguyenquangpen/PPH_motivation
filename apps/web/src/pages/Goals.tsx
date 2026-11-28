import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GoalStatus, type GoalDto } from '@pph/shared';
import { api } from '../api/endpoints';
import { GOAL_CHANGE, qk, useCategories, useInvalidate } from '../api/queries';
import { errorMessage } from '../api/client';
import { GoalForm } from '../components/GoalForm';
import { GoalCard } from '../components/GoalCard';
import { Empty, Modal, QueryView, useToast } from '../components/ui';

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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Trạng thái">
          {([['', 'Tất cả'], ['ACTIVE', 'Đang làm'], ['COMPLETED', 'Hoàn thành'], ['PAUSED', 'Tạm dừng']] as [GoalStatus | '', string][]).map(([v, label]) => (
            <button
              key={v} role="tab" aria-selected={status === v}
              onClick={() => setStatus(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${status === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'muted hover:text-slate-800 dark:hover:text-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select aria-label="Danh mục" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Mọi danh mục</option>
          {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="ml-auto w-56" aria-label="Tìm kiếm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm Goal…" />
      </div>

      <QueryView q={q} unavailable="Chưa có Goal.">
        {() =>
          filtered.length === 0 ? <Empty>Không có Goal phù hợp.</Empty> : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((g) => (
                <li key={g.id} className="min-w-0">
                  <GoalCard
                    g={g}
                    actions={
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => setEditing(g)}>Sửa</button>
                        <button
                          className="btn-ghost btn-sm text-rose-600"
                          onClick={() => window.confirm(`Xóa Goal “${g.title}”? Task liên kết và lịch sử đóng góp được giữ nguyên.`) && del.mutate(g.id)}
                        >
                          Xóa
                        </button>
                      </>
                    }
                  />
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
