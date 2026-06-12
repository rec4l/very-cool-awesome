// Always-visible "how to play" panel for the main menu. All 4 controls are
// drawn simultaneously — each row has a small looping animation on the left
// and the key + action label on the right. Mirrors the start/stop rAF pattern
// from MainMenu.ts.

let rafId: number | null = null;

const ROW_H   = 52;   // px per row
const ICON_CX = 48;   // x-center of the animation area
const LABEL_X = 87;   // x where key/action text starts
const ICON_R  = 13;   // player/ball circle radius in animations

// width of the label region — matches the PNG dimensions from captureAbilityLabels
const LABEL_W = 173; // canvas CSS width (260) minus LABEL_X (87)

type Row = {
  key: string;
  action: string;
  color: string;
  file: string; // filename stem for the label PNG, e.g. 'howto-move'
  draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) => void;
};

const ROWS: Row[] = [
  {
    key: 'WASD', action: 'move', color: '#b5d5fb', file: 'howto-move',
    draw(ctx, cx, cy, t) {
      const x = cx + Math.sin(t * Math.PI * 2) * 18;
      ctx.beginPath();
      ctx.arc(x, cy, ICON_R, 0, Math.PI * 2);
      ctx.fillStyle = '#b5d5fb';
      ctx.fill();
    },
  },
  {
    key: 'SHIFT', action: 'speed boost', color: '#fde68a', file: 'howto-boost',
    draw(ctx, cx, cy, t) {
      const x = cx + Math.sin(t * Math.PI * 2) * 18;
      const dir = Math.cos(t * Math.PI * 2) >= 0 ? 1 : -1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(x - dir * i * 6, cy, ICON_R - i * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(253, 230, 138, ${0.22 - i * 0.05})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, cy, ICON_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fde68a';
      ctx.fill();
    },
  },
  {
    key: 'Q', action: 'click to teleport', color: '#ce93d8', file: 'howto-teleport',
    draw(ctx, cx, cy, t) {
      const blinkAt = 0.45, reappearAt = 0.55;
      const ax = cx - 18, bx = cx + 18;
      if (t < blinkAt) {
        ctx.beginPath();
        ctx.arc(ax, cy, ICON_R, 0, Math.PI * 2);
        ctx.fillStyle = '#ce93d8';
        ctx.fill();
      } else if (t >= reappearAt) {
        const ringT = Math.min(1, (t - reappearAt) / 0.25);
        ctx.beginPath();
        ctx.arc(bx, cy, ICON_R, 0, Math.PI * 2);
        ctx.fillStyle = '#ce93d8';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx, cy, ICON_R + ringT * 13, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(206, 147, 216, ${0.5 * (1 - ringT)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    },
  },
  {
    key: 'E', action: 'aim with cursor', color: '#fda4af', file: 'howto-wreck',
    draw(ctx, cx, cy, t) {
      const px = cx - 16;
      ctx.beginPath();
      ctx.arc(px, cy, ICON_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fda4af';
      ctx.fill();

      // out-and-back triangle wave
      const reach = 1 - Math.abs(t * 2 - 1);
      const bx = px + ICON_R + 2 + reach * 28;
      ctx.strokeStyle = 'rgba(253, 164, 175, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + ICON_R, cy);
      ctx.lineTo(bx, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fda4af';
      ctx.fill();
    },
  },
];

const DURATION = 2200; // ms — each row loops independently at this period

// label art — drop a PNG at /assets/ui/<file>.png and it replaces the drawn text
// automatically, same swap-on-load philosophy as EntityRenderer. Falls back to
// drawn text if the file is missing.
const labelImages: (HTMLImageElement | null)[] = ROWS.map((row) => {
  const img = new Image();
  img.src = `/assets/ui/${row.file}.png`;
  img.onerror = () => { /* file not present — drawn fallback stays active */ };
  return img;
});

export function startHowToAnimation(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function tick() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // panel background
    ctx.fillStyle = 'rgba(8, 8, 18, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 8);
    ctx.fill();
    ctx.stroke();

    // header
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2px';
    ctx.fillText('controls', 14, 18);
    ctx.letterSpacing = '0px';

    const now = performance.now();

    for (let i = 0; i < ROWS.length; i++) {
      const row = ROWS[i];
      // each row has its own independent phase — offset by i so they don't all sync
      const t = ((now + i * (DURATION / ROWS.length)) % DURATION) / DURATION;
      const cy = 36 + i * ROW_H + ROW_H / 2;

      row.draw(ctx, ICON_CX, cy, t);

      const img = labelImages[i];
      if (img && img.complete && img.naturalWidth > 0) {
        // custom art — draw the PNG in place of the text
        ctx.drawImage(img, LABEL_X, cy - ROW_H / 2, LABEL_W, ROW_H);
      } else {
        // fallback: drawn text (active until you drop a PNG in)
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = row.color;
        ctx.fillText(row.key, LABEL_X, cy - 9);
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillText(row.action, LABEL_X, cy + 9);
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  if (rafId !== null) cancelAnimationFrame(rafId);
  tick();
}

export function stopHowToAnimation(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
