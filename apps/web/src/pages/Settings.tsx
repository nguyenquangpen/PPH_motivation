import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SETTINGS_GROUPS, type CategoryDto, type ReasonTagDto, type Settings } from '@pph/shared';
import { api } from '../api/endpoints';
import { qk, useCategories, useInvalidate, useReasons, useSettings, useTimezone } from '../api/queries';
import { errorMessage } from '../api/client';
import { Badge, Empty, ErrorText, QueryView, useToast } from '../components/ui';
import { todayIn } from '../lib/format';

const GROUP_LABEL: Record<string, string> = {
  xp: 'XP', pool: 'Pool', reward: 'Thưởng', level: 'Level', penalty: 'Phạt', streak: 'Chuỗi ngày',
  goalWarning: 'Cảnh báo Goal', preset: 'Preset đóng góp', general: 'Chung',
};

const KEY_LABEL: Record<keyof Settings, string> = {
  multiplier: 'Hệ số nhân (Multiplier)', refDuration: 'Thời lượng tham chiếu (phút)', minFactor: 'Hệ số tối thiểu',
  maxFactor: 'Hệ số tối đa', smallThreshold: 'Ngưỡng Task nhỏ (0 = tắt Pool)', poolTarget: 'Mục tiêu Pool',
  poolRewardXp: 'XP thưởng Pool', defaultMilestoneXp: 'XP mặc định Milestone', defaultGoalXp: 'XP mặc định hoàn thành Goal',
  xpPerLevel: 'XP mỗi Level', penaltyEnabled: 'Bật phạt', penaltyPercent: 'Phần trăm phạt (%)',
  gracePeriodHours: 'Thời gian ân hạn (giờ)', freezesPerMonth: 'Số Freeze mỗi tháng', behindMargin: 'Biên chậm tiến độ (%)',
  nearDueDays: 'Số ngày gần hạn', presetMajor: 'Major', presetMedium: 'Medium', presetMinor: 'Minor',
  timezone: 'Múi giờ (IANA)',
};

function SettingsGroup({ group, keys, settings }: { group: string; keys: (keyof Settings)[]; settings: Settings }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(keys.map((k) => [k, typeof settings[k] === 'boolean' ? settings[k] : String(settings[k])])));
  }, [settings, keys]);

  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {};
      for (const k of keys) {
        const v = draft[k];
        patch[k] = typeof settings[k] === 'boolean' ? v : typeof settings[k] === 'number' ? Number(v) : v;
      }
      return api.updateSettings(patch as Partial<Settings>);
    },
    onSuccess: () => { toast(`Đã lưu nhóm ${GROUP_LABEL[group] ?? group}`); return inv(['settings', 'dashboard', 'tasks', 'task', 'goals', 'goal', 'xp', 'activity']); },
  });
  const reset = useMutation({
    mutationFn: () => api.resetSettingsGroup(group),
    onSuccess: () => { toast('Đã khôi phục mặc định'); return inv(['settings', 'dashboard', 'tasks', 'task', 'goals', 'goal', 'xp', 'activity']); },
  });

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{GROUP_LABEL[group] ?? group}</h3>
        <button
          className="btn-ghost btn-sm" disabled={reset.isPending}
          onClick={() => window.confirm(`Khôi phục mặc định nhóm ${GROUP_LABEL[group] ?? group}?`) && reset.mutate()}
        >
          Khôi phục mặc định
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {keys.map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-sm">{KEY_LABEL[k] ?? k}</span>
            {typeof settings[k] === 'boolean' ? (
              <input type="checkbox" checked={!!draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))} />
            ) : (
              <input
                type={typeof settings[k] === 'number' ? 'number' : 'text'} step="any"
                value={String(draft[k] ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-2"><ErrorText error={save.error ?? reset.error} /></div>
      <div className="mt-2 flex justify-end">
        <button className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>Lưu</button>
      </div>
    </div>
  );
}

function SettingsSection() {
  const q = useQuery({ queryKey: qk.settings, queryFn: api.getSettings });
  return (
    <section className="card">
      <h2 className="card-title">Tham số</h2>
      <QueryView q={q} unavailable="Cài đặt chưa sẵn sàng.">
        {(s) => (
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(SETTINGS_GROUPS).map(([g, keys]) => <SettingsGroup key={g} group={g} keys={keys} settings={s} />)}
          </div>
        )}
      </QueryView>
    </section>
  );
}

function ReasonRow({ r }: { r: ReasonTagDto }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [name, setName] = useState(r.name);
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const upd = useMutation({
    mutationFn: (b: { name?: string; exempt?: boolean }) => api.updateReason(r.id, b),
    onSuccess: () => { toast('Đã lưu lý do'); return inv(['reasons']); }, onError,
  });
  const del = useMutation({
    mutationFn: () => api.deleteReason(r.id),
    onSuccess: () => { toast('Đã xóa lý do'); return inv(['reasons']); }, onError,
  });
  return (
    <li className="flex items-center gap-2 py-1.5">
      <input className="min-w-0 flex-1" value={name} maxLength={50} disabled={r.isSystem} onChange={(e) => setName(e.target.value)} />
      <label className="flex shrink-0 items-center gap-1 text-xs">
        <input type="checkbox" checked={r.exempt} disabled={r.isSystem || upd.isPending} onChange={(e) => upd.mutate({ exempt: e.target.checked })} />
        Miễn phạt
      </label>
      {r.isSystem && <Badge color="blue">Hệ thống</Badge>}
      {!r.isSystem && (
        <>
          <button className="btn-ghost btn-sm" disabled={name.trim() === r.name || !name.trim()} onClick={() => upd.mutate({ name: name.trim() })}>Lưu</button>
          <button className="btn-ghost btn-sm text-rose-600" onClick={() => window.confirm(`Xóa lý do “${r.name}”?`) && del.mutate()}>Xóa</button>
        </>
      )}
    </li>
  );
}

function ReasonsSection() {
  const q = useReasons();
  const inv = useInvalidate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [exempt, setExempt] = useState(false);
  const add = useMutation({
    mutationFn: () => api.createReason({ name: name.trim(), exempt }),
    onSuccess: () => { setName(''); setExempt(false); toast('Đã thêm lý do'); return inv(['reasons']); },
  });
  return (
    <section className="card">
      <h2 className="card-title">Lý do bỏ lỡ (Missed reason)</h2>
      <QueryView q={q} unavailable="Danh sách lý do chưa sẵn sàng.">
        {(rs) => rs.length === 0 ? <Empty>Chưa có lý do.</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{rs.map((r) => <ReasonRow key={`${r.id}:${r.name}`} r={r} />)}</ul>
        )}
      </QueryView>
      <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input className="min-w-0 flex-1" placeholder="Lý do mới" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} aria-label="Tên lý do mới" />
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} />Miễn phạt</label>
        <button className="btn-primary btn-sm" disabled={!name.trim() || add.isPending}>Thêm</button>
      </form>
      <div className="mt-2"><ErrorText error={add.error} /></div>
    </section>
  );
}

function CategoryRow({ c }: { c: CategoryDto }) {
  const inv = useInvalidate();
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [color, setColor] = useState(c.color ?? '');
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  const upd = useMutation({
    mutationFn: () => api.updateCategory(c.id, { name: name.trim(), color: color.trim() || null }),
    onSuccess: () => { toast('Đã lưu danh mục'); return inv(['categories', 'goals', 'goal']); }, onError,
  });
  const del = useMutation({
    mutationFn: () => api.deleteCategory(c.id),
    onSuccess: () => { toast('Đã xóa danh mục'); return inv(['categories']); }, onError,
  });
  const dirty = name.trim() !== c.name || (color.trim() || null) !== c.color;
  return (
    <li className="flex items-center gap-2 py-1.5">
      <input className="min-w-0 flex-1" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} aria-label="Tên danh mục" />
      <input className="w-24" value={color} maxLength={30} placeholder="Màu" onChange={(e) => setColor(e.target.value)} aria-label="Màu danh mục" />
      <span className="w-16 shrink-0 text-xs muted">{c.goalCount} Goal</span>
      <button className="btn-ghost btn-sm" disabled={!dirty || !name.trim() || upd.isPending} onClick={() => upd.mutate()}>Lưu</button>
      <button
        className="btn-ghost btn-sm text-rose-600" disabled={c.goalCount > 0}
        title={c.goalCount > 0 ? `Đang được ${c.goalCount} Goal sử dụng` : ''}
        onClick={() => window.confirm(`Xóa danh mục “${c.name}”?`) && del.mutate()}
      >
        Xóa
      </button>
    </li>
  );
}

function CategoriesSection() {
  const q = useCategories();
  const inv = useInvalidate();
  const toast = useToast();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.createCategory({ name: name.trim() }),
    onSuccess: () => { setName(''); toast('Đã thêm danh mục'); return inv(['categories']); },
  });
  return (
    <section className="card" id="categories">
      <h2 className="card-title">Danh mục Goal</h2>
      <QueryView q={q} unavailable="Danh mục chưa sẵn sàng.">
        {(cs) => cs.length === 0 ? <Empty>Chưa có danh mục.</Empty> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{cs.map((c) => <CategoryRow key={`${c.id}:${c.name}:${c.color}`} c={c} />)}</ul>
        )}
      </QueryView>
      <form className="mt-3 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <input className="min-w-0 flex-1" placeholder="Danh mục mới" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} aria-label="Tên danh mục mới" />
        <button className="btn-primary btn-sm" disabled={!name.trim() || add.isPending}>Thêm</button>
      </form>
      <div className="mt-2"><ErrorText error={add.error} /></div>
    </section>
  );
}

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

function CheckinSection() {
  const tz = useTimezone();
  const today = todayIn(tz);
  const inv = useInvalidate();
  const toast = useToast();
  const q = useQuery({ queryKey: [...qk.checkins, today], queryFn: () => api.listCheckins(today, today) });
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    const c = q.data?.find((x) => x.date === today) ?? q.data?.[0];
    if (c) { setMood(c.mood); setNote(c.note ?? ''); }
  }, [q.data, today]);
  const save = useMutation({
    mutationFn: () => api.saveCheckinToday({ mood, note: note.trim() ? note : null }),
    onSuccess: () => { toast('Đã lưu check-in'); return inv(['checkins', 'activity']); },
  });
  return (
    <section className="card">
      <h2 className="card-title">Check-in hôm nay</h2>
      <div className="mb-2 flex items-center gap-2" role="radiogroup" aria-label="Tâm trạng">
        {MOODS.map((m, i) => (
          <button
            key={i} type="button" role="radio" aria-checked={mood === i + 1} aria-label={`Tâm trạng ${i + 1}`}
            className={`rounded-md border px-2 py-1 text-xl ${mood === i + 1 ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-transparent'}`}
            onClick={() => setMood(mood === i + 1 ? null : i + 1)}
          >
            {m}
          </button>
        ))}
      </div>
      <textarea className="w-full" rows={3} maxLength={2000} placeholder="Ghi chú…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú check-in" />
      <ErrorText error={save.error} />
      <div className="mt-2 flex justify-end">
        <button className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>Lưu check-in</button>
      </div>
    </section>
  );
}

export function SettingsPage() {
  useSettings();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Cài đặt</h1>
      <SettingsSection />
      <div className="grid grid-cols-2 gap-4">
        <ReasonsSection />
        <CategoriesSection />
      </div>
      <CheckinSection />
    </div>
  );
}
