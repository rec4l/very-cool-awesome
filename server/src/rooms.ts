import type { GuestPlayer, PlayerInput, RoomState, MapDefinition, GameMode, GoalBounds, Vec2 } from '@shared/types';
import Matter from 'matter-js';
import { createPhysics, applyInputs, stepWorld } from './physics';
import { classicMap } from '@shared/maps/classic';
import { initialGoalBounds } from '@shared/maps/goalFrame';
import { DEFAULT_MODE } from '@shared/modes';
import { TICK_MS, BOOST_MAX, MAX_TELEPORT_CHARGES } from '@shared/constants';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function defaultInput(): PlayerInput {
  return {
    up: false, down: false, left: false, right: false,
    boosting: false, teleportTarget: null,
    pickaxeActive: false, pickaxeAngle: 0,
  };
}

export type WreckingBallState = {
  body: Matter.Body | null;
  chain: Matter.Constraint | null;
  prevActive: boolean;
  retracting: boolean;
  maxDist: number;
  launchTicks: number;
};

export type PlayerPowerUps = {
  boostBar: number;
  teleportCooldown: number;
  teleportCharges: number;
  teleported: boolean; // one-shot flag — true only on the tick a teleport executes
  wreckingBall: WreckingBallState;
};

export type Pickup = {
  x: number;
  y: number;
  active: boolean;
  respawnTimer: number;
};

// All per-player state is indexed by slot (0-based).
// Arrays are pre-allocated to mode.maxPlayers on room creation.
export type Room = {
  code: string;
  state: RoomState;
  mode: GameMode;
  map: MapDefinition;
  players: GuestPlayer[];
  inputs: PlayerInput[];           // indexed by slot
  score: { A: number; B: number };
  matchTicks: number;
  goalBounds: GoalBounds;
  stalemateTicks: number;
  ready: boolean[];                // indexed by slot
  powerUps: PlayerPowerUps[];      // indexed by slot
  pickups: Pickup[];
  physics: ReturnType<typeof createPhysics>;
  loop: ReturnType<typeof setInterval> | null;
  // per-slot grace-period timers for mid-match disconnects (#11)
  reconnectTimers: (ReturnType<typeof setTimeout> | null)[];
};

// Pure roster queries shared by index.ts (lobby start gating, disconnect handling).
// Live here rather than in index.ts so they can be unit-tested without importing
// the server entrypoint (which calls httpServer.listen on import).
export function hasBothTeams(room: Room): boolean {
  return room.players.some((p) => p.team === 'A') && room.players.some((p) => p.team === 'B');
}

export function canStart(room: Room): boolean {
  const countA = room.players.filter((p) => p.team === 'A').length;
  const countB = room.players.filter((p) => p.team === 'B').length;
  return room.players.length >= 2
    && hasBothTeams(room)
    && countA <= room.mode.teamSize
    && countB <= room.mode.teamSize
    && room.players.every((p) => room.ready[p.slot]);
}

export function remainingWinner(room: Room): 'A' | 'B' | null {
  const hasA = room.players.some((p) => p.team === 'A');
  const hasB = room.players.some((p) => p.team === 'B');
  if (hasA && !hasB) return 'A';
  if (hasB && !hasA) return 'B';
  return null;
}

export function defaultPowerUps(): PlayerPowerUps {
  return {
    boostBar: 0, teleportCooldown: 0, teleportCharges: 0, teleported: false,
    wreckingBall: { body: null, chain: null, prevActive: false, retracting: false, maxDist: 0, launchTicks: 0 },
  };
}

export function defaultPickups(map: MapDefinition = classicMap): Pickup[] {
  return map.pickupPositions.map((pos) => ({ x: pos.x, y: pos.y, active: true, respawnTimer: 0 }));
}

// Picks the right spawn array for the mode: 4-player starts if available and needed,
// otherwise falls back to the standard 2-player starts.
export function resolvePlayerStarts(map: MapDefinition, mode: GameMode): Vec2[] {
  if (mode.maxPlayers > 2 && map.playerStarts4) return map.playerStarts4;
  return map.playerStarts;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(playerName: string, socketId: string, color = 0x4fc3f7, faceId = 'happy', mode = DEFAULT_MODE): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room: Room = {
      code,
      state: 'waiting',
      mode,
      map: classicMap,
      // host is always slot 0, team A
      players: [{ id: socketId, name: playerName, slot: 0, team: 'A', color, faceId, connected: true }],
      inputs:   Array.from({ length: mode.maxPlayers }, () => defaultInput()),
      score:    { A: 0, B: 0 },
      matchTicks: 0,
      goalBounds: initialGoalBounds(classicMap),
      stalemateTicks: 0,
      ready:    Array.from({ length: mode.maxPlayers }, () => false),
      powerUps: Array.from({ length: mode.maxPlayers }, () => defaultPowerUps()),
      pickups:  defaultPickups(classicMap),
      physics:  createPhysics(classicMap, resolvePlayerStarts(classicMap, mode)),
      loop: null,
      reconnectTimers: Array.from({ length: mode.maxPlayers }, () => null),
    };

    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code: string, playerName: string, socketId: string, color = 0xff7043, faceId = 'happy'): Room | 'not_found' | 'full' {
    const room = this.rooms.get(code);
    if (!room) return 'not_found';
    if (room.players.length >= room.mode.maxPlayers) return 'full';

    const taken = new Set(room.players.map((p) => p.slot));
    let slot = 0;
    while (taken.has(slot) && slot < room.mode.maxPlayers) slot++;
    if (slot >= room.mode.maxPlayers) return 'full';
    const team = slot < room.mode.teamSize ? 'A' : 'B';
    room.players.push({ id: socketId, name: playerName, slot, team, color, faceId, connected: true });
    return room;
  }

  setMode(room: Room, mode: GameMode): boolean {
    if (room.players.length > mode.maxPlayers) return false;
    room.mode = mode;
    for (const player of room.players) {
      player.team = player.slot < mode.teamSize ? 'A' : 'B';
    }
    room.inputs = Array.from({ length: mode.maxPlayers }, (_, i) => room.inputs[i] ?? defaultInput());
    room.ready = Array.from({ length: mode.maxPlayers }, () => false);
    room.powerUps = Array.from({ length: mode.maxPlayers }, (_, i) => room.powerUps[i] ?? defaultPowerUps());
    room.physics = createPhysics(room.map, resolvePlayerStarts(room.map, mode));
    room.reconnectTimers = Array.from({ length: mode.maxPlayers }, (_, i) => room.reconnectTimers[i] ?? null);
    return true;
  }

  swapTeam(socketId: string): Room | null {
    const room = this.getRoomByPlayer(socketId);
    if (!room || room.state !== 'lobby') return null;
    const player = room.players.find((p) => p.id === socketId);
    if (!player) return null;
    player.team = player.team === 'A' ? 'B' : 'A';
    room.ready = Array.from({ length: room.mode.maxPlayers }, () => false);
    return room;
  }

  startLoop(room: Room, onTick: (room: Room) => void) {
    room.state = 'playing';
    room.loop = setInterval(() => {
      onTick(room);
    }, TICK_MS);
  }

  stopLoop(room: Room) {
    if (room.loop) { clearInterval(room.loop); room.loop = null; }
  }

  removePlayer(
    socketId: string,
    callbacks: {
      onRosterChanged?: (room: Room, departed: GuestPlayer) => void;
      onRoomClosed?: (room: Room) => void;
      onMatchEnded?: (room: Room) => void;
    }
  ): void {
    for (const [, room] of this.rooms) {
      const idx = room.players.findIndex((p) => p.id === socketId);
      if (idx === -1) continue;
      const player = room.players[idx];
      const wasHost = player.slot === 0;

      room.players.splice(idx, 1);
      room.ready[player.slot] = false;
      room.inputs[player.slot] = defaultInput();

      const pendingTimer = room.reconnectTimers[player.slot];
      if (pendingTimer) clearTimeout(pendingTimer);
      room.reconnectTimers[player.slot] = null;

      const pu = room.powerUps[player.slot];
      if (pu?.wreckingBall.body) {
        Matter.Composite.remove(room.physics.engine.world, pu.wreckingBall.body);
        pu.wreckingBall.body = null;
        pu.wreckingBall.chain = null;
      }

      if (room.players.length === 0) {
        this.stopLoop(room);
        this.rooms.delete(room.code);
        return;
      }

      if (room.state === 'playing' || room.state === 'countdown') {
        const body = room.physics.players[player.slot];
        if (body) Matter.Composite.remove(room.physics.engine.world, body);

        const hasA = room.players.some((p) => p.team === 'A');
        const hasB = room.players.some((p) => p.team === 'B');
        if (!hasA || !hasB) {
          this.stopLoop(room);
          room.state = 'postgame';
          callbacks.onMatchEnded?.(room);
        } else {
          callbacks.onRosterChanged?.(room, player);
        }
        return;
      }

      if (wasHost) {
        this.stopLoop(room);
        callbacks.onRoomClosed?.(room);
        this.rooms.delete(room.code);
      } else {
        callbacks.onRosterChanged?.(room, player);
      }
      return;
    }
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomByPlayer(socketId: string): Room | undefined {
    for (const [, room] of this.rooms) {
      if (room.players.some((p) => p.id === socketId)) return room;
    }
    return undefined;
  }
}

// defaultPickups and defaultPowerUps are exported directly above
