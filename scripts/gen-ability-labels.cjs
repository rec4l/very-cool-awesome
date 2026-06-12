// Generates 4 placeholder PNGs for the text label area of each how-to row.
// Each PNG is 173×52px — the width of the label column (canvas width minus the
// animation zone) at the current panel dimensions, one row tall.
// Run with: node scripts/gen-ability-labels.cjs
// Output: client/public/assets/ui/howto-{move,boost,teleport,wreck}.png

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'ui');
const W = 173, H = 52;

// 5×7 pixel font — uppercase + space only (both key labels and action text
// are uppercased so we need one glyph set)
const FONT = {
  ' ': ['000','000','000','000','000','000','000'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10000','10000','10111','10001','10001','01110'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10001','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','01010','01010','00100'],
  'W': ['10001','10001','10101','10101','10101','10101','01010'],
};

const ENTRIES = [
  { key: 'WASD',  action: 'MOVE',             color: 0xb5d5fb, file: 'howto-move'     },
  { key: 'SHIFT', action: 'SPEED BOOST',       color: 0xfde68a, file: 'howto-boost'    },
  { key: 'Q',     action: 'CLICK TO TELEPORT', color: 0xce93d8, file: 'howto-teleport' },
  { key: 'E',     action: 'AIM WITH CURSOR',   color: 0xfda4af, file: 'howto-wreck'    },
];

function hexToRgb(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

// returns the rendered pixel width of a string at the given scale
function textWidth(str, scale) {
  let w = 0;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch];
    if (!g) { w += 4 * scale; continue; }
    w += (g[0].length + 1) * scale;
  }
  return Math.max(0, w - scale); // no trailing gap after last char
}

// draws text into a flat RGBA Uint8Array
function drawText(pixels, str, startX, startY, r, g, b, a, scale) {
  let x = startX;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch];
    if (!glyph) { x += 4 * scale; continue; }
    const cols = glyph[0].length;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < cols; col++) {
        if (glyph[row][col] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x + col * scale + dx;
            const py = startY + row * scale + dy;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const i = (py * W + px) * 4;
            pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
          }
        }
      }
    }
    x += (cols + 1) * scale;
  }
}

function buildPNG(entry) {
  const [kr, kg, kb] = hexToRgb(entry.color);
  const pixels = new Uint8Array(W * H * 4); // transparent

  const KEY_SCALE = 2; // key label — 14px tall rendered
  const ACT_SCALE = 1; // action label — 7px tall rendered

  // mirror the canvas: key baseline at cy-9, action baseline at cy+9 (cy=26)
  const keyY = 10; // 26 - 9 - 7 (half of 14px glyph height)
  const actY = 32; // 26 + 9 - 3 (half of 7px glyph height, rounded)

  const keyX = Math.floor((W - textWidth(entry.key,    KEY_SCALE)) / 2);
  const actX = Math.floor((W - textWidth(entry.action, ACT_SCALE)) / 2);

  drawText(pixels, entry.key,    keyX, keyY, kr, kg, kb, 255, KEY_SCALE);
  drawText(pixels, entry.action, actX, actY, 255, 255, 255, 90,  ACT_SCALE);

  // pack into PNG scanlines (filter byte 0 = None, then raw RGBA)
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4;
      const d = y * (stride + 1) + 1 + x * 4;
      raw[d] = pixels[s]; raw[d + 1] = pixels[s + 1];
      raw[d + 2] = pixels[s + 2]; raw[d + 3] = pixels[s + 3];
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return crc ^ 0xffffffff;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const entry of ENTRIES) {
  const png  = buildPNG(entry);
  const file = path.join(OUT_DIR, `${entry.file}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file}  (${W}×${H}px, ${png.length} bytes)`);
}
