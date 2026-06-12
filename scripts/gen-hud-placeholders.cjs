// Generates transparent placeholder PNGs for the in-game HUD:
//   hud-boost-icon.png      20×20  — ability icon slot for boost
//   hud-teleport-icon.png   20×20  — ability icon slot for teleport
//   hud-pip-0.png           16×16  — teleport pip: empty (ring only)
//   hud-pip-1.png           16×16  — teleport pip: ~25% charged
//   hud-pip-2.png           16×16  — teleport pip: ~50% charged
//   hud-pip-3.png           16×16  — teleport pip: ~75% charged
//   hud-pip-4.png           16×16  — teleport pip: fully charged
//
// The icons are blank-with-border guides so you can see the canvas
// size in Aseprite before drawing your art. The pips are functional
// white-circle placeholders so the HUD looks reasonable before custom art.
//
// Drop your finished art at the same paths — the game auto-swaps via
// PIXI.Assets.load (same pipeline as player sprites, buttons, etc.).
//
// Run with:  node scripts/gen-hud-placeholders.cjs

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'ui');

// ---------------------------------------------------------------------------
// Raw PNG encoder (no dependencies) — same approach as gen-countdown-placeholders.cjs
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

function makePNG(w, h, pixels) {
  // pixels: Uint8Array of RGBA, w*h*4 bytes
  const stride = w * 4;
  const raw    = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // no-filter
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const len      = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf  = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf   = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const sig  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Icon placeholder — 20×20, single-pixel white border on transparent bg.
// The user opens this in Aseprite and draws their icon art over it; the 1px
// border is a canvas-bounds guide that they'll paint over.
// ---------------------------------------------------------------------------

function makeIconPlaceholder(size) {
  // fully transparent — no border guide (Aseprite shows canvas bounds via checkerboard)
  return new Uint8Array(size * size * 4);
}

// ---------------------------------------------------------------------------
// Pip placeholder — 16×16 white circle, filled according to stage:
//   0 = ring only (empty)   1 = bottom ~25%   2 = bottom ~50%
//   3 = bottom ~75%         4 = fully filled
//
// "Fill from bottom" is a natural "charge building up" metaphor. All pixels
// are white so the code can tint them to the local player's color at runtime.
// ---------------------------------------------------------------------------

function makePip(size, stage) {
  const pixels = new Uint8Array(size * size * 4);
  const cx     = (size - 1) / 2;
  const cy     = (size - 1) / 2;
  const r      = size / 2 - 1.5; // slightly inset so the circle doesn't clip the edge

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx   = x - cx;
      const dy   = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i    = (y * size + x) * 4;

      let alpha = 0;

      if (stage === 0) {
        // empty: faint ring outline so the HUD slot is still visible
        if (dist >= r - 1 && dist <= r + 0.5) alpha = 100;
      } else if (stage === 4) {
        // fully charged: solid fill
        if (dist <= r) alpha = 220;
      } else {
        // stages 1–3: fill the bottom N/4 of the circle, ring on the empty part
        // threshold = cy + r*(1 - stage/2) gives equal vertical spans per stage:
        //   stage 1 → cy + r*0.5  (bottom ~25%)
        //   stage 2 → cy          (bottom ~50%)
        //   stage 3 → cy - r*0.5  (bottom ~75%)
        const threshold = cy + r * (1 - stage / 2);
        if (dist <= r && y >= threshold) {
          alpha = 220; // filled region
        } else if (dist >= r - 1 && dist <= r + 0.5) {
          alpha = 80;  // faint ring on the unfilled region
        }
      }

      if (alpha > 0) {
        pixels[i]     = 255; // white R
        pixels[i + 1] = 255; // white G
        pixels[i + 2] = 255; // white B
        pixels[i + 3] = alpha;
      }
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ability icons
for (const name of ['hud-boost-icon', 'hud-teleport-icon']) {
  const pixels  = makeIconPlaceholder(20);
  const png     = makePNG(20, 20, pixels);
  const outPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath}  (${png.length} bytes)`);
}

// teleport pip stages 0–4
for (let stage = 0; stage <= 4; stage++) {
  const pixels  = makePip(16, stage);
  const png     = makePNG(16, 16, pixels);
  const outPath = path.join(OUT_DIR, `hud-pip-${stage}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${outPath}  (${png.length} bytes)`);
}

console.log('\nDone!  Open these in Aseprite and draw over them — the game auto-swaps them in.');
