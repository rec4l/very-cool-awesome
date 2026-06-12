import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@shared/types';
import { RoomManager } from './rooms';
import { startGame, shuffled, pickSpawns } from './game';
import { CLASSIC_1V1, TEAM_2V2 } from '@shared/modes';
import { classicMap } from '@shared/maps/classic';

describe('shuffled', () => {
  it('returns an empty array for n=0', () => {
    expect(shuffled(0)).toEqual([]);
  });

  it('returns a single-element array for n=1', () => {
    expect(shuffled(1)).toEqual([0]);
  });

  it('returns a permutation of 0..n-1, never out of range', () => {
    for (let n = 0; n <= 4; n++) {
      const expected = Array.from({ length: n }, (_, idx) => idx);
      for (let i = 0; i < 50; i++) {
        const result = shuffled(n);
        expect(result).toHaveLength(n);
        expect([...result].sort()).toEqual(expected);
      }
    }
  });
});

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// startGame only uses io.to(...).emit(...) before its 3.5s countdown fires —
// a stub with the same shape is enough, and fake timers keep that countdown
// (and the setInterval it eventually starts) from ever actually running.
function fakeIO(): IO {
  return { to: () => ({ emit: () => {} }) } as unknown as IO;
}

afterEach(() => {
  vi.useRealTimers();
});

// Regression test for the copy-link/Render bug: startGame's spawn remap used
// to do `baseSpawns[teamSize + bIdx[i]]` with a 0/1 shuffle regardless of team
// size, which read past the end of the 2-entry `playerStarts` array in 1v1 and
// left a player's spawn `undefined`, crashing `resetPositions`.
describe('startGame spawn remap', () => {
  it('1v1: assigns both slots a defined spawn from the spawn grid, point-reflected across the field', () => {
    vi.useFakeTimers();
    const manager = new RoomManager();

    // run many times — the old bug only triggered for ~half of random shuffles
    for (let i = 0; i < 50; i++) {
      const room = manager.createRoom('Host', `host-${i}`, 0x4fc3f7, 'happy', CLASSIC_1V1);
      manager.joinRoom(room.code, 'Guest', `guest-${i}`);
      room.state = 'lobby';

      startGame(fakeIO(), manager, room);

      // host = team A = slot 0, guest = team B = slot 1
      const hostSpawn = room.physics.playerStarts[0];
      const guestSpawn = room.physics.playerStarts[1];

      for (const spawn of [hostSpawn, guestSpawn]) {
        expect(spawn).toBeDefined();
        expect(Number.isFinite(spawn.x)).toBe(true);
        expect(Number.isFinite(spawn.y)).toBe(true);
      }
      // team B's spawn is team A's spawn point-reflected through the field center
      expect(guestSpawn).toEqual({ x: room.map.width - hostSpawn.x, y: room.map.height - hostSpawn.y });

      const hostBody = room.physics.players[0];
      expect(hostBody.position.x).toBeCloseTo(hostSpawn.x);
      expect(hostBody.position.y).toBeCloseTo(hostSpawn.y);
    }
  });

  it('2v2: each team gets 2 spawns from the grid, and team B is the point reflection of team A', () => {
    vi.useFakeTimers();
    const manager = new RoomManager();

    for (let i = 0; i < 20; i++) {
      const room = manager.createRoom('Host', `host-${i}`, 0x4fc3f7, 'happy', TEAM_2V2);
      manager.joinRoom(room.code, 'GuestA', `guestA-${i}`);
      manager.joinRoom(room.code, 'GuestB', `guestB-${i}`);
      manager.joinRoom(room.code, 'GuestC', `guestC-${i}`);
      room.state = 'lobby';

      startGame(fakeIO(), manager, room);

      const teamA = room.players.filter((p) => p.team === 'A');
      const teamB = room.players.filter((p) => p.team === 'B');
      const spawnsA = teamA.map((p) => room.physics.playerStarts[p.slot]);
      const spawnsB = teamB.map((p) => room.physics.playerStarts[p.slot]);

      for (const spawn of [...spawnsA, ...spawnsB]) {
        expect(spawn).toBeDefined();
        expect(Number.isFinite(spawn.x)).toBe(true);
        expect(Number.isFinite(spawn.y)).toBe(true);
      }

      // team A's two spawns are distinct, and team B's are their point reflections
      expect(spawnsA[0]).not.toEqual(spawnsA[1]);
      const mirroredA = spawnsA.map((cell) => ({ x: room.map.width - cell.x, y: room.map.height - cell.y }));
      for (const spawn of spawnsB) {
        expect(mirroredA).toContainEqual(spawn);
      }
    }
  });
});

// Stage 13 (#8 + #9): spawns now come from a 2x3 grid per map, minus the cell
// closest to the boost orb, point-reflected through the center between teams
// for left/right AND top/bottom symmetry.
describe('pickSpawns', () => {
  // classicMap.spawnGrid[0] = {x:200,y:160} sits right next to the left boost
  // orb at (240,200) and should always be excluded.
  const candidates = classicMap.spawnGrid.slice(1);

  it('1v1: picks 1 spot from the candidates (excluding the cell nearest the boost orb)', () => {
    for (let i = 0; i < 50; i++) {
      const { teamA, teamB } = pickSpawns(classicMap, 1);
      expect(teamA).toHaveLength(1);
      expect(teamB).toHaveLength(1);
      expect(candidates).toContainEqual(teamA[0]);
      expect(teamA[0]).not.toEqual(classicMap.spawnGrid[0]);
      // team B is team A's pick point-reflected through the field center
      expect(teamB[0]).toEqual({ x: classicMap.width - teamA[0].x, y: classicMap.height - teamA[0].y });
    }
  });

  it('2v2: picks 2 distinct spots for team A and point-reflects both for team B', () => {
    for (let i = 0; i < 50; i++) {
      const { teamA, teamB } = pickSpawns(classicMap, 2);
      expect(teamA).toHaveLength(2);
      expect(teamB).toHaveLength(2);
      expect(teamA[0]).not.toEqual(teamA[1]);
      for (const cell of teamA) {
        expect(candidates).toContainEqual(cell);
        expect(cell).not.toEqual(classicMap.spawnGrid[0]);
      }
      const mirroredA = teamA.map((cell) => ({ x: classicMap.width - cell.x, y: classicMap.height - cell.y }));
      for (const cell of teamB) {
        expect(mirroredA).toContainEqual(cell);
      }
    }
  });
});
