/**
 * Màu Event Google theo Goal (chủ đề). Google chỉ có 11 màu cố định (colorId 1..11):
 * màu Goal (hex hoặc tên) → màu Google gần nhất; Goal chưa đặt màu → màu cố định theo id Goal; task không có Goal → xám.
 */
const PALETTE: Record<string, [number, number, number]> = {
  '1': [0xa4, 0xbd, 0xfc], '2': [0x7a, 0xe7, 0xbf], '3': [0xdb, 0xad, 0xff], '4': [0xff, 0x88, 0x7c],
  '5': [0xfb, 0xd7, 0x5b], '6': [0xff, 0xb8, 0x78], '7': [0x46, 0xd6, 0xdb], '8': [0xe1, 0xe1, 0xe1],
  '9': [0x54, 0x84, 0xed], '10': [0x51, 0xb7, 0x49], '11': [0xdc, 0x21, 0x27],
};
const NAMES: Record<string, string> = {
  red: '#dc2127', orange: '#ff8a3d', yellow: '#fbd75b', green: '#51b749', teal: '#46d6db', cyan: '#46d6db',
  blue: '#5484ed', purple: '#a45bd6', violet: '#a45bd6', pink: '#ff887c', gray: '#e1e1e1', grey: '#e1e1e1',
};
/** Thứ tự ưu tiên màu dễ phân biệt nhất, dùng khi Goal chưa đặt màu. */
const AUTO = ['11', '9', '10', '6', '3', '5', '7', '4'];

function parseRgb(c: string): [number, number, number] | null {
  const hex = (NAMES[c.trim().toLowerCase()] ?? c.trim()).match(/^#?([0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

export function googleColorId(goalColor: string | null, goalId: string | null): string | undefined {
  if (!goalId) return '8';
  const rgb = goalColor ? parseRgb(goalColor) : null;
  if (rgb) {
    let best = '8', bestD = Infinity;
    for (const [id, p] of Object.entries(PALETTE)) {
      const d = (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }
  let h = 0;
  for (const ch of goalId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO[h % AUTO.length];
}
