import * as PIXI from 'pixi.js';

export type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  color: number; r: number;
};

export const particles: Particle[] = [];

export function spawnBurst(x: number, y: number, count: number, speed: number, color: number, decay = 0.004) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    particles.push({
      x, y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      life: 1,
      decay: decay + Math.random() * 0.002,
      color,
      r: 1 + Math.random() * 1.5,
    });
  }
}

export function tickParticles(gfx: PIXI.Graphics, dt: number) {
  gfx.clear();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96;     p.vy *= 0.96;
    p.life -= p.decay * dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    gfx.beginFill(p.color, p.life).drawCircle(p.x, p.y, p.r * Math.sqrt(p.life)).endFill();
  }
}
