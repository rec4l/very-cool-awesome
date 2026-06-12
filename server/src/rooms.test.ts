import { describe, it, expect } from 'vitest';
import { RoomManager, hasBothTeams, canStart, remainingWinner } from './rooms';
import { CLASSIC_1V1, TEAM_2V2 } from '@shared/modes';

describe('RoomManager.createRoom / joinRoom', () => {
  it('creates a room with the host in slot 0, team A', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ id: 'host-id', slot: 0, team: 'A' });
    expect(room.mode).toBe(CLASSIC_1V1); // DEFAULT_MODE
  });

  it('assigns the second player to slot 1, team B in 1v1', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    const result = manager.joinRoom(room.code, 'Guest', 'guest-id');
    expect(result).not.toBe('not_found');
    expect(result).not.toBe('full');
    const joined = result as typeof room;
    const guest = joined.players.find((p) => p.id === 'guest-id')!;
    expect(guest.slot).toBe(1);
    expect(guest.team).toBe('B');
  });

  it('returns "not_found" for an unknown room code', () => {
    const manager = new RoomManager();
    expect(manager.joinRoom('ZZZZ', 'Guest', 'guest-id')).toBe('not_found');
  });

  it('returns "full" once the room reaches mode.maxPlayers', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id'); // 1v1, maxPlayers = 2
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    expect(manager.joinRoom(room.code, 'Third', 'third-id')).toBe('full');
  });
});

describe('RoomManager.setMode', () => {
  it('switches to 2v2, resizing per-slot arrays and reassigning teams by slot', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');

    expect(manager.setMode(room, TEAM_2V2)).toBe(true);

    expect(room.mode).toBe(TEAM_2V2);
    expect(room.inputs).toHaveLength(TEAM_2V2.maxPlayers);
    expect(room.ready).toHaveLength(TEAM_2V2.maxPlayers);
    expect(room.powerUps).toHaveLength(TEAM_2V2.maxPlayers);

    // teamSize=2 in 2v2: slots 0-1 -> team A, slots 2-3 -> team B
    for (const player of room.players) {
      expect(player.team).toBe(player.slot < TEAM_2V2.teamSize ? 'A' : 'B');
    }
  });

  it('refuses to switch to a mode with fewer max players than current roster', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    manager.setMode(room, TEAM_2V2);
    manager.joinRoom(room.code, 'Third', 'third-id');
    manager.joinRoom(room.code, 'Fourth', 'fourth-id');

    expect(manager.setMode(room, CLASSIC_1V1)).toBe(false);
    expect(room.mode).toBe(TEAM_2V2); // unchanged
  });
});

describe('RoomManager.swapTeam', () => {
  it('toggles a player between team A and B and clears ready state', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'lobby';
    room.ready[0] = true;
    room.ready[1] = true;

    const updated = manager.swapTeam('guest-id');
    expect(updated).toBe(room);
    const guest = room.players.find((p) => p.id === 'guest-id')!;
    expect(guest.team).toBe('A');
    expect(room.ready).toEqual([false, false]);
  });

  it('does nothing outside the lobby state', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'playing';

    expect(manager.swapTeam('guest-id')).toBeNull();
    const guest = room.players.find((p) => p.id === 'guest-id')!;
    expect(guest.team).toBe('B'); // unchanged
  });
});

describe('RoomManager.removePlayer', () => {
  it('deletes the room entirely when the last player leaves', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');

    manager.removePlayer('host-id', {});
    expect(manager.getRoom(room.code)).toBeUndefined();
  });

  it('closes the room when the host leaves the lobby', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'lobby';

    let closed = false;
    manager.removePlayer('host-id', { onRoomClosed: () => { closed = true; } });

    expect(closed).toBe(true);
    expect(manager.getRoom(room.code)).toBeUndefined();
  });

  it('keeps the room open and notifies roster change when a non-host leaves the lobby', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'lobby';

    let departedName: string | undefined;
    manager.removePlayer('guest-id', {
      onRosterChanged: (_room, departed) => { departedName = departed.name; },
    });

    expect(manager.getRoom(room.code)).toBeDefined();
    expect(room.players).toHaveLength(1);
    expect(departedName).toBe('Guest');
  });

  it('ends the match when a mid-game departure leaves one team empty', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'playing';

    let matchEnded = false;
    manager.removePlayer('guest-id', { onMatchEnded: () => { matchEnded = true; } });

    expect(matchEnded).toBe(true);
    expect(room.state).toBe('postgame');
  });

  it('keeps the match running and reports the departed player when both teams still have players', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'GuestA', 'guestA-id');
    manager.joinRoom(room.code, 'GuestB', 'guestB-id');
    manager.setMode(room, TEAM_2V2); // slots 0,1 -> A; slots 2,3 -> B
    manager.joinRoom(room.code, 'GuestC', 'guestC-id');
    room.state = 'playing';

    let departedSlot: number | undefined;
    manager.removePlayer('guestA-id', {
      onRosterChanged: (_room, departed) => { departedSlot = departed.slot; },
    });

    expect(room.state).toBe('playing');
    expect(departedSlot).toBe(1);
    expect(room.players.some((p) => p.team === 'A')).toBe(true);
    expect(room.players.some((p) => p.team === 'B')).toBe(true);
  });
});

describe('hasBothTeams', () => {
  it('is false with only one player (only team A)', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    expect(hasBothTeams(room)).toBe(false);
  });

  it('is true once a team-B player joins', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    expect(hasBothTeams(room)).toBe(true);
  });
});

describe('canStart', () => {
  it('is false until both players are ready', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    room.state = 'lobby';

    expect(canStart(room)).toBe(false);
    room.ready[0] = true;
    expect(canStart(room)).toBe(false);
    room.ready[1] = true;
    expect(canStart(room)).toBe(true);
  });

  it('is false with only one player even if "ready"', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    room.state = 'lobby';
    room.ready[0] = true;

    expect(canStart(room)).toBe(false);
  });

  it('is false in 2v2 if a team has more players than mode.teamSize', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    manager.setMode(room, TEAM_2V2); // host+guest both land on team A (slots 0,1 < teamSize 2)
    room.state = 'lobby';
    room.ready[0] = true;
    room.ready[1] = true;

    // team A has 2 players (OK, teamSize=2) but team B has 0 -> hasBothTeams is false
    expect(hasBothTeams(room)).toBe(false);
    expect(canStart(room)).toBe(false);
  });

  it('is true in 2v2 once both teams are full and ready', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'GuestA', 'guestA-id');
    manager.setMode(room, TEAM_2V2);
    manager.joinRoom(room.code, 'GuestB', 'guestB-id');
    manager.joinRoom(room.code, 'GuestC', 'guestC-id');
    room.state = 'lobby';
    room.ready = room.ready.map(() => true);

    expect(canStart(room)).toBe(true);
  });
});

describe('remainingWinner', () => {
  it('returns null when both teams still have players', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id');
    manager.joinRoom(room.code, 'Guest', 'guest-id');
    expect(remainingWinner(room)).toBeNull();
  });

  it('returns the surviving team when the other team is empty', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Host', 'host-id'); // slot 0, team A
    manager.joinRoom(room.code, 'Guest', 'guest-id'); // slot 1, team B
    room.state = 'playing';

    manager.removePlayer('guest-id', {});
    expect(remainingWinner(room)).toBe('A');
  });
});
