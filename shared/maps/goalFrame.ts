import type { MapDefinition, MapWall, GoalBounds } from '../types';
import { WALL_THICKNESS, GOAL_SIZE_REDUCTION } from '../constants';

// Builds the wall segments that physically frame one side's goal mouth: the
// front-wall pieces above/below the opening, plus — if the map declares a
// goalBoxDepth — the recessed goal-box's top/bottom side walls, kept flush with
// the mouth edges. Centralized here (rather than copy-pasted per map, as it was
// before) so the dynamic goal-growth system (#13) can rebuild this geometry
// around new yMin/yMax bounds live, without duplicating the formulas, and so
// every map that uses it produces walls tagged role: 'goalFrame' for free.
export function buildGoalFrameWalls(
  arena: { width: number; height: number; goalBoxDepth?: number },
  side: 'left' | 'right',
  yMin: number,
  yMax: number
): MapWall[] {
  const T = WALL_THICKNESS;
  const frontX = side === 'left' ? -T / 2 : arena.width + T / 2;
  const walls: MapWall[] = [
    { x: frontX, y: yMin / 2,                            w: T, h: yMin,                role: 'goalFrame' },
    { x: frontX, y: yMax + (arena.height - yMax) / 2,    w: T, h: arena.height - yMax, role: 'goalFrame' },
  ];
  if (arena.goalBoxDepth) {
    const depth = arena.goalBoxDepth;
    const boxCenter = T + depth / 2;
    const boxX = side === 'left' ? -boxCenter : arena.width + boxCenter;
    walls.push(
      { x: boxX, y: yMin - T / 2, w: depth, h: T, role: 'goalFrame' },
      { x: boxX, y: yMax + T / 2, w: depth, h: T, role: 'goalFrame' },
    );
  }
  return walls;
}

// the goal mouth's bounds straight from the map definition — the room's starting
// point, and what growth resets back to after each goal (see GOAL_GROWTH_FRACTION)
export function initialGoalBounds(map: MapDefinition): GoalBounds {
  const left = map.goals.find((g) => g.side === 'left')!;
  const right = map.goals.find((g) => g.side === 'right')!;
  return {
    left:  { yMin: left.yMin,  yMax: left.yMax },
    right: { yMin: right.yMin, yMax: right.yMax },
  };
}

// the goal mouth's bounds at the start of a round (match start and after every
// goal): GOAL_SIZE_REDUCTION smaller than the map-defined size, centered on the
// same midpoint, and left to grow back via growGoalBounds during a stalemate
export function roundStartGoalBounds(map: MapDefinition): GoalBounds {
  const shrink = (b: { yMin: number; yMax: number }) => {
    const center = (b.yMin + b.yMax) / 2;
    const halfSpan = (b.yMax - b.yMin) / 2 * (1 - GOAL_SIZE_REDUCTION);
    return { yMin: center - halfSpan, yMax: center + halfSpan };
  };
  const initial = initialGoalBounds(map);
  return { left: shrink(initial.left), right: shrink(initial.right) };
}

// the largest symmetric span the goal mouth can grow to before it would start
// eating into the corner bevels — "stretches across one side" in practice
export function maxGoalSpan(map: MapDefinition, cornerBevel: number): { yMin: number; yMax: number } {
  const center = map.height / 2;
  const halfSpan = map.height / 2 - cornerBevel;
  return { yMin: center - halfSpan, yMax: center + halfSpan };
}

// one growth step: closes `fraction` of the remaining gap to max on each edge —
// fast early, tapering as it approaches the cap (a converging sequence, never
// technically reaching max, so callers should snap via isNearMax)
export function growGoalBounds(
  current: { yMin: number; yMax: number },
  max: { yMin: number; yMax: number },
  fraction: number
): { yMin: number; yMax: number } {
  return {
    yMin: current.yMin - (current.yMin - max.yMin) * fraction,
    yMax: current.yMax + (max.yMax - current.yMax) * fraction,
  };
}

export function isNearMax(
  current: { yMin: number; yMax: number },
  max: { yMin: number; yMax: number },
  epsilon = 1.5
): boolean {
  return Math.abs(current.yMin - max.yMin) < epsilon && Math.abs(current.yMax - max.yMax) < epsilon;
}
