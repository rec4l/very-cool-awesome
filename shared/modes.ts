import type { GameMode } from './types';
import { WIN_SCORE } from './constants';

// Today's 1v1 mode. teamSize=1 means each team has exactly one player.
export const CLASSIC_1V1: GameMode = {
  id: 'classic-1v1',
  name: 'Classic 1v1',
  maxPlayers: 2,
  winScore: WIN_SCORE,
  teamSize: 1,
};

// 2v2 team mode — reserved for Phase 4. Defined here so the type is registered
// and the room/game loop can be threaded through without a rewrite when it ships.
export const TEAM_2V2: GameMode = {
  id: 'team-2v2',
  name: 'Team 2v2',
  maxPlayers: 4,
  winScore: 7,
  teamSize: 2,
  friendlyFire: false,
};

// The mode every room currently launches with — swap this out (or make it
// selectable) once additional modes actually exist.
export const DEFAULT_MODE: GameMode = CLASSIC_1V1;
