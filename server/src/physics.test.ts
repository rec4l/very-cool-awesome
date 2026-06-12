import { describe, it, expect } from 'vitest';
import Matter from 'matter-js';
import type { PlayerInput } from '@shared/types';
import { checkGoal, applyInputs } from './physics';
import { classicMap } from '@shared/maps/classic';
import { initialGoalBounds } from '@shared/maps/goalFrame';
import { PLAYER_SPEED, BOOST_FORCE_MULTIPLIER } from '@shared/constants';

// checkGoal only reads `.position` off the ball body, so a plain object
// shaped like that is enough — no need to spin up a real Matter engine.
function ballAt(x: number, y: number): Matter.Body {
  return { position: { x, y } } as Matter.Body;
}

describe('checkGoal', () => {
  const goalBounds = initialGoalBounds(classicMap);

  it('returns null when the ball is in the field of play', () => {
    const ball = ballAt(classicMap.width / 2, classicMap.height / 2);
    expect(checkGoal(ball, classicMap, goalBounds)).toBeNull();
  });

  it('awards a goal to team B when the ball crosses the left goal line within bounds', () => {
    const midGoal = (goalBounds.left.yMin + goalBounds.left.yMax) / 2;
    const ball = ballAt(-5, midGoal);
    expect(checkGoal(ball, classicMap, goalBounds)).toBe('B');
  });

  it('awards a goal to team A when the ball crosses the right goal line within bounds', () => {
    const midGoal = (goalBounds.right.yMin + goalBounds.right.yMax) / 2;
    const ball = ballAt(classicMap.width + 5, midGoal);
    expect(checkGoal(ball, classicMap, goalBounds)).toBe('A');
  });

  it('does not award a goal when the ball crosses the goal line outside the goal mouth', () => {
    const aboveGoal = goalBounds.left.yMin - 10;
    const ball = ballAt(-5, aboveGoal);
    expect(checkGoal(ball, classicMap, goalBounds)).toBeNull();
  });

  it('does not award a goal when the ball is within y-bounds but still in play', () => {
    const midGoal = (goalBounds.left.yMin + goalBounds.left.yMax) / 2;
    const ball = ballAt(5, midGoal); // inside the arena, not past the line
    expect(checkGoal(ball, classicMap, goalBounds)).toBeNull();
  });
});

// Stage 13 (#10): diagonal input used to apply a force along both axes at full
// `speed` each, giving a resultant magnitude of speed*sqrt(2) (~41% faster).
// applyInputs now normalizes the direction vector so the resultant force
// magnitude is `speed` regardless of how many directions are held.
describe('applyInputs', () => {
  const noInput: PlayerInput = {
    up: false, down: false, left: false, right: false,
    boosting: false, teleportTarget: null, pickaxeActive: false, pickaxeAngle: 0,
  };

  function freshBody(): Matter.Body {
    return Matter.Bodies.circle(0, 0, 16);
  }

  it('applies no force when no direction is held', () => {
    const body = freshBody();
    applyInputs(body, { ...noInput });
    expect(body.force.x).toBe(0);
    expect(body.force.y).toBe(0);
  });

  it('cardinal input applies a force of magnitude PLAYER_SPEED', () => {
    const body = freshBody();
    applyInputs(body, { ...noInput, up: true });
    expect(Math.hypot(body.force.x, body.force.y)).toBeCloseTo(PLAYER_SPEED);
  });

  it('diagonal input applies a force of the same magnitude as cardinal input', () => {
    const body = freshBody();
    applyInputs(body, { ...noInput, up: true, right: true });
    expect(Math.hypot(body.force.x, body.force.y)).toBeCloseTo(PLAYER_SPEED);
  });

  it('opposite directions cancel out to no force', () => {
    const body = freshBody();
    applyInputs(body, { ...noInput, up: true, down: true, left: true, right: true });
    expect(body.force.x).toBe(0);
    expect(body.force.y).toBe(0);
  });

  it('boost multiplier scales the normalized force magnitude', () => {
    const body = freshBody();
    applyInputs(body, { ...noInput, up: true, right: true }, BOOST_FORCE_MULTIPLIER);
    expect(Math.hypot(body.force.x, body.force.y)).toBeCloseTo(PLAYER_SPEED * BOOST_FORCE_MULTIPLIER);
  });
});
