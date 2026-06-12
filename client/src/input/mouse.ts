import type { Vec2 } from '@shared/types';
import { isTeleportMode, disableTeleportMode } from './keyboard';

let canvas: HTMLCanvasElement | null = null;
let mouseScreenX = 0;
let mouseScreenY = 0;
let pendingTeleport: Vec2 | null = null;

export function initMouse(c: HTMLCanvasElement) {
  canvas = c;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('mousemove', (e) => {
    mouseScreenX = e.clientX;
    mouseScreenY = e.clientY;
  });

  window.addEventListener('click', (e) => {
    if (!isTeleportMode()) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (world) {
      pendingTeleport = world;
      disableTeleportMode();
    }
  });
}

export function screenToWorld(screenX: number, screenY: number): Vec2 | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (screenX - rect.left) * (canvas.width / rect.width),
    y: (screenY - rect.top)  * (canvas.height / rect.height),
  };
}

export function getMouseWorldPos(): Vec2 {
  return screenToWorld(mouseScreenX, mouseScreenY) ?? { x: 0, y: 0 };
}

export function getMouseAngle(playerPos: Vec2): number {
  const m = getMouseWorldPos();
  return Math.atan2(m.y - playerPos.y, m.x - playerPos.x);
}

// one-shot: clears after reading
export function getPendingTeleport(): Vec2 | null {
  const t = pendingTeleport;
  pendingTeleport = null;
  return t;
}
