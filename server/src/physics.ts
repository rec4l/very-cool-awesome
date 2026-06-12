import Matter from 'matter-js';
import type { MapDefinition, PlayerInput, Vec2, GoalBounds, Team } from '@shared/types';
import { buildGoalFrameWalls } from '@shared/maps/goalFrame';
import {
  SUBSTEPS,
  PLAYER_RADIUS,
  BALL_RADIUS,
  PLAYER_SPEED,
  DIRECTION_PENALTY,
  BALL_RESTITUTION,
  PLAYER_RESTITUTION,
  PLAYER_FRICTION_AIR,
  BALL_FRICTION_AIR,
  WRECKING_BALL_RADIUS,
  WRECKING_BALL_DENSITY,
  LAUNCH_SPEED,
  WB_LAUNCH_SAFE_DIST,
  WB_LAUNCH_MIN_FRAC,
  WB_RETRACT_FORCE,
  WB_PLAYER_IMPACT_BOOST,
  CORNER_BEVEL,
} from '@shared/constants';

// One collision category per player slot — supports up to 4 players.
const PLAYER_CATS = [0x0010, 0x0020, 0x0040, 0x0080];
const CAT_BALL    = 0x0002; // soccer ball + wrecking balls
const CAT_WALL    = 0x0004;

// Build the collision mask for one player: can hit every other player + ball + wall.
// Friendly-fire filtering (Phase 2 feature) would check team here and exclude teammates.
function playerMask(playerCount: number, mySlot: number): number {
  let mask = CAT_BALL | CAT_WALL;
  for (let i = 0; i < playerCount; i++) {
    if (i !== mySlot) mask |= PLAYER_CATS[i];
  }
  return mask;
}

// playerStarts is the resolved spawn list for this room (2 entries for 1v1, 4 for 2v2).
// Storing it on the return object lets resetPositions work without the map.
export function createPhysics(map: MapDefinition, playerStarts: Vec2[]) {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
  const playerCount = playerStarts.length;
  // All-players mask used for walls — extra bits with no matching body have no effect.
  const allPlayerMask = PLAYER_CATS.reduce((a, c) => a | c, 0);

  // goal-frame walls tracked separately by side so they can be torn down and
  // rebuilt live during stalemate-driven goal growth (#13)
  const goalFrameBodies: { left: Matter.Body[]; right: Matter.Body[] } = { left: [], right: [] };

  for (const wall of map.walls) {
    const body = Matter.Bodies.rectangle(wall.x, wall.y, wall.w, wall.h, {
      isStatic: true, label: 'wall',
      collisionFilter: { category: CAT_WALL, mask: allPlayerMask | CAT_BALL },
    });
    Matter.Composite.add(engine.world, body);
    if (wall.role === 'goalFrame') {
      const side = wall.x < map.width / 2 ? 'left' : 'right';
      goalFrameBodies[side].push(body);
    }
  }

  // 45-degree corner bevels — prevent ball/players from getting stuck in corners
  const B = CORNER_BEVEL;
  const bevelCorners = [
    { cx: B / 2,                cy: B / 2,                angle: -Math.PI / 4 },
    { cx: map.width - B / 2,    cy: B / 2,                angle:  Math.PI / 4 },
    { cx: B / 2,                cy: map.height - B / 2,   angle:  Math.PI / 4 },
    { cx: map.width - B / 2,    cy: map.height - B / 2,   angle: -Math.PI / 4 },
  ];
  for (const { cx, cy, angle } of bevelCorners) {
    const bevel = Matter.Bodies.rectangle(cx, cy, B * Math.SQRT2, 20, {
      isStatic: true, angle, label: 'wall',
      collisionFilter: { category: CAT_WALL, mask: allPlayerMask | CAT_BALL },
    });
    Matter.Composite.add(engine.world, bevel);
  }

  // one physics body per player slot
  const players: Matter.Body[] = playerStarts.map((start, slot) =>
    Matter.Bodies.circle(start.x, start.y, PLAYER_RADIUS, {
      restitution: PLAYER_RESTITUTION, frictionAir: PLAYER_FRICTION_AIR,
      label: `player${slot}`,
      collisionFilter: {
        category: PLAYER_CATS[slot],
        mask: playerMask(playerCount, slot),
      },
    })
  );

  const ball = Matter.Bodies.circle(map.ballStart.x, map.ballStart.y, BALL_RADIUS, {
    restitution: BALL_RESTITUTION, frictionAir: BALL_FRICTION_AIR, label: 'ball',
    collisionFilter: {
      category: CAT_BALL,
      mask: allPlayerMask | CAT_BALL | CAT_WALL,
    },
  });

  Matter.Composite.add(engine.world, [...players, ball]);

  // extra knockback when a wrecking ball strikes a player — stacks on top of
  // Matter's natural collision response so hits feel meaningfully harder
  Matter.Events.on(engine, 'collisionStart', (event) => {
    for (const { bodyA, bodyB } of event.pairs) {
      const wb     = bodyA.label === 'wreckingBall' ? bodyA : bodyB.label === 'wreckingBall' ? bodyB : null;
      const player = bodyA.label.startsWith('player') ? bodyA : bodyB.label.startsWith('player') ? bodyB : null;
      if (!wb || !player) continue;
      Matter.Body.setVelocity(player, {
        x: player.velocity.x + wb.velocity.x * WB_PLAYER_IMPACT_BOOST,
        y: player.velocity.y + wb.velocity.y * WB_PLAYER_IMPACT_BOOST,
      });
    }
  });

  return { engine, players, ball, goalFrameBodies, playerStarts, ballStart: map.ballStart };
}

// Tears down one side's goal-frame walls and rebuilds them around new bounds.
export function regrowGoalFrame(
  physics: ReturnType<typeof createPhysics>,
  map: MapDefinition,
  side: 'left' | 'right',
  yMin: number,
  yMax: number
) {
  for (const body of physics.goalFrameBodies[side]) {
    Matter.Composite.remove(physics.engine.world, body);
  }
  const newWalls = buildGoalFrameWalls(map, side, yMin, yMax);
  const newBodies = newWalls.map((wall) =>
    Matter.Bodies.rectangle(wall.x, wall.y, wall.w, wall.h, {
      isStatic: true, label: 'wall',
      collisionFilter: { category: CAT_WALL, mask: CAT_BALL | PLAYER_CATS.reduce((a, c) => a | c, 0) },
    })
  );
  Matter.Composite.add(physics.engine.world, newBodies);
  physics.goalFrameBodies[side] = newBodies;
}

export function applyInputs(body: Matter.Body, input: PlayerInput, multiplier = 1.0) {
  const speed = PLAYER_SPEED * multiplier;
  let dx = 0, dy = 0;
  if (input.up)    dy -= 1;
  if (input.down)  dy += 1;
  if (input.left)  dx -= 1;
  if (input.right) dx += 1;
  if (dx !== 0 || dy !== 0) {
    // normalize so diagonal input isn't ~41% faster than cardinal input
    const len = Math.hypot(dx, dy);
    const force = { x: (dx / len) * speed, y: (dy / len) * speed };
    const dot = force.x * body.velocity.x + force.y * body.velocity.y;
    if (dot < 0) {
      Matter.Body.setVelocity(body, {
        x: body.velocity.x * (1 - DIRECTION_PENALTY),
        y: body.velocity.y * (1 - DIRECTION_PENALTY),
      });
    }
    Matter.Body.applyForce(body, body.position, force);
  }
}

// Runs physics at SUBSTEPS per tick to eliminate jitter at 30 ticks/s.
export function stepWorld(engine: Matter.Engine, delta: number) {
  for (let i = 0; i < SUBSTEPS; i++) {
    Matter.Engine.update(engine, delta / SUBSTEPS);
  }
}

export function checkGoal(ball: Matter.Body, map: MapDefinition, goalBounds: GoalBounds): Team | null {
  for (const goal of map.goals) {
    const bounds = goalBounds[goal.side];
    const inRange = ball.position.y > bounds.yMin && ball.position.y < bounds.yMax;
    if (!inRange) continue;
    if (goal.side === 'left'  && ball.position.x < 0)          return goal.scoringTeam;
    if (goal.side === 'right' && ball.position.x > map.width)  return goal.scoringTeam;
  }
  return null;
}

export function resetPositions(physics: ReturnType<typeof createPhysics>) {
  physics.players.forEach((body, i) => {
    Matter.Body.setPosition(body, physics.playerStarts[i]);
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
  });
  Matter.Body.setPosition(physics.ball, physics.ballStart);
  Matter.Body.setVelocity(physics.ball, { x: 0, y: 0 });
}

export function teleportPlayer(body: Matter.Body, target: Vec2) {
  Matter.Body.setPosition(body, target);
}

export function deployWreckingBall(
  engine: Matter.Engine,
  playerBody: Matter.Body,
  angle: number,
  slot: number,
  players: Array<{ slot: number; team: Team }>,
  friendlyFire: boolean,
  map: MapDefinition
): { ball: Matter.Body; chain: null } {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const spawnDist = PLAYER_RADIUS + WRECKING_BALL_RADIUS + 2;
  const spawnPos = {
    x: playerBody.position.x + dir.x * spawnDist,
    y: playerBody.position.y + dir.y * spawnDist,
  };

  // Exclude only the owner. With friendly fire on, teammates are hittable too.
  const ownerTeam = players.find((p) => p.slot === slot)?.team;
  let targetMask = 0;
  for (const player of players) {
    if (player.slot === slot) continue;
    if (!friendlyFire && player.team === ownerTeam) continue;
    targetMask |= PLAYER_CATS[player.slot];
  }

  const ball = Matter.Bodies.circle(spawnPos.x, spawnPos.y, WRECKING_BALL_RADIUS, {
    restitution: 0.6, friction: 0, frictionAir: 0.02, label: 'wreckingBall',
    density: WRECKING_BALL_DENSITY,
    collisionFilter: { category: CAT_BALL, mask: targetMask | CAT_BALL | CAT_WALL },
  });
  Matter.Composite.add(engine.world, ball);

  // scale launch speed down when firing toward a nearby wall to prevent tunneling
  let boundaryDist = Infinity;
  if (dir.x > 0)      boundaryDist = Math.min(boundaryDist, (map.width  - spawnPos.x) / dir.x);
  else if (dir.x < 0) boundaryDist = Math.min(boundaryDist, (0          - spawnPos.x) / dir.x);
  if (dir.y > 0)      boundaryDist = Math.min(boundaryDist, (map.height - spawnPos.y) / dir.y);
  else if (dir.y < 0) boundaryDist = Math.min(boundaryDist, (0          - spawnPos.y) / dir.y);

  const frac  = Math.max(WB_LAUNCH_MIN_FRAC, Math.min(1, boundaryDist / WB_LAUNCH_SAFE_DIST));
  const speed = LAUNCH_SPEED * frac;
  Matter.Body.setVelocity(ball, { x: dir.x * speed, y: dir.y * speed });
  return { ball, chain: null };
}

export function applyRetractForce(ball: Matter.Body, playerBody: Matter.Body) {
  const dx = playerBody.position.x - ball.position.x;
  const dy = playerBody.position.y - ball.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    Matter.Body.applyForce(ball, ball.position, {
      x: (dx / dist) * WB_RETRACT_FORCE,
      y: (dy / dist) * WB_RETRACT_FORCE,
    });
  }
}

export function retractWreckingBall(
  engine: Matter.Engine,
  ball: Matter.Body,
  chain: Matter.Constraint | null
) {
  Matter.Composite.remove(engine.world, ball);
  if (chain) Matter.Composite.remove(engine.world, chain);
}
