import { playHit, playTeleport, playCollision, playPickup, playBoostStart } from '../../audio/sounds';
import { spawnBurst } from './particles';
import { pushTeleportFx } from './effects';
import type { Snapshot, PlayerStyles } from './types';

// ---- tracking state (owned here, reset via resetSnapshot) ----
let prevBallVX = 0, prevBallVY = 0;

// keyed by slot number — grows as players are seen
const prevPlayerV:      Record<number, { vx: number; vy: number }> = {};
const lastCollisionTime: Record<number, number>                    = {};
const prevBoostingSnap:  Record<number, boolean>                   = {};

// Called once per new snapshot (curr.time !== lastSnapshotTime guard is in Game.ts).
// Fires sounds and visual effects that are keyed to snapshot events rather than
// interpolated frame data, so interpolation flicker can't re-trigger them.
export function processSnapshot(curr: Snapshot, prev: Snapshot, mySlot: number, playerStyles: PlayerStyles, now: number) {
  // ---- ball impact ----
  const vx = curr.state.ball.x - prev.state.ball.x;
  const vy = curr.state.ball.y - prev.state.ball.y;
  const impactMag = Math.hypot(vx - prevBallVX, vy - prevBallVY);
  if (impactMag > 4) {
    spawnBurst(curr.state.ball.x, curr.state.ball.y, Math.min(8, Math.floor(impactMag * 0.8)), impactMag * 0.12, 0xe0e0e0);
    playHit(impactMag);
  }
  prevBallVX = vx; prevBallVY = vy;

  // ---- teleport — server sets `teleported` true for exactly the tick it executes ----
  for (const ps of curr.state.players) {
    if (!ps.powerUps.teleported) continue;
    const prevPs = prev.state.players.find((p) => p.slot === ps.slot);
    if (!prevPs) continue;
    pushTeleportFx(prevPs.position.x, prevPs.position.y, ps.position.x, ps.position.y, playerStyles[ps.slot]?.color ?? 0xffffff, now);
    spawnBurst(ps.position.x, ps.position.y, 10, 1.8, playerStyles[ps.slot]?.color ?? 0xffffff, 0.003);
    playTeleport(ps.slot !== mySlot);
  }

  // ---- P/P collision — both players show a large velocity delta on the same snapshot ----
  const collisionHits: { slot: number; mag: number }[] = [];
  for (const ps of curr.state.players) {
    const prevPs = prev.state.players.find((p) => p.slot === ps.slot);
    if (!prevPs) continue;
    if (!prevPlayerV[ps.slot])       prevPlayerV[ps.slot]       = { vx: 0, vy: 0 };
    if (!lastCollisionTime[ps.slot]) lastCollisionTime[ps.slot] = 0;

    const cvx = ps.position.x - prevPs.position.x;
    const cvy = ps.position.y - prevPs.position.y;
    const mag = Math.hypot(cvx - prevPlayerV[ps.slot].vx, cvy - prevPlayerV[ps.slot].vy);
    if (mag > 3 && now - lastCollisionTime[ps.slot] > 200) collisionHits.push({ slot: ps.slot, mag });
    prevPlayerV[ps.slot].vx = cvx;
    prevPlayerV[ps.slot].vy = cvy;
  }
  if (collisionHits.length === 2) {
    playCollision(Math.max(...collisionHits.map((h) => h.mag)));
    for (const { slot } of collisionHits) lastCollisionTime[slot] = now;
  }

  // ---- pickup collection ----
  for (let i = 0; i < curr.state.pickups.length; i++) {
    if (prev.state.pickups[i]?.active && !curr.state.pickups[i].active) playPickup();
  }

  // ---- boost sound — snapshot-level to avoid interpolation flicker re-triggering ----
  for (const ps of curr.state.players) {
    const prevPs = prev.state.players.find((p) => p.slot === ps.slot);
    if (!prevPs) continue;
    if (!prevBoostingSnap[ps.slot]) prevBoostingSnap[ps.slot] = false;

    const currBoosting = ps.powerUps.boostBar < prevPs.powerUps.boostBar;
    if (currBoosting && !prevBoostingSnap[ps.slot]) playBoostStart(ps.slot !== mySlot);
    prevBoostingSnap[ps.slot] = currBoosting;
  }
}

export function resetSnapshot() {
  prevBallVX = 0; prevBallVY = 0;
  for (const k of Object.keys(prevPlayerV))       delete prevPlayerV[+k];
  for (const k of Object.keys(lastCollisionTime)) delete lastCollisionTime[+k];
  for (const k of Object.keys(prevBoostingSnap))  delete prevBoostingSnap[+k];
}
