import type { PlayerInput, Vec2, Team } from '@shared/types';
import type { Room, BotMode } from './rooms';
import { defaultInput } from './rooms';
import { BALL_FRICTION_AIR, SUBSTEPS, PLAYER_RADIUS, TELEPORT_RANGE, CHAIN_LENGTH } from '@shared/constants';

// Ignore differences smaller than this when deciding to move toward the
// target — avoids jitter when the bot is already roughly aligned.
const DEADZONE = 5;

// if nothing else demands attention and the bot is this far from the ball
// while it sits in the opponent's half, fall back toward its spawn point
const RETURN_TRIGGER_DIST = 500;

// only consider swinging the wrecking ball at the ball if it's roughly within
// chain's reach
const WRECKING_BALL_RANGE = CHAIN_LENGTH * 0.6;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type BotKnobs = {
  reactionTicks: number;     // ticks between target recomputes — higher = slower reactions
  aimNoise: number;           // max px of random offset applied to the target
  predictionTicks: number;    // how far ahead to extrapolate the ball's position
  defendTriggerDist: number;  // how close a predicted ball must be to the bot's goal to trigger defense
  minBoostBar: number;        // boost bar must be above this to use boost
  teleportChance: number;     // chance per recompute to consider teleporting toward the target
  wreckingBallChance: number; // chance per recompute to consider swinging the wrecking ball
};

// Maps an elo rating (600 = pushover, 2400 = tryhard) onto the knobs above.
function eloKnobs(elo: number): BotKnobs {
  const t = Math.max(0, Math.min(1, (elo - 600) / 1800));
  return {
    reactionTicks: Math.round(lerp(15, 1, t)),
    aimNoise: lerp(50, 0, t),
    predictionTicks: Math.round(lerp(0, 15, t)),
    defendTriggerDist: lerp(150, 450, t),
    minBoostBar: lerp(90, 10, t),
    teleportChance: lerp(0, 0.4, t),
    wreckingBallChance: lerp(0, 0.3, t),
  };
}

function goalCenter(room: Room, side: 'left' | 'right'): Vec2 {
  const bounds = room.goalBounds[side];
  return { x: side === 'left' ? 0 : room.map.width, y: (bounds.yMin + bounds.yMax) / 2 };
}

// the goal the opposing team scores into by reaching it
function ownGoal(room: Room, team: Team): Vec2 {
  return goalCenter(room, team === 'A' ? 'left' : 'right');
}

function isOpponentHalf(pos: Vec2, room: Room, team: Team): boolean {
  const mid = room.map.width / 2;
  return team === 'A' ? pos.x > mid : pos.x < mid;
}

// Extrapolates the ball's position a few ticks ahead using its current
// velocity and air friction — cheap arithmetic, no re-simulation. Matter
// advances velocity by the friction factor once per substep, so a tick's
// displacement is roughly velocity * SUBSTEPS and decays by the same factor
// raised to SUBSTEPS each tick.
function predictBall(room: Room, ticks: number): Vec2 {
  const ball = room.physics.ball;
  const decayPerTick = Math.pow(1 - BALL_FRICTION_AIR, SUBSTEPS);
  const pos: Vec2 = { x: ball.position.x, y: ball.position.y };
  const vel: Vec2 = { x: ball.velocity.x * SUBSTEPS, y: ball.velocity.y * SUBSTEPS };
  for (let i = 0; i < ticks; i++) {
    pos.x += vel.x;
    pos.y += vel.y;
    vel.x *= decayPerTick;
    vel.y *= decayPerTick;
  }
  return pos;
}

// Recomputes this bot's state-machine mode and movement target. Called once
// every knobs.reactionTicks ticks — the gap between recomputes is the bot's
// reaction delay.
function pickTarget(room: Room, slot: number, team: Team, knobs: BotKnobs): { mode: BotMode; target: Vec2 } {
  const body = room.physics.players[slot];
  const myGoal = ownGoal(room, team);
  const predictedBall = predictBall(room, knobs.predictionTicks);

  const ballToOwnGoal = dist(predictedBall, myGoal);
  const botToOwnGoal  = dist(body.position, myGoal);
  const botToBall     = dist(body.position, room.physics.ball.position);

  let mode: BotMode;
  let target: Vec2;

  if (ballToOwnGoal < knobs.defendTriggerDist && ballToOwnGoal < botToOwnGoal) {
    // stand on the line between the ball and the goal, biased toward goal
    mode = 'DEFEND_GOAL';
    target = { x: lerp(predictedBall.x, myGoal.x, 0.4), y: lerp(predictedBall.y, myGoal.y, 0.4) };
  } else if (botToBall > RETURN_TRIGGER_DIST && isOpponentHalf(predictedBall, room, team)) {
    mode = 'RETURN_TO_POSITION';
    target = { ...room.physics.playerStarts[slot] };
  } else {
    mode = 'CHASE_BALL';
    target = predictedBall;
  }

  if (knobs.aimNoise > 0) {
    target = {
      x: target.x + (Math.random() * 2 - 1) * knobs.aimNoise,
      y: target.y + (Math.random() * 2 - 1) * knobs.aimNoise,
    };
  }

  return { mode, target };
}

export function computeBotInput(room: Room, slot: number): PlayerInput {
  const input = defaultInput();
  const body = room.physics.players[slot];
  const ball = room.physics.ball;
  if (!body || !ball) return input;

  const player = room.players.find((p) => p.slot === slot);
  const state = room.botState[slot];
  if (!player || !state) return input;

  const knobs = eloKnobs(player.elo ?? 1000);
  const pu = room.powerUps[slot];

  if (state.reactionTimer <= 0) {
    const { mode, target } = pickTarget(room, slot, player.team, knobs);
    state.mode = mode;
    state.target = target;
    state.reactionTimer = knobs.reactionTicks;
    state.wantsTeleport = pu.teleportCharges > 0 && Math.random() < knobs.teleportChance;
    state.fireWreckingBall = dist(body.position, ball.position) < WRECKING_BALL_RANGE
      && Math.random() < knobs.wreckingBallChance;
  } else {
    state.reactionTimer--;
  }

  const dx = state.target.x - body.position.x;
  const dy = state.target.y - body.position.y;
  const targetDist = Math.hypot(dx, dy);

  if (dx > DEADZONE) input.right = true;
  else if (dx < -DEADZONE) input.left = true;
  if (dy > DEADZONE) input.down = true;
  else if (dy < -DEADZONE) input.up = true;

  input.boosting = pu.boostBar > knobs.minBoostBar && targetDist > PLAYER_RADIUS * 4;

  if (state.wantsTeleport && pu.teleportCharges > 0 && targetDist > TELEPORT_RANGE * 0.5) {
    input.teleportTarget = { x: state.target.x, y: state.target.y };
  }

  if (state.fireWreckingBall) {
    input.pickaxeActive = true;
    input.pickaxeAngle = Math.atan2(ball.position.y - body.position.y, ball.position.x - body.position.x);
    state.fireWreckingBall = false; // one-tick tap — released next tick so it can retract/redeploy later
  }

  return input;
}
