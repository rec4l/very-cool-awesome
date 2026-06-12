import { io } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@shared/types';

// In dev, VITE_SERVER_URL is set to http://localhost:3001 via .env.development.
// In production, it is unset and socket.io connects to the current origin (same server).
const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export const socket = (
  SERVER_URL
    ? io(SERVER_URL, { autoConnect: false })
    : io({ autoConnect: false })
) as import('socket.io-client').Socket<ServerToClientEvents, ClientToServerEvents>;
