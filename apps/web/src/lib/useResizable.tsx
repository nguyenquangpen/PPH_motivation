import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const read = (key: string, fallback: number) => {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch { return fallback; }
};
const write = (key: string, n: number) => { try { localStorage.setItem(key, String(Math.round(n))); } catch { /* ignore */ } };

/**
 * Drag-to-resize width, remembered in localStorage.
 * dir = +1: the panel grows when the handle moves right (left-anchored panel, e.g. sidebar);
 * dir = -1: grows when moving left (right-anchored panel, e.g. detail drawer).
 */
export function useResizable({ storageKey, initial, min, max, dir }: {
  storageKey: string; initial: number; min: number; max: number; dir: 1 | -1;
}) {
  const clamp = useCallback((n: number) => Math.min(Math.max(n, min), Math.min(max, Math.round(window.innerWidth * 0.9))), [min, max]);
  const [width, setWidth] = useState(() => clamp(read(storageKey, initial)));
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const commit = (n: number) => { const c = clamp(n); setWidth(c); write(storageKey, c); };

  const handleProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-valuenow': width, 'aria-valuemin': min, 'aria-valuemax': max,
    tabIndex: 0,
    title: 'Kéo để đổi độ rộng (nhấp đúp để đặt lại)',
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, w: width };
      setDragging(true);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (drag.current) setWidth(clamp(drag.current.w + dir * (e.clientX - drag.current.x)));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      const w = clamp(drag.current.w + dir * (e.clientX - drag.current.x));
      drag.current = null; setDragging(false); commit(w);
    },
    onDoubleClick: () => commit(initial),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 80 : 20;
      if (e.key === 'ArrowLeft') { e.preventDefault(); commit(width - dir * step); }
      if (e.key === 'ArrowRight') { e.preventDefault(); commit(width + dir * step); }
    },
  };
  return { width, dragging, handleProps };
}

/** Thin grab bar placed on one edge of a `relative` panel. */
export function ResizeHandle({ side, dragging, from = 'sm', ...props }: { side: 'left' | 'right'; dragging: boolean; from?: 'sm' | 'md' } & ReturnType<typeof useResizable>['handleProps']) {
  return (
    <div
      {...props}
      className={`absolute top-0 z-10 hidden h-full w-1.5 cursor-col-resize touch-none select-none outline-none transition-colors hover:bg-indigo-400/60 focus-visible:bg-indigo-400/60 ${from === 'md' ? 'md:block' : 'sm:block'} ${side === 'right' ? '-right-0.5' : '-left-0.5'} ${dragging ? 'bg-indigo-500/70' : ''}`}
    />
  );
}
