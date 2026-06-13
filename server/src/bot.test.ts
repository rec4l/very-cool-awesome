import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'socket.io';
import Matter from 'matter-js';
import type { ServerToClientEvents, ClientToServerEvents } from '@shared/types';
import { RoomManager } from './rooms';
import { startGame } from './game';
import { computeBotInput } from './bot';
import { TICK_MS } from '@shared/constants';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function fakeIO(): IO {
  return { to: () => ({ emit: () => {} }) } as unknown as IO;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('bot chases the ball', () => {
  it('moves the bot body toward the ball over time without crashing', () => {
    vi.useFakeTimers();
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.addBot(room);
    room.state = 'lobby';

    startGame(fakeIO(), manager, room);
    vi.advanceTimersByTime(3500); // countdown -> playing, tick loop starts

    const botBody = room.physics.players[1];
    const ball = room.physics.ball;
    const startDist = Math.hypot(ball.position.x - botBody.position.x, ball.position.y - botBody.position.y);

    vi.advanceTimersByTime(TICK_MS * 60); // 2 seconds of ticks

    const endDist = Math.hypot(ball.position.x - botBody.position.x, ball.position.y - botBody.position.y);

    expect(Number.isFinite(botBody.position.x)).toBe(true);
    expect(Number.isFinite(botBody.position.y)).toBe(true);
    expect(endDist).toBeLessThan(startDist);
  });
});

describe('bot elo knobs', () => {
  it('reacts faster (lower reaction delay) at higher elo', () => {
    const manager = new RoomManager();

    const lowRoom = manager.createRoom('Host', 'host-low');
    manager.addBot(lowRoom, 600);
    computeBotInput(lowRoom, 1);
    const lowReaction = lowRoom.botState[1].reactionTimer;

    const highRoom = manager.createRoom('Host', 'host-high');
    manager.addBot(highRoom, 2400);
    computeBotInput(highRoom, 1);
    const highReaction = highRoom.botState[1].reactionTimer;

    expect(lowReaction).toBeGreaterThan(highReaction);
  });
});

describe('bot state machine', () => {
  it('switches to DEFEND_GOAL when the ball threatens its own goal', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.addBot(room, 2400); // slot 1, team B — defends the right goal; high elo -> no aim noise

    const botBody = room.physics.players[1];
    const ball = room.physics.ball;

    // ball sitting right in front of team B's goal (right side), bot far away
    Matter.Body.setPosition(ball, { x: room.map.width - 50, y: room.map.height / 2 });
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.Body.setPosition(botBody, { x: room.map.width / 2, y: room.map.height / 2 });

    computeBotInput(room, 1);

    expect(room.botState[1].mode).toBe('DEFEND_GOAL');
    // target should sit between the ball and the goal, biased toward the goal
    expect(room.botState[1].target.x).toBeGreaterThan(room.map.width - 50);
  });

  it('returns to its spawn position when the ball is deep in the opponent half and far away', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.addBot(room, 2400); // slot 1, team B — attacks the left side; high elo -> no aim noise

    const botBody = room.physics.players[1];
    const ball = room.physics.ball;

    // ball deep in team B's attacking half (left side), bot far away near its own goal
    Matter.Body.setPosition(ball, { x: 50, y: room.map.height / 2 });
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.Body.setPosition(botBody, { x: room.map.width - 50, y: room.map.height / 2 });

    computeBotInput(room, 1);

    expect(room.botState[1].mode).toBe('RETURN_TO_POSITION');
    expect(room.botState[1].target).toEqual(room.physics.playerStarts[1]);
  });
});
