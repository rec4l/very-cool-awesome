import type { MapDefinition } from '../types';
import { buildGoalFrameWalls } from './goalFrame';

const W = 1600, H = 800, T = 20;
const GOAL_TOP = Math.round(H / 3), GOAL_BOTTOM = Math.round((H * 2) / 3);
const BACK_WALL_OFFSET = 60;

export const largeMap: MapDefinition = {
  id: 'large',
  name: 'Large Arena',
  width: W,
  height: H,
  backgroundColor: 0x1a1a2e,
  playerStarts: [{ x: Math.round(W / 6), y: H / 2 }, { x: Math.round((W * 5) / 6), y: H / 2 }],
  ballStart: { x: W / 2, y: H / 2 },
  // same layout as classic — left boost orb at (240,200) sits next to cell 0
  spawnGrid: [
    { x: 200, y: 160 },
    { x: 480, y: 160 },
    { x: 200, y: 400 },
    { x: 480, y: 400 },
    { x: 200, y: 640 },
    { x: 480, y: 640 },
  ],
  walls: [
    { x: W / 2,     y: -T / 2,                              w: W, h: T },
    { x: W / 2,     y: H + T / 2,                            w: W, h: T },
    { x: -BACK_WALL_OFFSET,  y: H / 2,                       w: T, h: H },
    { x: W + BACK_WALL_OFFSET, y: H / 2,                     w: T, h: H },

    ...buildGoalFrameWalls({ width: W, height: H }, 'left',  GOAL_TOP, GOAL_BOTTOM),
    ...buildGoalFrameWalls({ width: W, height: H }, 'right', GOAL_TOP, GOAL_BOTTOM),
  ],
  goals: [
    { side: 'left',  yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringTeam: 'B' },
    { side: 'right', yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringTeam: 'A' },
  ],
  pickupPositions: [{ x: 240, y: 200 }, { x: 1360, y: 600 }],
};
