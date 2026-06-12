import type { MapDefinition } from '../types';
import { buildGoalFrameWalls } from './goalFrame';

const W = 1600, H = 800, T = 20;
const GOAL_TOP = 260, GOAL_BOTTOM = 540;

// recessed goal box — players can skate in through the goal mouth but can't slip
// around the sides. Box interior runs from the front wall's inner face out to the
// back wall's inner face.
const BACK_WALL_OFFSET = 60; // distance from arena edge to back wall center
const GOAL_BOX_DEPTH = BACK_WALL_OFFSET - T - T / 2; // interior width of the box

export const classicMap: MapDefinition = {
  id: 'classic',
  name: 'Classic Arena',
  width: W,
  height: H,
  backgroundColor: 0x1a1a2e,
  playerStarts: [{ x: 280, y: 400 }, { x: 1320, y: 400 }],
  // 2v2 spawns — RL-style: one kickoff player near center, one back-corner player per team.
  // Slots 0-1 = Team A (left half), slots 2-3 = Team B (right half).
  // Back players sit at opposite diagonals so neither team has a positional edge.
  playerStarts4: [
    { x: 460,  y: 400 }, // slot 0 — Team A kickoff (center-left)
    { x: 160,  y: 580 }, // slot 1 — Team A back corner (lower-left, away from upper-left boost)
    { x: 1140, y: 400 }, // slot 2 — Team B kickoff (center-right)
    { x: 1440, y: 220 }, // slot 3 — Team B back corner (upper-right, away from lower-right boost)
  ],
  ballStart: { x: W / 2, y: H / 2 },
  goalBoxDepth: GOAL_BOX_DEPTH,
  // 2x3 grid of left-side spawn candidates — cell 0 sits right next to the
  // left boost orb (240,200) and gets excluded by startGame, leaving 5 spots:
  // a back-corner pair, a center pair (in front of the goal mouth), and a
  // forward pair near the halfway line.
  spawnGrid: [
    { x: 200, y: 160 }, // closest to boost orb — excluded
    { x: 480, y: 160 },
    { x: 200, y: 400 },
    { x: 480, y: 400 },
    { x: 200, y: 640 },
    { x: 480, y: 640 },
  ],
  walls: [
    { x: W / 2,    y: -T / 2,                           w: W, h: T },
    { x: W / 2,    y: H + T / 2,                         w: W, h: T },
    { x: -BACK_WALL_OFFSET,       y: H / 2,                            w: T, h: H },
    { x: W + BACK_WALL_OFFSET,    y: H / 2,                            w: T, h: H },

    // goal-mouth frame (front-wall pieces + recessed goal-box sides) — built via
    // the shared helper so #13's live regrowth can rebuild identical geometry
    ...buildGoalFrameWalls({ width: W, height: H, goalBoxDepth: GOAL_BOX_DEPTH }, 'left',  GOAL_TOP, GOAL_BOTTOM),
    ...buildGoalFrameWalls({ width: W, height: H, goalBoxDepth: GOAL_BOX_DEPTH }, 'right', GOAL_TOP, GOAL_BOTTOM),
  ],
  goals: [
    { side: 'left',  yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringTeam: 'B' },
    { side: 'right', yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringTeam: 'A' },
  ],
  pickupPositions: [{ x: 240, y: 200 }, { x: 1360, y: 600 }],
};
