import { describe, it, expect } from 'vitest';
import {
  buildGoalFrameWalls,
  initialGoalBounds,
  maxGoalSpan,
  growGoalBounds,
  isNearMax,
} from './goalFrame';
import { classicMap } from './classic';
import { CORNER_BEVEL } from '../constants';

describe('initialGoalBounds', () => {
  it('reads left/right goal bounds straight from the map definition', () => {
    const bounds = initialGoalBounds(classicMap);
    const left = classicMap.goals.find((g) => g.side === 'left')!;
    const right = classicMap.goals.find((g) => g.side === 'right')!;
    expect(bounds.left).toEqual({ yMin: left.yMin, yMax: left.yMax });
    expect(bounds.right).toEqual({ yMin: right.yMin, yMax: right.yMax });
  });
});

describe('maxGoalSpan', () => {
  it('returns a span centered on the arena, inset by the corner bevel', () => {
    const span = maxGoalSpan(classicMap, CORNER_BEVEL);
    const center = classicMap.height / 2;
    expect(span.yMin).toBe(center - (classicMap.height / 2 - CORNER_BEVEL));
    expect(span.yMax).toBe(center + (classicMap.height / 2 - CORNER_BEVEL));
    expect(span.yMax - span.yMin).toBe(classicMap.height - CORNER_BEVEL * 2);
  });
});

describe('growGoalBounds', () => {
  it('closes a fraction of the remaining gap to max on each edge', () => {
    const current = { yMin: 200, yMax: 600 };
    const max = { yMin: 50, yMax: 750 };
    const next = growGoalBounds(current, max, 0.5);
    expect(next.yMin).toBe(200 - (200 - 50) * 0.5); // 125
    expect(next.yMax).toBe(600 + (750 - 600) * 0.5); // 675
  });

  it('never overshoots max — repeated growth converges toward it', () => {
    const max = { yMin: 50, yMax: 750 };
    let current = { yMin: 260, yMax: 540 };
    for (let i = 0; i < 50; i++) {
      current = growGoalBounds(current, max, 0.4);
    }
    expect(current.yMin).toBeGreaterThan(max.yMin);
    expect(current.yMax).toBeLessThan(max.yMax);
    expect(isNearMax(current, max)).toBe(true);
  });
});

describe('isNearMax', () => {
  it('is false while far from max and true once within epsilon', () => {
    const max = { yMin: 50, yMax: 750 };
    expect(isNearMax({ yMin: 200, yMax: 600 }, max)).toBe(false);
    expect(isNearMax({ yMin: 50.5, yMax: 749.5 }, max)).toBe(true);
  });
});

describe('buildGoalFrameWalls', () => {
  it('builds front-wall pieces above and below the goal mouth', () => {
    const walls = buildGoalFrameWalls({ width: 1600, height: 800 }, 'left', 260, 540);
    expect(walls).toHaveLength(2);
    expect(walls.every((w) => w.role === 'goalFrame')).toBe(true);
    // front-wall pieces sit at the arena edge (x = -T/2 for the left side)
    expect(walls.every((w) => w.x < 0)).toBe(true);
  });

  it('adds recessed goal-box side walls when goalBoxDepth is set', () => {
    const walls = buildGoalFrameWalls({ width: 1600, height: 800, goalBoxDepth: 60 }, 'right', 260, 540);
    expect(walls).toHaveLength(4);
    // box walls sit beyond the right edge of the arena
    const boxWalls = walls.slice(2);
    expect(boxWalls.every((w) => w.x > 1600)).toBe(true);
  });

  it('mirrors front-wall x position for left vs right sides', () => {
    const left = buildGoalFrameWalls({ width: 1600, height: 800 }, 'left', 260, 540);
    const right = buildGoalFrameWalls({ width: 1600, height: 800 }, 'right', 260, 540);
    // left front wall sits just outside x=0, right front wall just outside x=width — equal offsets
    expect(Math.abs(left[0].x)).toBe(Math.abs(right[0].x - 1600));
  });
});
