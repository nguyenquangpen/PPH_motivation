// Manual task order (drag to reorder). Client-side only, per device.
const ORDER_KEY = 'pph.taskOrder';

export function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as string[]; } catch { return []; }
}
export function saveOrder(ids: string[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids.slice(0, 2000))); } catch { /* ignore */ }
}

/** Move `dragId` right before `targetId` among `visibleIds`; ids outside the view keep their relative order after. */
export function reorderIds(order: string[], visibleIds: string[], dragId: string, targetId: string): string[] {
  const base = visibleIds.filter((x) => x !== dragId);
  base.splice(Math.max(0, base.indexOf(targetId)), 0, dragId);
  return [...base, ...order.filter((x) => !base.includes(x))];
}

/** Comparator: manual order first (ordered ids before unordered), then by deadline. */
export function byManualOrder(order: string[]) {
  const idx = new Map(order.map((id, i) => [id, i]));
  return (a: { id: string; deadline: string | null }, b: { id: string; deadline: string | null }) => {
    const oa = idx.get(a.id); const ob = idx.get(b.id);
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
  };
}
