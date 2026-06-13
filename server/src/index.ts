import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, PlayerInput, LobbyPlayer, GuestPlayer } from '@shared/types';
import { MAPS } from '@shared/maps/index';
import { CLASSIC_1V1, TEAM_2V2, DEFAULT_MODE } from '@shared/modes';
import type { GameMode } from '@shared/types';
import { RECONNECT_GRACE_MS } from '@shared/constants';
import { resetPositions, createPhysics, initRoundGoalBounds } from './physics';
import { RoomManager, defaultPickups, defaultPowerUps, defaultBotState, defaultInput, resolvePlayerStarts, canStart, remainingWinner, allVotedRematch, type Room } from './rooms';
import { startGame, cleanupWreckingBalls } from './game';

const app = express();
const httpServer = createServer(app);

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use(express.static(path.resolve(__dirname, '../../client/dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../client/dist/index.html'));
});
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
  // (#11) lets a briefly-dropped socket (wifi blip, backgrounded tab) reconnect
  // with the same socket.id within the grace window — see disconnect/connection handlers below
  connectionStateRecovery: { maxDisconnectionDuration: RECONNECT_GRACE_MS },
});

type IO = typeof io;

const PORT = process.env.PORT ?? 3001;
const manager = new RoomManager();

const MODE_BY_ID: Record<string, GameMode> = {
  [CLASSIC_1V1.id]: CLASSIC_1V1,
  [TEAM_2V2.id]:    TEAM_2V2,
};

function emitLobbyUpdate(io: IO, room: Room) {
  const players: LobbyPlayer[] = room.players.map((p) => ({
    name:   p.name,
    slot:   p.slot,
    team:   p.team,
    ready:  room.ready[p.slot],
    color:  p.color,
    faceId: p.faceId,
    isBot:  p.isBot,
  }));
  io.to(room.code).emit('lobby_update', {
    players,
    maxPlayers: room.mode.maxPlayers,
    modeId: room.mode.id,
    map: room.map,
  });
}

function handlePlayerRemoved(room: Room, departed?: GuestPlayer) {
  if (room.state === 'lobby') {
    emitLobbyUpdate(io, room);
    return;
  }
  if (room.state === 'postgame') {
    emitRematchUpdate(room);
    if (allVotedRematch(room)) performRematchReset(room);
    return;
  }
  if ((room.state === 'playing' || room.state === 'countdown') && departed) {
    const countA = room.players.filter((p) => p.team === 'A').length;
    const countB = room.players.filter((p) => p.team === 'B').length;
    io.to(room.code).emit('player_left', {
      slot: departed.slot,
      name: departed.name,
      remainingCounts: { A: countA, B: countB },
    });
  }
}

function handleRoomClosed(room: Room) {
  io.to(room.code).emit('opponent_disconnected');
}

function emitRematchUpdate(room: Room) {
  io.to(room.code).emit('rematch_update', {
    count: room.players.filter((p) => room.rematchVotes[p.slot]).length,
    total: room.players.length,
  });
}

function performRematchReset(room: Room) {
  cleanupWreckingBalls(room);
  manager.stopLoop(room);
  room.state      = 'lobby';
  room.score      = { A: 0, B: 0 };
  room.matchTicks = 0;
  room.stalemateTicks = 0;
  room.ready    = Array.from({ length: room.mode.maxPlayers }, () => false);
  room.rematchVotes = Array.from({ length: room.mode.maxPlayers }, () => false);
  room.inputs   = Array.from({ length: room.mode.maxPlayers }, () => ({
    up: false, down: false, left: false, right: false,
    boosting: false, teleportTarget: null, pickaxeActive: false, pickaxeAngle: 0,
  }));
  room.powerUps = Array.from({ length: room.mode.maxPlayers }, () => defaultPowerUps());
  room.botState = Array.from({ length: room.mode.maxPlayers }, () => defaultBotState());
  room.pickups  = defaultPickups(room.map);
  room.physics  = createPhysics(room.map, resolvePlayerStarts(room.map, room.mode));
  room.goalBounds = initRoundGoalBounds(room.physics, room.map);
  resetPositions(room.physics);
  // (#11) clear any pending reconnect grace timers and mark everyone present as connected
  for (const player of room.players) {
    clearReconnectTimer(room, player.slot);
    player.connected = true;
  }
  emitLobbyUpdate(io, room);
  console.log(`rematch in room ${room.code}`);
}

function clearReconnectTimer(room: Room, slot: number) {
  const timer = room.reconnectTimers[slot];
  if (timer) clearTimeout(timer);
  room.reconnectTimers[slot] = null;
}

function handleDisconnectGracePeriodExpired(room: Room, player: GuestPlayer) {
  room.reconnectTimers[player.slot] = null;
  if (player.connected) return; // reconnected before the timer fired
  manager.removePlayer(player.id, {
    onRosterChanged: handlePlayerRemoved,
    onRoomClosed: handleRoomClosed,
    onMatchEnded: handleMatchEnded,
  });
}

function handleMatchEnded(room: Room) {
  const winner = remainingWinner(room);
  if (!winner) {
    io.to(room.code).emit('opponent_disconnected');
    return;
  }
  io.to(room.code).emit('goal', {
    scoringTeam: winner,
    score: { ...room.score },
    winner,
  });
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id, socket.recovered ? '(recovered)' : '');

  // (#11) a socket that recovered its session within the grace window is the
  // same player reconnecting mid-match — cancel their pending removal and let
  // them resume in their old slot.
  if (socket.recovered) {
    const room = manager.getRoomByPlayer(socket.id);
    const player = room?.players.find((p) => p.id === socket.id);
    if (room && player && !player.connected) {
      clearReconnectTimer(room, player.slot);
      player.connected = true;
      io.to(room.code).emit('opponent_reconnected', { slot: player.slot, name: player.name });
    }
  }

  socket.on('create_room', ({ name, color, faceId, mode: modeId }) => {
    const mode: GameMode = (modeId ? MODE_BY_ID[modeId] : undefined) ?? DEFAULT_MODE;
    const room = manager.createRoom(name, socket.id, color ?? 0x4fc3f7, faceId ?? 'happy', mode);
    socket.join(room.code);
    room.state = 'lobby';
    socket.emit('assigned', { slot: 0, team: 'A', map: room.map, roomCode: room.code, maxPlayers: mode.maxPlayers, modeId: mode.id });
    emitLobbyUpdate(io, room);
    console.log(`room ${room.code} created by ${name} (${mode.id})`);
  });

  socket.on('join_room', ({ code, name, color, faceId }) => {
    const result = manager.joinRoom(code.toUpperCase(), name, socket.id, color ?? 0xff7043, faceId ?? 'happy');
    if (result === 'not_found') { socket.emit('room_not_found'); return; }
    if (result === 'full')      { socket.emit('full');           return; }
    socket.join(result.code);
    const joiner = result.players[result.players.length - 1];
    socket.emit('assigned', {
      slot: joiner.slot, team: joiner.team, map: result.map,
      roomCode: result.code, maxPlayers: result.mode.maxPlayers, modeId: result.mode.id,
    });
    result.state = 'lobby';
    emitLobbyUpdate(io, result);
    console.log(`${name} joined room ${result.code} (slot ${joiner.slot})`);
  });

  socket.on('player_ready', () => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    room.ready[player.slot] = true;
    emitLobbyUpdate(io, room);

    if (canStart(room)) startGame(io, manager, room);
  });

  socket.on('select_mode', ({ modeId }) => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player?.slot !== 0) return; // host only
    const mode = MODE_BY_ID[modeId];
    if (!mode) return;
    if (!manager.setMode(room, mode)) return;
    room.pickups = defaultPickups(room.map);
    room.goalBounds = initRoundGoalBounds(room.physics, room.map);
    room.stalemateTicks = 0;
    io.to(room.code).emit('mode_changed', { modeId: mode.id, maxPlayers: mode.maxPlayers, map: room.map });
    emitLobbyUpdate(io, room);
    console.log(`room ${room.code} mode -> ${mode.id}`);
  });

  socket.on('select_map', ({ mapId }) => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player?.slot !== 0) return; // host only
    const newMap = MAPS[mapId];
    if (!newMap) return;
    room.map     = newMap;
    room.physics = createPhysics(newMap, resolvePlayerStarts(newMap, room.mode));
    room.pickups = defaultPickups(newMap);
    room.goalBounds   = initRoundGoalBounds(room.physics, newMap);
    room.stalemateTicks = 0;
    io.to(room.code).emit('map_changed', { map: newMap });
    console.log(`room ${room.code} map → ${mapId}`);
  });

  socket.on('force_start', () => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player?.slot !== 0) return; // host only
    if (!canStart(room)) return;
    startGame(io, manager, room);
  });

  socket.on('rematch', () => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'postgame') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    room.rematchVotes[player.slot] = true;
    emitRematchUpdate(room);

    if (allVotedRematch(room)) performRematchReset(room);
  });

  socket.on('leave_room', () => {
    manager.removePlayer(socket.id, {
      onRosterChanged: handlePlayerRemoved,
      onRoomClosed: handleRoomClosed,
      onMatchEnded: handleMatchEnded,
    });
  });

  socket.on('add_bot', () => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player?.slot !== 0) return; // host only
    if (manager.addBot(room) === 'full') return;
    emitLobbyUpdate(io, room);
  });

  socket.on('remove_bot', ({ slot }) => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (player?.slot !== 0) return; // host only
    if (!manager.removeBot(room, slot)) return;
    emitLobbyUpdate(io, room);
  });

  socket.on('swap_team', () => {
    const room = manager.swapTeam(socket.id);
    if (!room) return;
    emitLobbyUpdate(io, room);
  });

  socket.on('change_name', ({ name }) => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player || !name) return;
    player.name = name;
    emitLobbyUpdate(io, room);
  });

  socket.on('input', (input: PlayerInput) => {
    const room = manager.getRoomByPlayer(socket.id);
    if (!room || room.state === 'postgame') return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    room.inputs[player.slot] = input;
  });

  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id);

    const room = manager.getRoomByPlayer(socket.id);
    const player = room?.players.find((p) => p.id === socket.id);

    // (#11) mid-match drop: give them a grace period to reconnect (Socket.IO
    // connection state recovery) instead of removing them immediately. The
    // game keeps running — their input is cleared so their body just sits there.
    if (room && player && (room.state === 'playing' || room.state === 'countdown')) {
      player.connected = false;
      room.inputs[player.slot] = defaultInput();
      io.to(room.code).emit('opponent_disconnected_temp', {
        slot: player.slot, name: player.name, graceMs: RECONNECT_GRACE_MS,
      });
      clearReconnectTimer(room, player.slot);
      room.reconnectTimers[player.slot] = setTimeout(
        () => handleDisconnectGracePeriodExpired(room, player),
        RECONNECT_GRACE_MS
      );
      return;
    }

    manager.removePlayer(socket.id, {
      onRosterChanged: handlePlayerRemoved,
      onRoomClosed: handleRoomClosed,
      onMatchEnded: handleMatchEnded,
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
