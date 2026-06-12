import type { MapDefinition } from '../types';
import { buildGoalFrameWalls } from './goalFrame';

const W = 2000, H = 1000, T = 20;
const GOAL_TOP = Math.round(H / 3), GOAL_BOTTOM = Math.round((H * 2) / 3);
const BACK_WALL_OFFSET = 60;

export const xlMap: MapDefinition = {
  id: 'xl',
  name: 'XL Arena',
  width: W,
  height: H,
  backgroundColor: 0x1a1a2e,
  playerStarts: [{ x: Math.round(W / 6), y: H / 2 }, { x: Math.round((W * 5) / 6), y: H / 2 }],
  ballStart: { x: W / 2, y: H / 2 },
  // scaled up from classic's grid (1.25x) — left boost orb at (300,250) sits
  // next to cell 0
  spawnGrid: [
    { x: 250, y: 200 },
    { x: 600, y: 200 },
    { x: 250, y: 500 },
    { x: 600, y: 500 },
    { x: 250, y: 800 },
    { x: 600, y: 800 },
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
  pickupPositions: [{ x: 300, y: 250 }, { x: 1700, y: 750 }],
};
