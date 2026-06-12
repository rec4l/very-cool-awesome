import { COLORS, FACES } from '../ui/settings';
import { MENU_GRAVITY, MENU_BALL_FRICTION, MENU_CURSOR_REPEL_STRENGTH, MENU_CURSOR_REPEL_RADIUS, MENU_CURSOR_REPEL_MAX, MENU_SHOCKWAVE_STRENGTH, MENU_SHOCKWAVE_RADIUS } from '@shared/constants';

let rafId: number | null = null;

// preload once — shared across menu visits
const faceImages: Record<string, HTMLImageElement> = {};
for (const face of FACES) {
  const img = new Image();
  img.src = `/assets/sprites/faces/${face}.png`;
  faceImages[face] = img;
}

export function startMenuAnimation(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const cursor = { x: -1, y: -1 };
  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
  });

  const rng = (min: number, max: number) => Math.random() * (max - min) + min;
  const sign = () => (Math.random() < 0.5 ? 1 : -1);
  const balls = Array.from({ length: 25 }, () => {
    const r = rng(60, 67.5);
    return {
      x: rng(r, window.innerWidth - r),
      y: rng(r, window.innerHeight - r),
      vx: sign() * rng(0.8, 2.2),
      vy: sign() * rng(0.8, 2.2),
      r,
      color: COLORS[Math.floor(Math.random() * COLORS.length)].hex,
      face: FACES[Math.floor(Math.random() * FACES.length)],
    };
  });

  // click shockwave — one-time radial impulse, strongest at the click point.
  // #screen-home covers the whole viewport above the canvas, so listen there
  // and only fire when the click lands on the background (not a button/panel).
  document.getElementById('screen-home')?.addEventListener('click', (e) => {
    if (e.target !== e.currentTarget) return;
    for (const b of balls) {
      const dx = b.x - e.clientX, dy = b.y - e.clientY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < MENU_SHOCKWAVE_RADIUS) {
        const force = MENU_SHOCKWAVE_STRENGTH * (1 - dist / MENU_SHOCKWAVE_RADIUS);
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }
    }
  });

  // elastic collisions between balls, mass proportional to area
  function resolveCollisions() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;

          const ma = a.r * a.r, mb = b.r * b.r;
          const relVel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (relVel < 0) {
            const impulse = (2 * relVel) / (ma + mb);
            a.vx += impulse * mb * nx;
            a.vy += impulse * mb * ny;
            b.vx -= impulse * ma * nx;
            b.vy -= impulse * ma * ny;
          }
        }
      }
    }
  }

  function tick() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const b of balls) {
      b.vy += MENU_GRAVITY;

      if (cursor.x >= 0) {
        const dx = b.x - cursor.x, dy = b.y - cursor.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < MENU_CURSOR_REPEL_RADIUS) {
          const falloff = (1 - dist / MENU_CURSOR_REPEL_RADIUS) ** 2;
          const push = Math.min(MENU_CURSOR_REPEL_STRENGTH / dist, MENU_CURSOR_REPEL_MAX) * falloff;
          b.vx += (dx / dist) * push;
          b.vy += (dy / dist) * push;
        }
      }

      b.vx *= 1 - MENU_BALL_FRICTION;
      b.vy *= 1 - MENU_BALL_FRICTION;

      b.x += b.vx;
      b.y += b.vy;
      if (b.x - b.r < 0)  { b.x = b.r;     b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W)  { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 0)  { b.y = b.r;     b.vy = Math.abs(b.vy); }
      if (b.y + b.r > H)  { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
    }

    resolveCollisions();

    for (const b of balls) {
      ctx.save();
      ctx.globalAlpha = 0.1;

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();

      const faceImg = faceImages[b.face];
      if (faceImg.complete) {
        ctx.globalAlpha = 1;
        ctx.drawImage(faceImg, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }

      ctx.restore();
    }

    // rings — clip out neighboring balls' ring areas so overlapping balls
    // read as one merged outline instead of tangled crossing lines
    for (const b of balls) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      for (const other of balls) {
        if (other === b) continue;
        const ringR = other.r + 3;
        ctx.moveTo(other.x + ringR, other.y);
        ctx.arc(other.x, other.y, ringR, 0, Math.PI * 2);
      }
      ctx.clip('evenodd');

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.1;
      ctx.stroke();
      ctx.restore();
    }

    rafId = requestAnimationFrame(tick);
  }

  if (rafId !== null) cancelAnimationFrame(rafId);
  tick();
}

export function stopMenuAnimation(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}
