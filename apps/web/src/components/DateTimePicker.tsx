import { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';

const FMT = "yyyy-MM-dd'T'HH:mm";
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad = (n: number) => String(n).padStart(2, '0');

function Spinner({ value, label, onUp, onDown, onType }: {
  value: number; label: string; onUp: () => void; onDown: () => void; onType: (n: number) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <button type="button" className="btn-ghost btn-sm !px-3" aria-label={`Tăng ${label}`} onClick={onUp}>▲</button>
      <input
        aria-label={label} inputMode="numeric" value={pad(value)}
        className="!w-14 !border-0 !bg-transparent text-center text-3xl font-semibold tabular-nums !shadow-none"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, '').slice(-2), 10); if (!Number.isNaN(n)) onType(n); }}
      />
      <button type="button" className="btn-ghost btn-sm !px-3" aria-label={`Giảm ${label}`} onClick={onDown}>▼</button>
    </div>
  );
}

/**
 * Date + time picker (calendar grid on the right, 24h time spinner on the left).
 * `value` / `onChange` use the same `yyyy-MM-ddTHH:mm` string as <input type="datetime-local">.
 */
export function DateTimePicker({ value, onChange, label, placeholder = 'Chọn ngày giờ' }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? DateTime.fromFormat(value, FMT) : null;
  const [draft, setDraft] = useState<DateTime>(() => (parsed?.isValid ? parsed : DateTime.now().set({ second: 0, millisecond: 0 })));
  const [month, setMonth] = useState(draft.startOf('month'));
  const box = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    const base = parsed?.isValid ? parsed : DateTime.now().plus({ hours: 1 }).set({ minute: 0, second: 0, millisecond: 0 });
    setDraft(base); setMonth(base.startOf('month')); setOpen(true);
  };
  const commit = () => { onChange(draft.toFormat(FMT)); setOpen(false); };

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key, true); };
  }, [open]);

  const first = month.startOf('month');
  const gridStart = first.minus({ days: first.weekday - 1 });
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const today = DateTime.now();
  const setHour = (h: number) => setDraft((d) => d.set({ hour: ((h % 24) + 24) % 24 }));
  const setMinute = (m: number) => setDraft((d) => d.set({ minute: ((m % 60) + 60) % 60 }));

  return (
    <div className="relative inline-block" ref={box}>
      <button
        type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        className="flex min-w-48 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={parsed?.isValid ? '' : 'muted'}>{parsed?.isValid ? parsed.toFormat('dd/MM/yyyy  HH:mm') : placeholder}</span>
        <span aria-hidden>📅</span>
      </button>
      {open && (
        <div role="dialog" aria-label={`Chọn ${label}`}
          className="absolute left-0 top-full z-50 mt-1 flex w-[26rem] max-w-[90vw] gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col items-center justify-between border-r border-slate-200 pr-4 dark:border-slate-700">
            <div className="text-xs muted">{draft.toFormat('dd/MM/yyyy')}</div>
            <div className="flex items-center">
              <Spinner label="Giờ" value={draft.hour} onUp={() => setHour(draft.hour + 1)} onDown={() => setHour(draft.hour - 1)} onType={(n) => setHour(Math.min(n, 23))} />
              <span className="pb-1 text-3xl font-semibold">:</span>
              <Spinner label="Phút" value={draft.minute} onUp={() => setMinute(draft.minute + 5)} onDown={() => setMinute(draft.minute - 5)} onType={(n) => setMinute(Math.min(n, 59))} />
            </div>
            <button type="button" className="btn-primary w-full" onClick={commit}>Chọn</button>
          </div>
          <div className="flex-1">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" className="btn-ghost btn-sm" aria-label="Tháng trước" onClick={() => setMonth(month.minus({ months: 1 }))}>‹</button>
              <span className="text-sm font-semibold">Tháng {month.month} / {month.year}</span>
              <button type="button" className="btn-ghost btn-sm" aria-label="Tháng sau" onClick={() => setMonth(month.plus({ months: 1 }))}>›</button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
              {WEEKDAYS.map((w) => <div key={w} className="font-semibold text-indigo-600">{w}</div>)}
              {days.map((d) => {
                const sel = d.hasSame(draft, 'day');
                const other = d.month !== month.month;
                return (
                  <button
                    key={d.toISODate()} type="button" aria-label={d.toFormat('dd/MM/yyyy')} aria-pressed={sel}
                    onClick={() => { setDraft(draft.set({ year: d.year, month: d.month, day: d.day })); if (other) setMonth(d.startOf('month')); }}
                    className={`mx-auto h-8 w-8 rounded-full text-sm tabular-nums ${sel ? 'bg-indigo-600 font-semibold text-white' : d.hasSame(today, 'day') ? 'ring-1 ring-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${other && !sel ? 'text-slate-400' : ''}`}
                  >{d.day}</button>
                );
              })}
            </div>
            <button type="button" className="link mt-2 text-xs" onClick={() => { const n = DateTime.now(); setDraft(draft.set({ year: n.year, month: n.month, day: n.day })); setMonth(n.startOf('month')); }}>Hôm nay</button>
          </div>
        </div>
      )}
    </div>
  );
}
