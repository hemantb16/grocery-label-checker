// Writes icons/icon.svg and PNG icons from the same list of rectangles (no image tools needed).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const S = 512;
const PAPER = [0xf4, 0xf1, 0xea];
const INK = [0x1d, 0x1c, 0x1a];
const RED = [0xc0, 0x3a, 0x26];
// Barcode bars (x, width) inside the maskable safe zone, plus a scan line.
const bars = [[150, 10], [168, 6], [182, 16], [206, 6], [220, 10], [238, 20], [266, 6], [280, 12], [300, 6], [314, 16], [338, 8], [354, 8]];
const rects = [...bars.map(([x, w]) => [x, 168, w, 176, INK]), [126, 253, 260, 7, RED]];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="#f4f1ea"/>${
  rects.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(${c.join(',')})"/>`).join('')}</svg>\n`;
writeFileSync('icons/icon.svg', svg);

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size) {
  const k = size / S;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // sample the pixel centre in 512-space; last matching rect wins
      const sx = (x + 0.5) / k, sy = (y + 0.5) / k;
      let col = PAPER;
      for (const [rx, ry, rw, rh, c] of rects) if (sx >= rx && sx < rx + rw && sy >= ry && sy < ry + rh) col = c;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [180, 192, 512]) writeFileSync(`icons/icon-${size}.png`, png(size));
console.log('icons written');
