// One-off generator for countdown placeholder art — produces simple blocky
// digit/letter glyphs as PNGs so there's something to draw over in Aseprite,
// matching the "colored shapes as placeholders" philosophy of the existing
// player/ball sprites. Run with: node scripts/gen-countdown-placeholders.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'ui');

// ---------------------------------------------------------------------------
// Glyph definitions — each row must have equal length.
// Letters are 5 px wide × 7 px tall; single 0-column gap between letters.
//   '3' / '2' / '1' — single digit, 5 cols × 7 rows
//   'go'             — G+O, 11 cols × 7 rows
//   'goal'           — G+O+A+L, 23 cols × 7 rows
// ---------------------------------------------------------------------------
const GLYPHS = {
  '3': [
    '11111',
    '00001',
    '00001',
    '01111',
    '00001',
    '00001',
    '11111',
  ],
  '2': [
    '11111',
    '00001',
    '00001',
    '11111',
    '10000',
    '10000',
    '11111',
  ],
  '1': [
    '00100',
    '01100',
    '00100',
    '00100',
    '00100',
    '00100',
    '01110',
  ],
  'go': [ // G + gap + O
    '01111001110',
    '10000010001',
    '10000010001',
    '10011010001',
    '10001010001',
    '10001010001',
    '01111001110',
  ],
  'goal': [ // G + gap + O + gap + A + gap + L  (23 cols × 7 rows)
    '01111001110000100010000',
    '10000010001001010010000',
    '10000010001010001010000',
    '10011010001011111010000',
    '10001010001010001010000',
    '10001010001010001010001',
    '01111001110010001001111',
  ],
};

// Colors for each placeholder (user draws over these)
const COLORS = { '3': 0xfecaca, '2': 0xfed7aa, '1': 0xa7f3d0, 'go': 0xb5d5fb, 'goal': 0xfde68a };

// Per-key canvas dimensions and glyph scale — defaults apply to all except 'goal'
// which needs a wider canvas to fit 4 letters at a readable size.
const CANVAS = {
  default: { w: 96,  h: 130, scale: 10 },
  goal:    { w: 300, h: 195, scale: 12 },
};

// ---------------------------------------------------------------------------
// PNG encoder — identical pattern to other gen scripts
// ---------------------------------------------------------------------------

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return crc ^ 0xffffffff;
}

function buildPNG(key) {
  const grid  = GLYPHS[key];
  const cfg   = CANVAS[key] || CANVAS.default;
  const { w: W, h: H, scale: SCALE } = cfg;

  const rows   = grid.length;
  const cols   = grid[0].length;
  const glyphW = cols * SCALE;
  const glyphH = rows * SCALE;
  const offX   = Math.floor((W - glyphW) / 2);
  const offY   = Math.floor((H - glyphH) / 2);
  const [r, g, b, a] = (() => {
    const c = COLORS[key];
    return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, 255];
  })();

  const stride = W * 4;
  const raw    = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // no-filter
    for (let x = 0; x < W; x++) {
      const px = rowStart + 1 + x * 4;
      const gx = x - offX, gy = y - offY;
      const on = gx >= 0 && gx < glyphW && gy >= 0 && gy < glyphH
        && grid[Math.floor(gy / SCALE)][Math.floor(gx / SCALE)] === '1';
      if (on) {
        raw[px] = r; raw[px + 1] = g; raw[px + 2] = b; raw[px + 3] = a;
      } else {
        raw[px] = 0; raw[px + 1] = 0; raw[px + 2] = 0; raw[px + 3] = 0;
      }
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len      = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf  = Buffer.from(type, 'ascii');
    const crcBuf   = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const key of Object.keys(GLYPHS)) {
  const outPath = path.join(OUT_DIR, `countdown-${key}.png`);
  if (fs.existsSync(outPath)) {
    console.log(`skipped ${outPath}  (already drawn — delete to regenerate placeholder)`);
    continue;
  }
  const png = buildPNG(key);
  const cfg = CANVAS[key] || CANVAS.default;
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath}  (${cfg.w}×${cfg.h}, ${png.length} bytes)`);
}
