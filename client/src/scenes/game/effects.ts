import * as PIXI from 'pixi.js';
import type { GameState } from '@shared/types';
import { PLAYER_RADIUS, WRECKING_BALL_RADIUS, TELEPORT_RANGE } from '@shared/constants';
import { getMouseWorldPos } from '../../input/mouse';
import { particles, spawnBurst } from './particles';
import type { PlayerStyles } from './types';

const TELEPORT_COLOR = 0xce93d8;

// ---- teleport FX pool ----

type TeleportFx = { ox: number; oy: number; tx: number; ty: number; color: number; start: number };
export const teleportFx: TeleportFx[] = [];

export function pushTeleportFx(ox: number, oy: number, tx: number, ty: number, color: number, now: number) {
  teleportFx.push({ ox, oy, tx, ty, color, start: now });
}

export function tickTeleportFx(gfx: PIXI.Graphics, now: number) {
  for (let i = teleportFx.length - 1; i >= 0; i--) {
    const fx = teleportFx[i];
    const elapsed = now - fx.start;
    const DURATION = 380;
    if (elapsed > DURATION) { teleportFx.splice(i, 1); continue; }
    const progress = elapsed / DURATION;
    const alpha = 1 - progress;
    const ddx = fx.tx - fx.ox, ddy = fx.ty - fx.oy;
    // departure ring
    gfx.lineStyle(2, fx.color, alpha * 0.9);
    gfx.drawCircle(fx.ox, fx.oy, PLAYER_RADIUS + 28 * progress);
    if (elapsed < 80) gfx.beginFill(fx.color, (1 - elapsed / 80) * 0.3).drawCircle(fx.ox, fx.oy, PLAYER_RADIUS).endFill();
    // arrival ring
    gfx.lineStyle(2, fx.color, alpha * 0.9);
    gfx.drawCircle(fx.tx, fx.ty, PLAYER_RADIUS + 28 * (1 - progress));
    if (elapsed < 100) gfx.beginFill(fx.color, (1 - elapsed / 100) * 0.35).drawCircle(fx.tx, fx.ty, PLAYER_RADIUS).endFill();
    // ghost afterimages along the path
    for (let j = 1; j <= 4; j++) {
      const t = j / 5;
      gfx.lineStyle(1, fx.color, alpha * (1 - t * 0.5) * 0.35);
      gfx.drawCircle(fx.ox + ddx * t, fx.oy + ddy * t, PLAYER_RADIUS * (0.9 - t * 0.25));
    }
    gfx.lineStyle(0);
  }
}

// ---- boost trail ----
// Tracked per slot so all players get a trail.
// Opponent particles start at lower life so they appear dimmer/shorter-lived.

const prevBoostBars:      Record<number, number | null>                    = {};
const prevLocalPositions: Record<number, { x: number; y: number } | null> = {};

export function tickBoostTrail(state: GameState, mySlot: number, playerStyles: PlayerStyles) {
  for (const ps of state.players) {
    const slot = ps.slot;
    if (!(slot in prevBoostBars))      prevBoostBars[slot]      = null;
    if (!(slot in prevLocalPositions)) prevLocalPositions[slot] = null;

    const pu  = ps.powerUps;
    const pos = ps.position;
    const isBoosting = prevBoostBars[slot] !== null && pu.boostBar < prevBoostBars[slot]!;
    if (isBoosting && prevLocalPositions[slot]) {
      const prevPos = prevLocalPositions[slot]!;
      const mdx = pos.x - prevPos.x;
      const mdy = pos.y - prevPos.y;
      const moveDist = Math.hypot(mdx, mdy);
      const baseAngle = moveDist > 0.05 ? Math.atan2(-mdy, -mdx) : Math.random() * Math.PI * 2;
      // both players get 3 particles; opponent starts at slightly lower life so the
      // trail is a touch softer — color difference alone distinguishes whose it is
      const isOpponent = slot !== mySlot;
      const startLife  = isOpponent ? 0.85 : 1;
      for (let i = 0; i < 3; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.6;
        const s = 0.6 + Math.random() * 0.9;
        particles.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
          life: startLife, decay: 0.005 + Math.random() * 0.003,
          color: playerStyles[slot]?.color ?? 0xffffff, r: 1 + Math.random() * 1.5,
        });
      }
    }
    prevBoostBars[slot]      = pu.boostBar;
    prevLocalPositions[slot] = { x: pos.x, y: pos.y };
  }
}

// ---- wrecking ball rendering ----

const prevWbActive: Record<number, boolean> = {};

export function tickWreckingBalls(
  gfx: PIXI.Graphics, state: GameState, playerStyles: PlayerStyles,
  onLaunch: (isOpponent: boolean) => void, onReturn: (isOpponent: boolean) => void,
  mySlot: number,
) {
  gfx.clear();
  for (const ps of state.players) {
    const slot = ps.slot;
    if (!(slot in prevWbActive)) prevWbActive[slot] = false;

    const wb = ps.wreckingBall;
    if (wb.active  && !prevWbActive[slot]) onLaunch(slot !== mySlot);
    if (!wb.active && prevWbActive[slot])  onReturn(slot !== mySlot);
    prevWbActive[slot] = wb.active;
    if (!wb.active) continue;

    const color = playerStyles[slot]?.color ?? 0xffffff;
    gfx.lineStyle(2, color, 0.9);
    gfx.moveTo(ps.position.x, ps.position.y);
    gfx.lineTo(wb.position.x, wb.position.y);
    gfx.beginFill(color).drawCircle(wb.position.x, wb.position.y, WRECKING_BALL_RADIUS).endFill();
  }
}

// ---- teleport range circle + ghost ----

export function tickTeleportCircle(
  gfx: PIXI.Graphics, state: GameState, mySlot: number,
  W: number, H: number, playerStyles: PlayerStyles, isTeleportActive: boolean,
) {
  gfx.clear();
  if (!isTeleportActive) return;
  const myPs = state.players.find((p) => p.slot === mySlot);
  if (!myPs || myPs.powerUps.teleportCharges <= 0) return;

  const localPos = myPs.position;
  gfx.lineStyle(2, TELEPORT_COLOR, 0.6);
  gfx.beginFill(TELEPORT_COLOR, 0.1);
  gfx.drawCircle(localPos.x, localPos.y, TELEPORT_RANGE);
  gfx.endFill();

  const mp = getMouseWorldPos();
  const dx = mp.x - localPos.x, dy = mp.y - localPos.y;
  const dist = Math.hypot(dx, dy);
  const target = dist <= TELEPORT_RANGE
    ? { x: mp.x, y: mp.y }
    : { x: localPos.x + (dx / dist) * TELEPORT_RANGE, y: localPos.y + (dy / dist) * TELEPORT_RANGE };
  const margin = PLAYER_RADIUS + 5;
  target.x = Math.max(margin, Math.min(W - margin, target.x));
  target.y = Math.max(margin, Math.min(H - margin, target.y));

  const ghostColor = playerStyles[mySlot]?.color ?? TELEPORT_COLOR;
  const ldx = target.x - localPos.x, ldy = target.y - localPos.y;
  const lineLen = Math.hypot(ldx, ldy);
  if (lineLen > 0) {
    const nx = ldx / lineLen, ny = ldy / lineLen;
    gfx.lineStyle(1, ghostColor, 0.4);
    for (let d = PLAYER_RADIUS; d < lineLen - PLAYER_RADIUS; d += 13) {
      gfx.moveTo(localPos.x + nx * d, localPos.y + ny * d);
      gfx.lineTo(localPos.x + nx * Math.min(d + 8, lineLen), localPos.y + ny * Math.min(d + 8, lineLen));
    }
  }
  gfx.lineStyle(2, ghostColor, 0.7);
  gfx.beginFill(ghostColor, 0.25);
  gfx.drawCircle(target.x, target.y, PLAYER_RADIUS);
  gfx.endFill();
}

// ---- reset ----

export function resetEffects() {
  teleportFx.length = 0;
  for (const k of Object.keys(prevWbActive))       delete prevWbActive[+k];
  for (const k of Object.keys(prevBoostBars))      delete prevBoostBars[+k];
  for (const k of Object.keys(prevLocalPositions)) delete prevLocalPositions[+k];
}
