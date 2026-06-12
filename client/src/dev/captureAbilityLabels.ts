// Dev-only capture utility — Ctrl+Shift+S on the menu downloads 4 PNGs,
// one per ability row, rendered with the exact same canvas 2D font calls
// as HowToPlay.ts so the output is pixel-perfect to what's on screen.
// Once you have your art, delete this file and its import in main.ts.

const LABEL_W = 173;
const LABEL_H = 52;
const PAD_X   = 4;  // small left margin, same visual feel as the live canvas

const ROWS = [
  { key: 'WASD',  action: 'move',              color: '#b5d5fb', file: 'howto-move'     },
  { key: 'SHIFT', action: 'speed boost',       color: '#fde68a', file: 'howto-boost'    },
  { key: 'Q',     action: 'click to teleport', color: '#ce93d8', file: 'howto-teleport' },
  { key: 'E',     action: 'aim with cursor',   color: '#fda4af', file: 'howto-wreck'    },
];

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function captureAbilityLabels() {
  const cy = LABEL_H / 2;

  for (const row of ROWS) {
    const canvas  = document.createElement('canvas');
    canvas.width  = LABEL_W;
    canvas.height = LABEL_H;
    const ctx = canvas.getContext('2d')!;

    ctx.textBaseline = 'middle';

    ctx.font      = 'bold 14px monospace';
    ctx.fillStyle = row.color;
    ctx.fillText(row.key, PAD_X, cy - 9);

    ctx.font      = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillText(row.action, PAD_X, cy + 9);

    downloadCanvas(canvas, `${row.file}.png`);
  }

  console.log('[dev] downloaded 4 ability label PNGs');
}
