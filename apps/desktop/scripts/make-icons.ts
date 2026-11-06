/**
 * Sinh icon app (PNG) không cần thư viện ảnh: ô vuông bo góc gradient tím + dấu tích trắng,
 * khử răng cưa bằng supersampling 4×. Chạy: npx tsx apps/desktop/scripts/make-icons.ts
 * Ra: assets/icon.png (512), assets/tray.png (32), assets/icon.ico (256, PNG nhúng trong ICO).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Khoảng cách từ điểm tới đoạn thẳng (dùng vẽ nét dấu tích). */
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function draw(size: number): Uint8Array {
  const S = 4; // supersampling
  const out = new Uint8Array(size * size * 4);
  const r = 0.22; // bán kính bo góc (tỉ lệ)
  const pad = size <= 32 ? 0 : 0.04;
  const stroke = 0.075;
  // dấu tích (toạ độ chuẩn hoá 0..1)
  const A = [0.28, 0.53], B = [0.44, 0.69], C = [0.73, 0.36];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgA = 0, chk = 0, cr = 0, cg = 0, cb = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
          // rounded rect [pad, 1-pad]
          const qx = Math.max(Math.abs(u - 0.5) - (0.5 - pad - r), 0);
          const qy = Math.max(Math.abs(v - 0.5) - (0.5 - pad - r), 0);
          if (Math.hypot(qx, qy) <= r) {
            bgA++;
            const t = (u + v) / 2; // gradient indigo-600 → violet-600
            cr += 79 + (124 - 79) * t; cg += 70 + (58 - 70) * t; cb += 229 + (237 - 229) * t;
            const d = Math.min(segDist(u, v, A[0]!, A[1]!, B[0]!, B[1]!), segDist(u, v, B[0]!, B[1]!, C[0]!, C[1]!));
            if (d <= stroke / 2) chk++;
          }
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      if (bgA === 0) continue;
      const w = chk / bgA; // phần trắng trong vùng nền
      out[i] = Math.round((cr / bgA) * (1 - w) + 255 * w);
      out[i + 1] = Math.round((cg / bgA) * (1 - w) + 255 * w);
      out[i + 2] = Math.round((cb / bgA) * (1 - w) + 255 * w);
      out[i + 3] = Math.round((bgA / n) * 255);
    }
  }
  return out;
}

/** ICO chứa 1 ảnh PNG 256×256 (định dạng hỗ trợ từ Windows Vista). */
function ico(png256: Buffer): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 0; header[7] = 0; header[8] = 0; header[9] = 0; // 256×256, no palette
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png256.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png256]);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.png'), png(512, draw(512)));
const p256 = png(256, draw(256));
writeFileSync(join(OUT, 'icon.ico'), ico(p256));
writeFileSync(join(OUT, 'tray.png'), png(32, draw(32)));
console.log(`icons → ${OUT}`);
