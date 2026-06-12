import type { GameState } from '@shared/types';
import { TICK_MS } from '@shared/constants';
import type { Snapshot } from './types';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Inactive wrecking balls report position (0,0) — lerping across an
// inactive→active transition would streak from the corner for one frame.
// Snap to the new position whenever the previous snapshot didn't have an active ball.
function lerpWreckingBall(
  a: { active: boolean; position: { x: number; y: number } },
  b: { active: boolean; position: { x: number; y: number }; velocity: { x: number; y: number } },
  t: number,
) {
  if (!a.active || !b.active) return { active: b.active, position: b.position, velocity: b.velocity };
  return {
    active:   b.active,
    position: { x: lerp(a.position.x, b.position.x, t), y: lerp(a.position.y, b.position.y, t) },
    velocity: b.velocity,
  };
}

export function interpolated(prev: Snapshot | null, curr: Snapshot | null): GameState | null {
  if (!curr) return null;
  if (!prev) return curr.state;
  const t = Math.min(1, (performance.now() - curr.time) / TICK_MS);
  const a = prev.state, b = curr.state;

  // index previous players by slot for O(1) lookup
  const aBySlot = new Map(a.players.map((p) => [p.slot, p]));

  return {
    players: b.players.map((bps) => {
      const aps = aBySlot.get(bps.slot);
      if (!aps) return bps;
      return {
        slot: bps.slot,
        team: bps.team,
        position: {
          x: lerp(aps.position.x, bps.position.x, t),
          y: lerp(aps.position.y, bps.position.y, t),
        },
        powerUps:     bps.powerUps,
        wreckingBall: lerpWreckingBall(aps.wreckingBall, bps.wreckingBall, t),
      };
    }),
    ball:         { x: lerp(a.ball.x, b.ball.x, t), y: lerp(a.ball.y, b.ball.y, t) },
    score:         b.score,
    matchSeconds:  b.matchSeconds,
    pickups:       b.pickups,
  };
}
