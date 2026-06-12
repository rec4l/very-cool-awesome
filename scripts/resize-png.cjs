// Scales an existing PNG by a given multiplier (nearest-neighbour — correct for pixel art).
// Usage:  node scripts/resize-png.cjs <file> <scale>
//   node scripts/resize-png.cjs client/public/assets/ui/countdown-goal.png 1.5
// Overwrites the file in-place.

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- args ----
const [,, filePath, scaleArg] = process.argv;
if (!filePath || !scaleArg) {
  console.error('Usage: node scripts/resize-png.cjs <file> <scale>');
  process.exit(1);
}
const scale = parseFloat(scaleArg);
if (isNaN(scale) || scale <= 0) {
  console.error('scale must be a positive number, e.g. 1.5');
  process.exit(1);
}

// ---- PNG decode ----

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buf) {
  // skip 8-byte signature
  let off = 8;

  function readU32() { const v = buf.readUInt32BE(off); off += 4; return v; }
  function readBytes(n) { const s = buf.slice(off, off + n); off += n; return s; }

  let width, height, bitDepth, colorType;
  const idatChunks = [];

  while (off < buf.length) {
    const len  = readU32();
    const type = readBytes(4).toString('ascii');
    const data = readBytes(len);
    off += 4; // skip CRC

    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      bitDepth  = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        console.error(`Unsupported PNG format (bit depth ${bitDepth}, color type ${colorType}). Need 8-bit RGBA.`);
        process.exit(1);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const raw      = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp      = 4; // RGBA
  const pixels   = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (width * bpp + 1)];
    const rowOff     = y * (width * bpp + 1) + 1;
    const prevOff    = (y - 1) * (width * bpp + 1) + 1;

    for (let x = 0; x < width; x++) {
      for (let c = 0; c < bpp; c++) {
        const i    = rowOff + x * bpp + c;
        const raw_ = raw[i];
        const left = x > 0 ? pixels[(y * width + x - 1) * bpp + c] : 0;
        const up   = y > 0 ? pixels[((y - 1) * width + x) * bpp + c] : 0;
        const ul   = (x > 0 && y > 0) ? pixels[((y - 1) * width + x - 1) * bpp + c] : 0;

        let val;
        switch (filterType) {
          case 0: val = raw_;                           break; // None
          case 1: val = raw_ + left;                   break; // Sub
          case 2: val = raw_ + up;                     break; // Up
          case 3: val = raw_ + Math.floor((left + up) / 2); break; // Average
          case 4: val = raw_ + paeth(left, up, ul);    break; // Paeth
          default: val = raw_;
        }
        pixels[(y * width + x) * bpp + c] = val & 0xff;
      }
    }
  }

  return { width, height, pixels };
}

// ---- nearest-neighbour scale ----

function scalePNG({ width, height, pixels }, factor) {
  const nw = Math.round(width  * factor);
  const nh = Math.round(height * factor);
  const out = new Uint8Array(nw * nh * 4);

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const si = (sy * width + sx) * 4;
      const di = (y  * nw   + x)  * 4;
      out[di]     = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }

  return { width: nw, height: nh, pixels: out };
}

// ---- PNG encode ----

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return crc ^ 0xffffffff;
}

function encodePNG({ width: w, height: h, pixels }) {
  const stride = w * 4;
  const raw    = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // no-filter
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
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---- main ----

const absPath = path.resolve(filePath);
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(1);
}

const input   = decodePNG(fs.readFileSync(absPath));
const scaled  = scalePNG(input, scale);
const outBuf  = encodePNG(scaled);

fs.writeFileSync(absPath, outBuf);
console.log(`resized ${absPath}`);
console.log(`  ${input.width}×${input.height}  →  ${scaled.width}×${scaled.height}  (×${scale})`);
