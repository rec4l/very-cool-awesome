// run once: node scripts/gen-sprites.js
const { deflateSync } = require('zlib');
const { writeFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const l = Buffer.alloc(4);
  const c = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
}

function circlePng(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA

  const cx = size / 2, cy = size / 2, rad = size / 2 - 1.5;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter: none
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
      // 1px anti-aliased edge
      const a = dist <= rad ? 255 : dist <= rad + 1 ? Math.round((rad + 1 - dist) * 255) : 0;
      row.push(r, g, b, a);
    }
    rows.push(Buffer.from(row));
  }

  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const out = resolve(__dirname, '../client/assets/sprites');
mkdirSync(out, { recursive: true });

writeFileSync(`${out}/player1.png`, circlePng(32, 0x4f, 0xc3, 0xf7)); // cyan
writeFileSync(`${out}/player2.png`, circlePng(32, 0xff, 0x70, 0x43)); // orange
writeFileSync(`${out}/ball.png`,    circlePng(32, 0xe0, 0xe0, 0xe0)); // light gray

console.log('sprites written to client/assets/sprites/');
