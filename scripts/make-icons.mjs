/* Generates the PWA icons index.html links to (icon-180/192/512.png).
   Dependency-free PNG encoder: a soft ring on the app's near-black. Re-run
   with `node scripts/make-icons.mjs` after changing the colours. */
import zlib from 'node:zlib';
import fs from 'node:fs';

const BG = [4, 0, 3], RING = [244, 225, 142];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const c = size / 2, r = size * 0.3, w = size * 0.075;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      /* anti-aliased ring, plus a dot where a gap would be for a "k" feel */
      let a = Math.max(0, Math.min(1, w / 2 - Math.abs(d - r) + 0.5));
      const dot = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      a = Math.max(a, Math.max(0, Math.min(1, size * 0.07 - dot + 0.5)));
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] + (RING[i] - BG[i]) * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [180, 192, 512]) fs.writeFileSync(`icon-${s}.png`, png(s));
console.log('wrote icon-180.png icon-192.png icon-512.png');
