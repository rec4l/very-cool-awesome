let rafId: number | null = null;

export function startMenuAnimation(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const rng = (min: number, max: number) => Math.random() * (max - min) + min;
  const sign = () => (Math.random() < 0.5 ? 1 : -1);
  const balls = Array.from({ length: 10 }, () => {
    const r = rng(8, 72);
    return {
      x: rng(r, window.innerWidth - r),
      y: rng(r, window.innerHeight - r),
      vx: sign() * rng(0.8, 2.2),
      vy: sign() * rng(0.8, 2.2),
      r,
    };
  });

  function tick() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const b of balls) {
      b.x += b.vx;
      b.y += b.vy;
      if (b.x - b.r < 0)  { b.x = b.r;     b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W)  { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < 0)  { b.y = b.r;     b.vy = Math.abs(b.vy); }
      if (b.y + b.r > H)  { b.y = H - b.r; b.vy = -Math.abs(b.vy); }

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
