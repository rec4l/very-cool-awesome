export type Vec2 = { x: number; y: number };

// Team membership — every player belongs to exactly one team.
// In 1v1: slot 0 → team A, slot 1 → team B.
// In 2v2: slots 0 & 1 → team A, slots 2 & 3 → team B.
export type Team = 'A' | 'B';

export type PlayerInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boosting: boolean;
  teleportTarget: Vec2 | null;
  pickaxeActive: boolean;
  pickaxeAngle: number;
};

export type RoomState = 'waiting' | 'lobby' | 'countdown' | 'playing' | 'postgame';

// Per-player slice of the game state sent every tick.
export type PlayerGameState = {
  slot: number;   // 0-indexed seat — stable for the match lifetime
  team: Team;
  position: Vec2;
  powerUps: { boostBar: number; teleportCooldown: number; teleportCharges: number; teleported: boolean };
  wreckingBall: { active: boolean; position: Vec2; velocity: Vec2 };
};

export type GameState = {
  players: PlayerGameState[];
  ball: Vec2;
  score: { A: number; B: number };
  matchSeconds: number;
  pickups: Array<{ x: number; y: number; active: boolean }>;
};

export type GuestPlayer = {
  id: string;
  name: string;
  slot: number;
  team: Team;
  color: number;
  faceId: string;
  // false while a mid-match disconnect is within its reconnect grace period (#11)
  connected: boolean;
  // AI-controlled players: synthetic id (`bot-${slot}`), no socket
  isBot?: boolean;
  // difficulty knob for bots, ignored for human players
  elo?: number;
};

export type PlayerStyle = { name: string; color: number; faceId: string };

// Names a ruleset rather than hardcoding its numbers inline.
// teamSize = players per team (1 for 1v1, 2 for 2v2, etc.).
export type GameMode = {
  id: string;
  name: string;
  maxPlayers: number;
  winScore: number;
  teamSize: number;
  friendlyFire?: boolean;
};

export type RoomInfo = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  state: RoomState;
};

export type MapWall = {
  x: number; y: number; w: number; h: number;
  // marks walls that physically frame a goal mouth — these are the ones
  // #13's dynamic goal growth rebuilds live around new bounds.
  role?: 'goalFrame';
};

export type MapGoal = {
  side: 'left' | 'right';
  yMin: number;
  yMax: number;
  // ball entering this goal awards a point to this team
  scoringTeam: Team;
};

export type MapDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: number;
  playerStarts: Vec2[];    // 1v1 spawn positions (2 entries)
  playerStarts4?: Vec2[];  // 2v2 spawn positions (4 entries); falls back to playerStarts if absent
  ballStart: Vec2;
  walls: MapWall[];
  goals: MapGoal[];
  pickupPositions: Vec2[];
  // depth (px) of recessed goal-box side walls, if present
  goalBoxDepth?: number;
  // 2x3 grid of candidate spawn points covering team A's (left) half of the
  // arena. At match start, startGame removes the cell nearest pickupPositions[0]
  // (so nobody spawns on top of the boost orb), then randomly picks 1 (1v1) or
  // 2 (2v2) of the remaining 5 for team A. Team B gets the same picks
  // point-reflected through the center of the field (x -> width - x,
  // y -> height - y), so the matchup is always symmetric — both left/right and
  // top/bottom — regardless of which spots were chosen.
  spawnGrid: Vec2[];
};

// Live goal-mouth bounds per side — changes during stalemate (#13).
export type GoalBounds = {
  left:  { yMin: number; yMax: number };
  right: { yMin: number; yMax: number };
};

export type LobbyPlayer = {
  name: string;
  slot: number;
  team: Team;
  ready: boolean;
  color: number;
  faceId: string;
  isBot?: boolean;
};

export type ServerToClientEvents = {
  assigned: (data: { slot: number; team: Team; map: MapDefinition; roomCode: string; maxPlayers: number; modeId: string }) => void;
  // keyed by slot number
  names: (data: Record<number, PlayerStyle>) => void;
  lobby_update: (data: { players: LobbyPlayer[]; maxPlayers: number; modeId: string; map: MapDefinition }) => void;
  map_changed: (data: { map: MapDefinition }) => void;
  mode_changed: (data: { modeId: string; maxPlayers: number; map: MapDefinition }) => void;
  room_not_found: () => void;
  state: (state: GameState) => void;
  goal: (data: { scoringTeam: Team; score: { A: number; B: number }; winner?: Team; matchSeconds?: number }) => void;
  countdown: (value: number | 'GO!') => void;
  goal_grow: (data: { goalBounds: GoalBounds }) => void;
  full: () => void;
  opponent_disconnected: () => void;
  player_left: (data: { slot: number; name: string; remainingCounts: { A: number; B: number } }) => void;
  // mid-match disconnect (#11) — game keeps running, the disconnected player's
  // body just stops responding to input until they reconnect or the grace period expires
  opponent_disconnected_temp: (data: { slot: number; name: string; graceMs: number }) => void;
  opponent_reconnected: (data: { slot: number; name: string }) => void;
  rematch_update: (data: { count: number; total: number }) => void;
};

export type ClientToServerEvents = {
  create_room: (data: { name: string; color: number; faceId: string; mode?: string }) => void;
  join_room: (data: { code: string; name: string; color: number; faceId: string }) => void;
  player_ready: () => void;
  force_start: () => void;
  rematch: () => void;
  leave_room: () => void;
  select_map: (data: { mapId: string }) => void;
  select_mode: (data: { modeId: string }) => void;
  swap_team: () => void;
  input: (input: PlayerInput) => void;
  change_name: (data: { name: string }) => void;
  add_bot: () => void;
  remove_bot: (data: { slot: number }) => void;
};
