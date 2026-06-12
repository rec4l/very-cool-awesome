// Generates placeholder PNGs for the arena backgrounds — one per map.
// Each placeholder bakes in:
//   • the arena fill color (base)
//   • center line + circle reference marks (subtle, same color the game uses)
//   • small gold circles at each speed-boost pickup position
//
// Open in Aseprite and draw over the whole thing — the game loads the PNG,
// replaces the solid fill AND hides the procedural markings so your art is
// the only background layer. Walls and entities still render on top.
//
// Run with:  node scripts/gen-arena-bg.cjs

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'ui');

// ---- map definitions (mirror of shared/maps/*.ts — keep in sync if maps change) ----
const MAPS = [
  {
    id: 'classic', w: 1200, h: 600,
    bg: 0x1a1a2e,
    markingColor: 0x1e2852,          // a touch lighter than bg — visible as a guide, subtle in game
    pickupPositions: [{ x: 180, y: 150 }, { x: 1020, y: 450 }],
  },
  {
    id: 'large',   w: 1600, h: 800,
    bg: 0x1a1a2e,
    markingColor: 0x1e2852,
    pickupPositions: [],              // add if large map gains pickups
  },
  {
    id: 'xl',      w: 2000, h: 1000,
    bg: 0x1a1a2e,
    markingColor: 0x1e2852,
    pickupPositions: [],
  },
];

// ---- PNG encoder (identical to other gen scripts) ----

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return crc ^ 0xffffffff;
}

function encodePNG(w, h, pixels) {
  const stride = w * 4;
  const raw    = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (stride + 1) + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len    = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb     = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
    return Buffer.concat([len, tb, data, crcBuf]);
  }

  const sig  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---- pixel helpers ----

function setPixel(pixels, w, h, x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const i = (y * w + x) * 4;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
}

// draw a 2-pixel-wide circle outline
function drawCircleOutline(pixels, w, h, cx, cy, r, cr, cg, cb) {
  for (let y = Math.max(0, Math.floor(cy - r - 2)); y <= Math.min(h - 1, Math.ceil(cy + r + 2)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 2)); x <= Math.min(w - 1, Math.ceil(cx + r + 2)); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist >= r - 1 && dist <= r + 1) setPixel(pixels, w, h, x, y, cr, cg, cb);
    }
  }
}

// draw a filled circle (for pickup markers)
function drawFilledCircle(pixels, w, h, cx, cy, r, cr, cg, cb) {
  for (let y = Math.max(0, Math.floor(cy - r - 1)); y <= Math.min(h - 1, Math.ceil(cy + r + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(w - 1, Math.ceil(cx + r + 1)); x++) {
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r) setPixel(pixels, w, h, x, y, cr, cg, cb);
    }
  }
}

// draw a vertical dashed line (2px wide), matching the game's center-line style
function drawDashedVLine(pixels, w, h, x, dashLen, gapLen, cr, cg, cb) {
  for (let y = 0; y < h; y++) {
    if ((y % (dashLen + gapLen)) < dashLen) {
      setPixel(pixels, w, h, x - 1, y, cr, cg, cb);
      setPixel(pixels, w, h, x,     y, cr, cg, cb);
    }
  }
}

// ---- build one map's PNG ----

function buildMapPNG({ id, w, h, bg, markingColor, pickupPositions }) {
  const pixels = new Uint8Array(w * h * 4);

  // fill background
  const br = (bg >> 16) & 0xff, bgC = (bg >> 8) & 0xff, bb = bg & 0xff;
  for (let i = 0; i < w * h; i++) {
    pixels[i * 4]     = br;
    pixels[i * 4 + 1] = bgC;
    pixels[i * 4 + 2] = bb;
    pixels[i * 4 + 3] = 255;
  }

  const mr = (markingColor >> 16) & 0xff;
  const mg = (markingColor >>  8) & 0xff;
  const mb =  markingColor        & 0xff;

  // center dashed vertical line (dash=12, gap=8 — matches Game.ts)
  drawDashedVLine(pixels, w, h, w / 2, 12, 8, mr, mg, mb);

  // center circle (radius 80 — matches Game.ts)
  drawCircleOutline(pixels, w, h, w / 2, h / 2, 80, mr, mg, mb);

  // speed-boost pickup markers — gold dots so you can see their exact positions
  // (PICKUP_COLOR = 0xffd700 in game). Radius 8 so they're clearly visible but small.
  for (const { x, y } of pickupPositions) {
    drawFilledCircle(pixels, w, h, x, y, 8, 0xff, 0xd7, 0x00);
  }

  return encodePNG(w, h, pixels);
}

// ---- output ----

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const map of MAPS) {
  const png     = buildMapPNG(map);
  const outPath = path.join(OUT_DIR, `arena-bg-${map.id}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath}  (${map.w}×${map.h}, ${png.length} bytes)`);
}

console.log('\nDone!');
console.log('• Center line + circle are baked in as reference guides — draw over them in any style.');
console.log('• Gold dots = speed-boost pickup positions. Draw around them or incorporate them into your design.');
console.log('• When the game loads your PNG it hides the procedural markings layer, so your art is the only background.');
