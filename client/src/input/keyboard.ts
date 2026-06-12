let teleportModeActive = false;

const keys = {
  up: false, down: false, left: false, right: false,
  boosting: false, pickaxeActive: false,
};

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'ArrowUp'    || k === 'w') keys.up    = true;
  if (e.key === 'ArrowDown'  || k === 's') keys.down  = true;
  if (e.key === 'ArrowLeft'  || k === 'a') keys.left  = true;
  if (e.key === 'ArrowRight' || k === 'd') keys.right = true;
  if (e.key === 'Shift')                   keys.boosting      = true;
  if (k === 'e')                           keys.pickaxeActive = true;
  // !e.repeat: only toggle on the leading edge — holding Q fires auto-repeat
  // keydowns that would otherwise spam the toggle on/off many times a second
  if (k === 'q' && !e.repeat)              teleportModeActive = !teleportModeActive;
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'ArrowUp'    || k === 'w') keys.up    = false;
  if (e.key === 'ArrowDown'  || k === 's') keys.down  = false;
  if (e.key === 'ArrowLeft'  || k === 'a') keys.left  = false;
  if (e.key === 'ArrowRight' || k === 'd') keys.right = false;
  if (e.key === 'Shift')                   keys.boosting      = false;
  if (k === 'e')                           keys.pickaxeActive = false;
});

window.addEventListener('blur', () => {
  keys.up = false; keys.down = false; keys.left = false; keys.right = false;
  keys.boosting = false; keys.pickaxeActive = false;
  teleportModeActive = false;
});

export function getKeyState() { return { ...keys }; }
export function isTeleportMode() { return teleportModeActive; }
export function disableTeleportMode() { teleportModeActive = false; }
