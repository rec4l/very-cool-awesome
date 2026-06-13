import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, GameState, PlayerStyle, MapDefinition, Vec2 } from '@shared/types';
import type { Room } from './rooms';
import { defaultPickups, defaultPowerUps, RoomManager } from './rooms';
import { computeBotInput } from './bot';
import {
  applyInputs,
  stepWorld,
  checkGoal,
  resetPositions,
  teleportPlayer,
  deployWreckingBall,
  retractWreckingBall,
  applyRetractForce,
  regrowGoalFrame,
} from './physics';
import { roundStartGoalBounds, maxGoalSpan, growGoalBounds, isNearMax } from '@shared/maps/goalFrame';
import {
  TICK_MS,
  TICK_RATE,
  BOOST_DRAIN_PER_TICK,
  BOOST_FORCE_MULTIPLIER,
  BOOST_MAX,
  BOOST_START,
  BOOST_PICKUP_AMOUNT,
  BOOST_PICKUP_RADIUS,
  BOOST_PICKUP_RESPAWN_TICKS,
  TELEPORT_RANGE,
  TELEPORT_COOLDOWN_TICKS,
  TELEPORT_START_CHARGES,
  MAX_TELEPORT_CHARGES,
  PLAYER_RADIUS,
  CHAIN_LENGTH,
  WRECKING_BALL_RADIUS,
  CORNER_BEVEL,
  GOAL_GROWTH_INTERVAL_TICKS,
  GOAL_GROWTH_FRACTION,
} from '@shared/constants';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// Shuffle spawn indices within a team — sized to actual player count so callers
// never access beyond the available baseSpawns entries (1v1 has 2 entries total).
export function shuffled(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks team A's spawn positions from the map's spawnGrid (excluding the cell
// nearest the boost orb, so nobody spawns on top of it), then point-reflects
// those same picks through the center of the field for team B (x -> width-x,
// y -> height-y) — symmetric both left/right and top/bottom no matter which
// cells got chosen. `count` is sized to teamSize (1 for 1v1, 2 for 2v2); the
// grid always has 5 candidates after exclusion, so this never runs out of
// spots for the current modes.
export function pickSpawns(map: MapDefinition, teamSize: number): { teamA: Vec2[]; teamB: Vec2[] } {
  const grid = map.spawnGrid;
  const orb = map.pickupPositions[0];
  let nearestIdx = 0;
  let nearestDist = Infinity;
  grid.forEach((cell, i) => {
    const dist = Math.hypot(cell.x - orb.x, cell.y - orb.y);
    if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
  });
  const candidates = grid.filter((_, i) => i !== nearestIdx);
  const count = Math.min(teamSize, candidates.length);

  const order = shuffled(candidates.length);
  const teamA = order.slice(0, count).map((i) => candidates[i]);
  const mirrored = teamA.map((cell) => ({ x: map.width - cell.x, y: map.height - cell.y }));
  const teamB = shuffled(count).map((i) => mirrored[i]);
  return { teamA, teamB };
}

// Re-rolls this room's spawn positions via pickSpawns and writes them into
// physics.playerStarts. Called at match start and again after every goal, so
// each round's kickoff is a fresh (but still symmetric) layout.
function assignSpawns(room: Room) {
  const teamA = room.players.filter((p) => p.team === 'A').sort((a, b) => a.slot - b.slot);
  const teamB = room.players.filter((p) => p.team === 'B').sort((a, b) => a.slot - b.slot);
  const { teamA: spawnsA, teamB: spawnsB } = pickSpawns(room.map, room.mode.teamSize);
  teamA.forEach((p, i) => { room.physics.playerStarts[p.slot] = spawnsA[i]; });
  teamB.forEach((p, i) => { room.physics.playerStarts[p.slot] = spawnsB[i]; });
}

function startCountdown(io: IO, roomCode: string, callback: () => void) {
  [3, 2, 1].forEach((n, i) => {
    setTimeout(() => io.to(roomCode).emit('countdown', n), i * 1000);
  });
  setTimeout(() => io.to(roomCode).emit('countdown', 'GO!'), 3000);
  setTimeout(callback, 3500);
}

function buildGameState(r: Room): GameState {
  return {
    players: r.players.map((p) => {
      const body = r.physics.players[p.slot];
      const pu   = r.powerUps[p.slot];
      const wb   = pu.wreckingBall;
      return {
        slot: p.slot,
        team: p.team,
        position: { x: body.position.x, y: body.position.y },
        powerUps: {
          boostBar:        pu.boostBar,
          teleportCooldown: pu.teleportCooldown,
          teleportCharges:  pu.teleportCharges,
          teleported:       pu.teleported,
        },
        wreckingBall: wb.body
          ? { active: true,  position: { ...wb.body.position }, velocity: { ...wb.body.velocity } }
          : { active: false, position: { x: 0, y: 0 },          velocity: { x: 0, y: 0 } },
      };
    }),
    ball:         { x: r.physics.ball.position.x, y: r.physics.ball.position.y },
    score:        { ...r.score },
    matchSeconds: Math.floor(r.matchTicks / TICK_RATE),
    pickups:      r.pickups.map((p) => ({ x: p.x, y: p.y, active: p.active })),
  };
}

function cleanupWreckingBalls(r: Room) {
  for (const pu of r.powerUps) {
    const wb = pu.wreckingBall;
    if (wb.body) {
      retractWreckingBall(r.physics.engine, wb.body, wb.chain);
      wb.body = null;
      wb.chain = null;
    }
    wb.prevActive = false;
    wb.retracting = false;
  }
}

export function startGame(io: IO, manager: RoomManager, room: Room) {
  // Pick spawn positions for this match: team A gets 1 (1v1) or 2 (2v2) random
  // cells from the map's spawn grid (minus the cell next to the boost orb), and
  // team B gets the same picks point-reflected through the center for a symmetric matchup.
  assignSpawns(room);
  resetPositions(room.physics);

  // send each slot's name/color/face to all clients
  const names: Record<number, PlayerStyle> = {};
  for (const p of room.players) {
    names[p.slot] = { name: p.name, color: p.color, faceId: p.faceId };
  }
  io.to(room.code).emit('names', names);
  room.state = 'countdown';

  startCountdown(io, room.code, () => {
    room.state = 'playing';
    manager.startLoop(room, (r) => {
      // freeze the sim whenever not actively playing (post-goal pause, countdown)
      if (r.state !== 'playing') {
        io.to(r.code).emit('state', buildGameState(r));
        return;
      }
      r.matchTicks++;
      r.stalemateTicks++;

      // ---- stalemate-driven goal growth (#13) ----
      if (r.stalemateTicks >= GOAL_GROWTH_INTERVAL_TICKS) {
        r.stalemateTicks = 0;
        const max = maxGoalSpan(room.map, CORNER_BEVEL);
        let changed = false;
        for (const side of ['left', 'right'] as const) {
          if (isNearMax(r.goalBounds[side], max)) continue;
          const next = growGoalBounds(r.goalBounds[side], max, GOAL_GROWTH_FRACTION);
          r.goalBounds[side] = next;
          regrowGoalFrame(r.physics, room.map, side, next.yMin, next.yMax);
          changed = true;
        }
        if (changed) io.to(r.code).emit('goal_grow', { goalBounds: r.goalBounds });
      }

      // ---- bot input (overwrite synthetic input each tick, no socket to receive from) ----
      for (const player of r.players) {
        if (player.isBot) r.inputs[player.slot] = computeBotInput(r, player.slot);
      }

      // ---- wrecking ball deploy (leading edge of E press) ----
      for (const player of r.players) {
        const { slot } = player;
        const input    = r.inputs[slot];
        const body     = r.physics.players[slot];
        const wb       = r.powerUps[slot].wreckingBall;

        if (input.pickaxeActive && !wb.prevActive && !wb.body) {
          const result = deployWreckingBall(
            r.physics.engine,
            body,
            input.pickaxeAngle,
            slot,
            r.players,
            room.mode.friendlyFire ?? true,
            room.map,
          );
          wb.body = result.ball;
          wb.chain = result.chain;
          wb.retracting = false;
          wb.maxDist = 0;
          wb.launchTicks = 0;
        }
        // retract on E release
        if (!input.pickaxeActive && wb.prevActive && wb.body && !wb.retracting) {
          wb.retracting = true;
          wb.launchTicks = 0;
        }
        wb.prevActive = input.pickaxeActive;
      }

      // ---- wrecking ball: pull force toward player while retracting ----
      for (const player of r.players) {
        const { slot } = player;
        const wb = r.powerUps[slot].wreckingBall;
        if (!wb.body || !wb.retracting) continue;
        applyRetractForce(wb.body, r.physics.players[slot]);
      }

      // ---- inputs, boost, teleport ----
      for (const player of r.players) {
        const { slot } = player;
        const body  = r.physics.players[slot];
        const input = r.inputs[slot];
        const pu    = r.powerUps[slot];

        pu.teleported = false; // reset each tick — set true below only when a teleport executes

        const isBoosting = input.boosting && pu.boostBar > 0;
        applyInputs(body, input, isBoosting ? BOOST_FORCE_MULTIPLIER : 1.0);
        if (isBoosting) pu.boostBar = Math.max(0, pu.boostBar - BOOST_DRAIN_PER_TICK);

        // regen one charge when cooldown expires; restart if still not full
        if (pu.teleportCooldown > 0) {
          pu.teleportCooldown--;
          if (pu.teleportCooldown === 0 && pu.teleportCharges < MAX_TELEPORT_CHARGES) {
            pu.teleportCharges++;
            if (pu.teleportCharges < MAX_TELEPORT_CHARGES) {
              pu.teleportCooldown = TELEPORT_COOLDOWN_TICKS;
            }
          }
        }

        if (input.teleportTarget && pu.teleportCharges > 0) {
          const t = input.teleportTarget;
          const dx = t.x - body.position.x;
          const dy = t.y - body.position.y;
          const dist = Math.hypot(dx, dy);
          if (dist > TELEPORT_RANGE) {
            t.x = body.position.x + (dx / dist) * TELEPORT_RANGE;
            t.y = body.position.y + (dy / dist) * TELEPORT_RANGE;
          }
          const margin = PLAYER_RADIUS + 5;
          t.x = Math.max(margin, Math.min(room.map.width  - margin, t.x));
          t.y = Math.max(margin, Math.min(room.map.height - margin, t.y));
          teleportPlayer(body, t);
          pu.teleported = true;
          pu.teleportCharges--;
          if (pu.teleportCooldown === 0) pu.teleportCooldown = TELEPORT_COOLDOWN_TICKS;
          input.teleportTarget = null;
        }
      }

      stepWorld(r.physics.engine, TICK_MS);

      // ---- wrecking ball: phase transitions after physics step ----
      for (const player of r.players) {
        const { slot } = player;
        const wb = r.powerUps[slot].wreckingBall;
        if (!wb.body) continue;
        const playerBody = r.physics.players[slot];
        const dist = Math.hypot(
          wb.body.position.x - playerBody.position.x,
          wb.body.position.y - playerBody.position.y,
        );

        if (wb.retracting) {
          if (dist <= PLAYER_RADIUS + WRECKING_BALL_RADIUS + 5) {
            retractWreckingBall(r.physics.engine, wb.body, wb.chain);
            wb.body = null;
            wb.chain = null;
            wb.retracting = false;
          }
        } else {
          wb.maxDist = Math.max(wb.maxDist, dist);
          wb.launchTicks++;
          const hitSomething = wb.maxDist > 20 && dist < wb.maxDist - 8;
          if (dist >= CHAIN_LENGTH || hitSomething) {
            wb.retracting = true;
            wb.launchTicks = 0;
          }
        }
      }

      // ---- pickups ----
      for (const player of r.players) {
        const { slot } = player;
        const body = r.physics.players[slot];
        for (const pickup of r.pickups) {
          if (!pickup.active) continue;
          if (Math.hypot(body.position.x - pickup.x, body.position.y - pickup.y) < BOOST_PICKUP_RADIUS) {
            pickup.active = false;
            pickup.respawnTimer = BOOST_PICKUP_RESPAWN_TICKS;
            r.powerUps[slot].boostBar = BOOST_MAX;
            r.powerUps[slot].teleportCharges = MAX_TELEPORT_CHARGES;
          }
        }
      }
      for (const pickup of r.pickups) {
        if (!pickup.active && pickup.respawnTimer > 0) {
          if (--pickup.respawnTimer === 0) pickup.active = true;
        }
      }

      // ---- broadcast ----
      io.to(r.code).emit('state', buildGameState(r));

      // ---- goal check ----
      const scoringTeam = checkGoal(r.physics.ball, room.map, r.goalBounds);
      if (!scoringTeam) return;

      r.score[scoringTeam]++;
      r.state = 'countdown';

      // a goal breaks the stalemate — reset timer and shrink goals back to round-start size
      r.stalemateTicks = 0;
      const roundBounds = roundStartGoalBounds(room.map);
      let resetGoalSize = false;
      for (const side of ['left', 'right'] as const) {
        if (r.goalBounds[side].yMin !== roundBounds[side].yMin || r.goalBounds[side].yMax !== roundBounds[side].yMax) {
          r.goalBounds[side] = roundBounds[side];
          regrowGoalFrame(r.physics, room.map, side, roundBounds[side].yMin, roundBounds[side].yMax);
          resetGoalSize = true;
        }
      }
      if (resetGoalSize) io.to(r.code).emit('goal_grow', { goalBounds: r.goalBounds });

      const isWin = r.score[scoringTeam] >= r.mode.winScore;
      io.to(r.code).emit('goal', {
        scoringTeam,
        score: { ...r.score },
        ...(isWin ? { winner: scoringTeam, matchSeconds: Math.floor(r.matchTicks / TICK_RATE) } : {}),
      });

      if (isWin) {
        cleanupWreckingBalls(r);
        r.state = 'postgame';
        manager.stopLoop(r);
        return;
      }

      cleanupWreckingBalls(r);
      setTimeout(() => {
        // re-roll spawns each round so kickoff position varies, while staying symmetric
        assignSpawns(r);
        resetPositions(r.physics);
        for (const pu of r.powerUps) {
          pu.boostBar = BOOST_START;
          pu.teleportCooldown = 0;
          pu.teleportCharges = TELEPORT_START_CHARGES;
        }
        // restore pickups to active state after each goal
        for (const pickup of r.pickups) {
          pickup.active = true;
          pickup.respawnTimer = 0;
        }
        startCountdown(io, r.code, () => { r.state = 'playing'; });
      }, 1000);
    });
  });
}

export { cleanupWreckingBalls };
