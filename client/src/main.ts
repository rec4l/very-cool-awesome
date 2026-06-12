import { socket } from './network/socket';
import { getKeyState } from './input/keyboard';
import { initMouse, getMouseAngle, getPendingTeleport } from './input/mouse';
import { TICK_MS } from '@shared/constants';
import type { PlayerInput, LobbyPlayer, Team } from '@shared/types';
import type { MapDefinition } from '@shared/types';
import { COLORS, savePrefs, initSettings, getSelectedColor, getSelectedFace } from './ui/settings';
import { applyButtonArt, setReadyButtonArt } from './ui/buttonArt';
import {
  initGame,
  setWaiting,
  receiveState,
  receiveCountdown,
  receiveGoal,
  receiveWinner,
  receiveNames,
  receiveGoalGrow,
  receiveOpponentDisconnected,
  receiveOpponentDisconnectedTemp,
  receiveOpponentReconnected,
  receivePlayerLeft,
  resetGame,
  getLocalPlayerPos,
} from './scenes/Game';
import { playWin } from './audio/sounds';
import { startMenuAnimation, stopMenuAnimation } from './scenes/MainMenu';
import { startHowToAnimation, stopHowToAnimation } from './scenes/HowToPlay';
import { captureAbilityLabels } from './dev/captureAbilityLabels';
import { initMuteButton } from './ui/muteButton';

// ---- state ----
let mySlot: number | null = null;
let myTeam: Team | null   = null;
let roomMaxPlayers = 2;
let currentModeId = 'classic-1v1';
let storedMap: MapDefinition | null = null;
let gameInitialized = false;
let inputInterval: ReturnType<typeof setInterval> | null = null;
let currentScreen: Screen = 'home';

function buildInput(): PlayerInput {
  const keys = getKeyState();
  const pos  = getLocalPlayerPos() ?? { x: 600, y: 300 };
  return { ...keys, teleportTarget: getPendingTeleport(), pickaxeAngle: getMouseAngle(pos) };
}
let startAnywayTimer: ReturnType<typeof setTimeout> | null = null;

// Player display info — keyed by slot number
const playerNames:  Record<number, string> = { 0: 'P1', 1: 'P2' };
const playerColors: Record<number, number> = {};
const playerFaces:  Record<number, string> = {};
const slotTeam:     Record<number, Team>   = {};

// ---- DOM refs ----
const menuBgCanvas   = document.getElementById('menu-bg')     as HTMLCanvasElement;
const howtoPanel     = document.getElementById('howto-strip') as HTMLCanvasElement;
const gameCanvas     = document.getElementById('game-canvas') as HTMLCanvasElement;
const nameInput      = document.getElementById('name-input')  as HTMLInputElement;
const codeInput      = document.getElementById('code-input')  as HTMLInputElement;
const joinError      = document.getElementById('join-error')!;
const reconnectBanner = document.getElementById('reconnect-banner') as HTMLDivElement;

// ---- scene management ----
type Screen = 'home' | 'room' | 'game' | 'postgame';

function showScreen(name: Screen) {
  reconnectBanner.style.display = 'none';

  if (name === 'room' && currentScreen === 'home') {
    document.getElementById('home-left')!.classList.add('faded');
    document.getElementById('home-right')!.classList.add('faded');
    document.getElementById('home-lobby-col')!.classList.add('lobby-active');
    currentScreen = 'room';
    return;
  }

  if (name === 'home' && currentScreen === 'room') {
    document.getElementById('home-left')!.classList.remove('faded');
    document.getElementById('home-right')!.classList.remove('faded');
    document.getElementById('home-lobby-col')!.classList.remove('lobby-active');
    currentScreen = 'home';
    return;
  }

  const overlay = document.getElementById('fade-overlay') as HTMLElement;
  overlay.style.opacity = '1';
  setTimeout(() => {
    document.querySelectorAll<HTMLElement>('.screen').forEach((s) => { s.style.display = 'none'; });
    gameCanvas.style.display = 'none';

    if (name === 'game') {
      menuBgCanvas.style.display = 'none';
      howtoPanel.style.display   = 'none';
      stopMenuAnimation();
      stopHowToAnimation();
      gameCanvas.style.display = 'block';
    } else if (name === 'home' || name === 'room') {
      document.getElementById('screen-home')!.style.display = 'flex';
      menuBgCanvas.style.display = 'block';
      startMenuAnimation(menuBgCanvas);
      howtoPanel.style.display = 'block';
      startHowToAnimation(howtoPanel);
      document.getElementById('home-left')!.classList.toggle('faded', name === 'room');
      document.getElementById('home-right')!.classList.toggle('faded', name === 'room');
      document.getElementById('home-lobby-col')!.classList.toggle('lobby-active', name === 'room');
    } else {
      menuBgCanvas.style.display = 'none';
      howtoPanel.style.display   = 'none';
      stopMenuAnimation();
      stopHowToAnimation();
      document.getElementById(`screen-${name}`)!.style.display = 'flex';
    }

    currentScreen = name;
    overlay.style.opacity = '0';
  }, 100);
}

function stopInputs() {
  if (inputInterval) { clearInterval(inputInterval); inputInterval = null; }
}

function clearStartAnywayTimer() {
  if (startAnywayTimer) { clearTimeout(startAnywayTimer); startAnywayTimer = null; }
}

// ---- host / join gating — both buttons disabled until name is non-empty ----
function updateActionButtons() {
  const hasName = nameInput.value.trim().length > 0;
  (document.getElementById('btn-create') as HTMLButtonElement).disabled = !hasName;
  (document.getElementById('btn-join-submit') as HTMLButtonElement).disabled = !hasName;
}

// ---- socket events ----
socket.on('connect', () => {
  console.log('connected');
  reconnectBanner.style.display = 'none';
});

socket.on('connect_error', (err) => {
  console.error('connection failed:', err.message);
});

// (#11) our own connection dropped mid-match — Socket.IO will retry automatically
// (connectionStateRecovery on the server keeps our slot/room for RECONNECT_GRACE_MS).
// The 'connect' handler above clears this banner once we're back.
// Skip intentional disconnects (e.g. the opponent_disconnected flow, which calls
// socket.disconnect() itself — reason 'io client disconnect').
socket.on('disconnect', (reason) => {
  if (gameInitialized && reason !== 'io client disconnect') {
    reconnectBanner.style.display = 'block';
  }
});

// ---- map picker (host / slot 0 only) ----
const mapPickerSection = document.getElementById('map-picker-section')!;
const mapBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.map-btn'));
const modePickerSection = document.getElementById('mode-picker-section')!;
const modeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.mode-btn'));

function setActiveMapBtn(mapId: string) {
  mapBtns.forEach((b) => b.classList.toggle('active', b.dataset.map === mapId));
}

mapBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (mySlot !== 0) return;
    socket.emit('select_map', { mapId: btn.dataset.map! });
  });
});

function setActiveModeBtn(modeId: string) {
  modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === modeId));
}

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (mySlot !== 0) return;
    socket.emit('select_mode', { modeId: btn.dataset.mode! });
  });
});

socket.on('map_changed', ({ map }) => {
  storedMap = map;
  setActiveMapBtn(map.id);
});

socket.on('mode_changed', ({ modeId, maxPlayers, map }) => {
  currentModeId = modeId;
  roomMaxPlayers = maxPlayers;
  storedMap = map;
  setActiveModeBtn(modeId);
});

socket.on('assigned', ({ slot, team, map, roomCode, maxPlayers, modeId }) => {
  mySlot         = slot;
  myTeam         = team;
  roomMaxPlayers = maxPlayers;
  currentModeId  = modeId;
  storedMap      = map;
  document.getElementById('display-code')!.textContent = roomCode;
  showScreen('room');
});

socket.on('lobby_update', ({ players, maxPlayers, modeId, map }) => {
  clearStartAnywayTimer();
  roomMaxPlayers = maxPlayers;
  currentModeId = modeId;
  storedMap = map;

  // store names, colors, faces, and team membership for winner banner + lobby UI
  for (const p of players) {
    playerNames[p.slot]  = p.name;
    playerColors[p.slot] = p.color;
    playerFaces[p.slot]  = p.faceId;
    slotTeam[p.slot]     = p.team;
  }

// if a game was running (rematch), tear it down first
  if (gameInitialized) {
    stopInputs();
    resetGame();
    gameInitialized = false;
  }

  updateRoomUI2(players);

  if (currentScreen !== 'room') showScreen('room');

  modePickerSection.style.display = mySlot === 0 ? 'block' : 'none';
  mapPickerSection.style.display = 'none';
  setActiveModeBtn(currentModeId);
  if (storedMap) setActiveMapBtn(storedMap.id);

  // Disable 1v1 mode button if there are already more than 2 players in the lobby.
  const btn1v1 = document.getElementById('btn-mode-1v1') as HTMLButtonElement | null;
  if (btn1v1) btn1v1.disabled = players.length > 2;
});

socket.on('names', (styles) => {
  for (const [slotStr, style] of Object.entries(styles)) {
    playerNames[+slotStr] = style.name;
  }
  receiveNames(styles);
});

socket.on('countdown', (value) => {
  clearStartAnywayTimer();

  if (!gameInitialized && storedMap) {
    initGame(gameCanvas, storedMap, mySlot!, myTeam!, roomMaxPlayers, slotTeam);
    initMouse(gameCanvas);
    setWaiting('');
    gameInitialized = true;
  }

  showScreen('game');
  receiveCountdown(value);

  if (value === 'GO!' && !inputInterval) {
    inputInterval = setInterval(() => socket.emit('input', buildInput()), TICK_MS);
  }
});

socket.on('state', receiveState);

socket.on('goal_grow', ({ goalBounds }) => receiveGoalGrow(goalBounds));

socket.on('goal', ({ scoringTeam, score, winner, matchSeconds }) => {
  receiveGoal(scoringTeam);
  if (winner) {
    stopInputs();
    receiveWinner(winner);
    setTimeout(() => {
      const el = document.getElementById('winner-display')!;
      const teamName = winner === 'A' ? 'team a' : 'team b';
      el.textContent = `${teamName} wins!`;
      (el as HTMLElement).style.color = winner === 'A' ? '#b5d5fb' : '#fda4af';

      document.getElementById('final-score')!.textContent = `${score.A} - ${score.B}`;

      const secs = matchSeconds ?? 0;
      const mins = Math.floor(secs / 60);
      const remSecs = secs % 60;
      document.getElementById('match-duration')!.textContent =
        `${mins}:${remSecs.toString().padStart(2, '0')}`;

      for (const team of ['A', 'B'] as const) {
        const slots = Object.entries(slotTeam)
          .filter(([, t]) => t === team)
          .map(([slot]) => Number(slot))
          .sort((a, b) => a - b);

        for (let n = 1; n <= 2; n++) {
          const avatarEl = document.getElementById(`avatar-${team}-${n}`) as HTMLElement;
          const slot = slots[n - 1];
          if (slot === undefined) {
            avatarEl.style.display = 'none';
            continue;
          }
          avatarEl.style.display = 'flex';
          const ballEl = document.getElementById(`ball-${team}-${n}`) as HTMLElement;
          const faceEl = document.getElementById(`face-${team}-${n}`) as HTMLImageElement;
          const nameEl = document.getElementById(`name-${team}-${n}`) as HTMLElement;
          const colorHex = COLORS.find((c) => c.val === playerColors[slot])?.hex ?? (team === 'A' ? '#b5d5fb' : '#fda4af');
          ballEl.style.background = colorHex;
          faceEl.src              = `/assets/sprites/faces/${playerFaces[slot]}.png`;
          faceEl.style.display    = 'block';
          nameEl.textContent      = playerNames[slot];
        }
      }

      const columnA = document.getElementById('team-column-A')!;
      const columnB = document.getElementById('team-column-B')!;
      columnA.classList.remove('winning-team', 'losing-team');
      columnB.classList.remove('winning-team', 'losing-team');
      const winningColumn = winner === 'A' ? columnA : columnB;
      const losingColumn  = winner === 'A' ? columnB : columnA;
      winningColumn.classList.add('winning-team');
      losingColumn.classList.add('losing-team');

      const rematchBtn = document.getElementById('btn-rematch') as HTMLButtonElement;
      rematchBtn.textContent = 'rematch';
      rematchBtn.disabled = false;
      document.getElementById('rematch-status')!.textContent = '';

      showScreen('postgame');
      playWin();
    }, 1500);
  }
});

socket.on('room_not_found', () => {
  joinError.textContent = "hmm, that room doesn't exist";
});

socket.on('full', () => {
  joinError.textContent = "that room's full, sorry!";
});

socket.on('player_left', ({ name, remainingCounts }) => {
  receivePlayerLeft(name, remainingCounts.A, remainingCounts.B);
});

// (#11) opponent's connection dropped mid-match — game keeps running, their body
// just stops responding to input until they reconnect or the grace period expires.
socket.on('opponent_disconnected_temp', ({ name, graceMs }) => {
  receiveOpponentDisconnectedTemp(name, graceMs);
});

socket.on('opponent_reconnected', ({ name }) => {
  receiveOpponentReconnected(name);
});

socket.on('opponent_disconnected', () => {
  stopInputs();
  receiveOpponentDisconnected();
  setTimeout(() => {
    gameInitialized = false;
    socket.disconnect();
    showScreen('home');
  }, 3000);
});

// ---- button handlers ----
function connectAndEmit(action: () => void) {
  if (socket.connected) {
    action();
  } else {
    socket.once('connect', action);
    socket.connect();
  }
}

// host picks a starting mode (default 1v1) and can switch to 2v2 from the lobby anyway
document.getElementById('btn-create')!.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return;
  savePrefs(name, getSelectedColor(), getSelectedFace());
  connectAndEmit(() => socket.emit('create_room', { name, color: getSelectedColor(), faceId: getSelectedFace() }));
});

document.getElementById('btn-join-submit')!.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return;
  const code = codeInput.value.trim();
  if (!code) { codeInput.focus(); return; }
  joinError.textContent = '';
  savePrefs(name, getSelectedColor(), getSelectedFace());
  connectAndEmit(() => socket.emit('join_room', { code, name, color: getSelectedColor(), faceId: getSelectedFace() }));
});

document.getElementById('btn-copy-link')!.addEventListener('click', () => {
  const code = document.getElementById('display-code')!.textContent ?? '';
  const link = `${location.origin}${location.pathname}?room=${code}`;
  const btn  = document.getElementById('btn-copy-link') as HTMLButtonElement;
  navigator.clipboard.writeText(link)
    .then(() => {
      const original = btn.textContent;
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    })
    .catch(() => {});
});

document.getElementById('btn-ready')!.addEventListener('click', () => {
  socket.emit('player_ready');
  const btn = document.getElementById('btn-ready') as HTMLButtonElement;
  btn.textContent = 'ready ✓';
  btn.disabled = true;
  setReadyButtonArt(true);
});

document.getElementById('btn-swap-team')!.addEventListener('click', () => {
  socket.emit('swap_team');
});

document.getElementById('btn-rematch')!.addEventListener('click', () => {
  socket.emit('rematch');
  const btn = document.getElementById('btn-rematch') as HTMLButtonElement;
  btn.textContent = 'rematch ✓';
  btn.disabled = true;
});

socket.on('rematch_update', ({ count, total }) => {
  const status = document.getElementById('rematch-status')!;
  status.textContent = count >= total ? '' : `waiting for rematch... (${count}/${total})`;
});

document.getElementById('btn-leave')!.addEventListener('click', () => {
  socket.emit('leave_room');
  gameInitialized = false;
  socket.disconnect();
  showScreen('home');
});

document.getElementById('btn-leave-room')!.addEventListener('click', () => {
  socket.disconnect();
  showScreen('home');
});

nameInput.addEventListener('input', () => {
  // letters only — strip numbers, spaces, and symbols so names stay clean
  const cleaned = nameInput.value.replace(/[^a-zA-Z0-9]/g, '');
  if (nameInput.value !== cleaned) nameInput.value = cleaned;
  updateActionButtons();
});

codeInput.addEventListener('input', () => {
  // letters only, always uppercase — room codes are alpha-only
  const cleaned = codeInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (codeInput.value !== cleaned) codeInput.value = cleaned;
});

// ---- room UI helpers ----
function updateRoomUI(players: LobbyPlayer[]) {
  const readyBtn = document.getElementById('btn-ready') as HTMLButtonElement;
  readyBtn.textContent = 'ready';
  readyBtn.disabled    = false;
  setReadyButtonArt(false);

  // show/hide 2v2 second row
  const row2v2 = document.getElementById('lobby-row-2v2') as HTMLElement;
  row2v2.style.display = roomMaxPlayers === 4 ? 'flex' : 'none';

  // reset all cards to waiting state (1-indexed, HTML cards 1–4)
  const totalCards = roomMaxPlayers;
  for (let n = 1; n <= totalCards; n++) {
    const ballEl   = document.getElementById(`lobby-ball-${n}`) as HTMLElement;
    const faceEl   = document.getElementById(`lobby-face-${n}`) as HTMLImageElement;
    const nameEl   = document.getElementById(`lobby-name-${n}`) as HTMLElement;
    const statusEl = document.getElementById(`lobby-status-${n}`) as HTMLElement;
    ballEl.style.background = '#1a1a2e';
    ballEl.style.boxShadow  = '0 0 0 2px rgba(255,255,255,0.05)';
    faceEl.style.display    = 'none';
    nameEl.textContent      = n === 1 ? '—' : 'waiting...';
    nameEl.style.color      = '#333';
    statusEl.textContent    = '';
    statusEl.classList.remove('ready', 'not-ready');
  }

  for (const p of players) {
    // slot 0 → card 1, slot 1 → card 2, slot 2 → card 3, slot 3 → card 4
    const n        = p.slot + 1;
    const colorHex = COLORS.find((c) => c.val === p.color)?.hex ?? (p.slot === 0 ? '#b5d5fb' : '#fda4af');
    const ballEl   = document.getElementById(`lobby-ball-${n}`)   as HTMLElement;
    const faceEl   = document.getElementById(`lobby-face-${n}`)   as HTMLImageElement;
    const nameEl   = document.getElementById(`lobby-name-${n}`)   as HTMLElement;
    const statusEl = document.getElementById(`lobby-status-${n}`) as HTMLElement;

    ballEl.style.background = colorHex;
    faceEl.src              = `/assets/sprites/faces/${p.faceId}.png`;
    faceEl.style.display    = 'block';
    nameEl.textContent      = p.name;
    nameEl.style.color      = '#fff';

    if (p.ready) {
      ballEl.style.boxShadow = '0 0 0 3px #66bb6a';
      statusEl.textContent   = 'ready';
      statusEl.classList.add('ready');
    } else {
      ballEl.style.boxShadow = '0 0 0 3px #ff7043';
      statusEl.textContent   = 'not ready';
      statusEl.classList.add('not-ready');
    }

    if (p.slot === mySlot && p.ready) {
      readyBtn.textContent = 'ready ✓';
      readyBtn.disabled    = true;
      setReadyButtonArt(true);
    }
  }
}

function updateRoomUI2(players: LobbyPlayer[]) {
  const readyBtn = document.getElementById('btn-ready') as HTMLButtonElement;
  const swapBtn = document.getElementById('btn-swap-team') as HTMLButtonElement;
  const teamA = document.getElementById('team-a-slots') as HTMLElement;
  const teamB = document.getElementById('team-b-slots') as HTMLElement;

  readyBtn.textContent = 'ready';
  readyBtn.disabled = false;
  swapBtn.style.display = roomMaxPlayers === 4 ? 'block' : 'none';
  setReadyButtonArt(false);

  // Return all cards to the pool first so getElementById can still find them.
  const cardPool = document.getElementById('lobby-card-pool') as HTMLElement;
  while (teamA.firstChild) cardPool.appendChild(teamA.firstChild as Node);
  while (teamB.firstChild) cardPool.appendChild(teamB.firstChild as Node);

  const teamSize    = roomMaxPlayers / 2;
  const teamAPlayers = players.filter((p) => p.team === 'A');
  const teamBPlayers = players.filter((p) => p.team === 'B');
  // Cards not used by any active player are available as waiting placeholders.
  const usedSlots    = new Set(players.map((p) => p.slot + 1));
  const waiting      = [1, 2, 3, 4].filter((n) => !usedSlots.has(n));
  let   waitIdx      = 0;

  function placePlayer(container: HTMLElement, p: LobbyPlayer) {
    const n        = p.slot + 1;
    const colorHex = COLORS.find((c) => c.val === p.color)?.hex ?? (p.team === 'A' ? '#b5d5fb' : '#fda4af');
    const cardEl   = document.getElementById(`lobby-card-${n}`) as HTMLElement;
    const ballEl   = document.getElementById(`lobby-ball-${n}`) as HTMLElement;
    const faceEl   = document.getElementById(`lobby-face-${n}`) as HTMLImageElement;
    const nameEl   = document.getElementById(`lobby-name-${n}`) as HTMLElement;
    const statusEl = document.getElementById(`lobby-status-${n}`) as HTMLElement;

    container.appendChild(cardEl);
    cardEl.style.display    = 'flex';
    ballEl.style.background = colorHex;
    ballEl.style.boxShadow  = p.ready ? '0 0 0 3px #66bb6a' : '0 0 0 3px #ff7043';
    faceEl.src              = `/assets/sprites/faces/${p.faceId}.png`;
    faceEl.style.display    = 'block';
    nameEl.textContent      = p.name;
    nameEl.style.color      = '#fff';
    statusEl.textContent    = p.ready ? 'ready' : 'not ready';
    statusEl.className      = `lobby-player-status ${p.ready ? 'ready' : 'not-ready'}`;

    if (p.slot === mySlot) myTeam = p.team;
    if (p.slot === mySlot && p.ready) {
      readyBtn.textContent = 'ready ✓';
      readyBtn.disabled    = true;
      setReadyButtonArt(true);
    }
  }

  function placeWaiting(container: HTMLElement) {
    if (waitIdx >= waiting.length) return;
    const n      = waiting[waitIdx++];
    const cardEl = document.getElementById(`lobby-card-${n}`) as HTMLElement;
    const ballEl = document.getElementById(`lobby-ball-${n}`) as HTMLElement;
    const faceEl = document.getElementById(`lobby-face-${n}`) as HTMLImageElement;
    const nameEl = document.getElementById(`lobby-name-${n}`) as HTMLElement;
    const statusEl = document.getElementById(`lobby-status-${n}`) as HTMLElement;

    container.appendChild(cardEl);
    cardEl.style.display    = 'flex';
    ballEl.style.background = '#1a1a2e';
    ballEl.style.boxShadow  = '0 0 0 2px rgba(255,255,255,0.05)';
    faceEl.style.display    = 'none';
    nameEl.textContent      = 'waiting...';
    nameEl.style.color      = '#333';
    statusEl.textContent    = '';
    statusEl.className      = 'lobby-player-status';
  }

  // Each team column: active players first, then waiting placeholders up to teamSize.
  for (const p of teamAPlayers) placePlayer(teamA, p);
  for (let i = teamAPlayers.length; i < teamSize; i++) placeWaiting(teamA);
  for (const p of teamBPlayers) placePlayer(teamB, p);
  for (let i = teamBPlayers.length; i < teamSize; i++) placeWaiting(teamB);

  // Lock ready if teams are uneven — players need to swap first.
  if (teamAPlayers.length > teamSize || teamBPlayers.length > teamSize) {
    readyBtn.disabled = true;
    setReadyButtonArt(false);
  }
}

// ---- init ----
initSettings();
applyButtonArt();
updateActionButtons(); // reflect any name loaded from localStorage
initMuteButton();

// ---- suppress right-click context menu during gameplay ----
// Right-click outside the canvas still triggers the browser menu which can
// interrupt mouse input (mouseup never fires → movement gets stuck).
document.addEventListener('contextmenu', (e) => {
  if (currentScreen === 'game') e.preventDefault();
});

// ---- dev: Ctrl+Shift+S on home screen → download ability label PNGs ----
// Remove this block (and the captureAbilityLabels import) once you have your art.
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    if (howtoPanel.style.display !== 'none' && howtoPanel.style.display !== '') {
      e.preventDefault();
      captureAbilityLabels();
    }
  }
});

// ---- join via invite link (?room=CODE) ----
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode) {
  history.replaceState(null, '', location.pathname); // strip param so refresh doesn't re-trigger
  codeInput.value = inviteCode.trim().toUpperCase();
}
showScreen('home');
