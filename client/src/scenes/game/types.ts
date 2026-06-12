import type { GameState } from '@shared/types';

export type Snapshot = { state: GameState; time: number };

// Per-slot visual styles — keyed by slot number (0, 1, …).
export type PlayerStyles = Record<number, { color: number; faceId: string }>;
