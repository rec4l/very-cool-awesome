import * as PIXI from 'pixi.js';
import type { GameState, MapDefinition, PlayerStyle, GoalBounds, Team } from '@shared/types';
import { buildGoalFrameWalls } from '@shared/maps/goalFrame';
import { PLAYER_RADIUS, BALL_RADIUS, CORNER_BEVEL } from '@shared/constants';
import { EntityRenderer } from '../rendering/EntityRenderer';
import { isTeleportMode } from '../input/keyboard';
import { playGoal, playWreckingBallLaunch, playWreckingBallReturn, muteAll, unmuteAll } from '../audio/sounds';
import { particles, spawnBurst, tickParticles } from './game/particles';
import { teleportFx, tickTeleportFx, tickBoostTrail, tickWreckingBalls, tickTeleportCircle, resetEffects } from './game/effects';
import { initHud, tickHud, resetHud, startScorePop, showDisconnectNotice, showReconnectNotice, showReconnectedNotice } from './game/hud';
import { processSnapshot, resetSnapshot } from './game/snapshot';
import { interpolated } from './game/interpolation';
import type { Snapshot, PlayerStyles } from './game/types';

// ---- constants ----
const WALL_COLOR         = 0x0f3460;
const MARKING_COLOR      = 0x16213e;
const PICKUP_COLOR       = 0xffd700;
const PICKUP_GLOW_RADIUS = 26;
const PICKUP_CORE_RADIUS = 12;
const PICKUP_SPRITE_SIZE = 52;
const SCREEN_SHAKE       = true;

// Ring colors — convey team membership at a glance
const RING_SELF     = 0xffffff; // you
const RING_TEAMMATE = 0x4fc3f7; // ally (sky blue)
const RING_ENEMY    = 0xef5350; // opponent (red)
const TEAM_COLORS: Record<Team, number> = { A: 0x7ec8ff, B: 0xff8fa3 };

// ---- player styles — set by receiveNames before initGame, keyed by slot ----
const playerStyles: PlayerStyles = {
  0: { color: 0xb5d5fb, faceId: 'happy' },
  1: { color: 0xfda4af, faceId: 'sad'   },
};

// ---- countdown art ----
const COUNTDOWN_KEYS: Record<string, string> = { '3': '3', '2': '2', '1': '1', 'GO!': 'go', 'GOAL!': 'goal' };
const countdownTextures: Partial<Record<string, PIXI.Texture>> = {};
const COUNTDOWN_ART_HEIGHT = 130;
for (const key of ['3', '2', '1', 'go', 'goal']) {
  PIXI.Assets.load(`/assets/ui/countdown-${key}.png`)
    .then((t: PIXI.Texture) => { countdownTextures[key] = t; })
    .catch(() => {});
}

// ---- pickup sprite pipeline ----
let pickupTexture: PIXI.Texture | null = null;
PIXI.Assets.load('/assets/sprites/pickup.png')
  .then((t: PIXI.Texture) => { pickupTexture = t; })
  .catch(() => {});

// ---- module state ----
let prev: Snapshot | null = null;
let curr: Snapshot | null = null;
let mySlot: number = 0;
let myTeam: Team   = 'A';
const playerNames: Record<number, string> = { 0: 'P1', 1: 'P2' };

let app: PIXI.Application | null = null;
let tickerFn: (() => void) | null = null;
let arenaRoot: PIXI.Container;
let renderers: EntityRenderer[] = [];
let ballRenderer: EntityRenderer;
let overlayContainer: PIXI.Container;
let overlayLabel: PIXI.Text;
let overlayArt: PIXI.Sprite;
let overlayArtBaseScale = 1;
let waitingText: PIXI.Text;
let wallGraphics: PIXI.Graphics;
let goalLines: PIXI.Graphics;
let currentMap: MapDefinition;
let wbGraphics: PIXI.Graphics;
let teleportGraphics: PIXI.Graphics;
let pickupGraphics: PIXI.Graphics;
let pickupContainer: PIXI.Container;
const pickupSprites: PIXI.Sprite[] = [];
let particleGfx: PIXI.Graphics;
let fxGraphics: PIXI.Graphics;

// ---- animation state ----
let countdownAnimStart = 0;
let shakeUntil = 0;
const FIELD_FADE_OUT_MS = 220;
const FIELD_FADE_IN_MS  = 380;
let fieldFadeDir: 'out' | 'in' | 'none' = 'none';
let fieldFadeStart = 0;
let lastSnapshotTime = 0;

function easeOut(t: number) { return 1 - (1 - t) * (1 - t); }

// ---- wall drawing helpers ----
function drawWalls(g: PIXI.Graphics, map: MapDefinition, wallList: typeof map.walls, W: number, H: number) {
  g.clear();
  g.beginFill(WALL_COLOR);
  for (const wall of wallList) {
    if (wall.x < -30 || wall.x > W + 30) continue;
    if (wall.y - wall.h / 2 >= H) continue;
    g.drawRect(wall.x - wall.w / 2, wall.y - wall.h / 2, wall.w, wall.h);
  }
  g.endFill();
}

function drawGoalLines(g: PIXI.Graphics, map: MapDefinition, lYMin: number, lYMax: number, rYMin: number, rYMax: number) {
  const W = map.width;
  // Left goal line: team B (slot 1) scores here — use slot 1's color.
  // Right goal line: team A (slot 0) scores here — use slot 0's color.
  g.clear();
  g.lineStyle(5, TEAM_COLORS.B, 1); g.moveTo(2,     lYMin); g.lineTo(2,     lYMax);
  g.lineStyle(5, TEAM_COLORS.A, 1); g.moveTo(W - 2, rYMin); g.lineTo(W - 2, rYMax);
}

// ---- init ----

export function initGame(
  canvas: HTMLCanvasElement,
  map: MapDefinition,
  slot: number,
  team: Team,
  maxPlayers: number,
  teamBySlot: Record<number, Team> = {}
) {
  mySlot     = slot;
  myTeam     = team;
  currentMap = map;
  const W = map.width, H = map.height;
  const goalTop = map.goals[0].yMin, goalBottom = map.goals[0].yMax;
  const HUD_H = 108;

  // Re-initializing for a rematch: rebuilding the PIXI.Application on the same
  // canvas creates a second WebGL context, which leaves the old one in a state
  // that crashes the renderer (`checkMaxIfStatementsInShader`). Reuse the
  // existing app/renderer and just rebuild the stage instead.
  if (app) {
    if (tickerFn) { app.ticker.remove(tickerFn); tickerFn = null; }
    app.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
    app.renderer.resize(W, H + HUD_H);
  } else {
    app = new PIXI.Application({ view: canvas, width: W, height: H + HUD_H, backgroundColor: 0x000000, backgroundAlpha: 0, antialias: true });
  }

  arenaRoot        = new PIXI.Container();
  const background = new PIXI.Container();
  const walls      = new PIXI.Container();
  const entities   = new PIXI.Container();
  const effects    = new PIXI.Container();
  const ui         = new PIXI.Container();
  arenaRoot.addChild(background, walls, entities, effects);
  app.stage.addChild(arenaRoot, ui);

  // arena background
  const arenaBg = new PIXI.Graphics();
  arenaBg.beginFill(map.backgroundColor).drawRect(0, 0, W, H).endFill();
  background.addChild(arenaBg);

  const arenaBgUrl = `/assets/ui/arena-bg-${map.id}.png`;
  PIXI.Assets.unload(arenaBgUrl).catch(() => {});
  PIXI.Assets.load(arenaBgUrl)
    .then((texture: PIXI.Texture) => {
      const sprite = new PIXI.Sprite(texture);
      sprite.width = W; sprite.height = H;
      background.addChildAt(sprite, 1);
      markings.destroy();
    })
    .catch(() => {});

  const markings = new PIXI.Graphics();
  markings.lineStyle(2, MARKING_COLOR, 1);
  const dashLen = 12, gapLen = 8;
  for (let y = 0; y < H; y += dashLen + gapLen) {
    markings.moveTo(W / 2, y); markings.lineTo(W / 2, Math.min(y + dashLen, H));
  }
  markings.drawCircle(W / 2, H / 2, 80);
  background.addChild(markings);

  wallGraphics = new PIXI.Graphics();
  drawWalls(wallGraphics, map, map.walls, W, H);

  const B = CORNER_BEVEL;
  const cornerMask = new PIXI.Graphics();
  cornerMask.beginFill(0x0d0d1a);
  cornerMask.drawPolygon([0, 0, B, 0, 0, B]);
  cornerMask.drawPolygon([W, 0, W - B, 0, W, B]);
  cornerMask.drawPolygon([0, H, B, H, 0, H - B]);
  cornerMask.drawPolygon([W, H, W - B, H, W, H - B]);
  cornerMask.endFill();

  goalLines = new PIXI.Graphics();
  drawGoalLines(goalLines, map, goalTop, goalBottom, goalTop, goalBottom);

  teleportGraphics = new PIXI.Graphics();
  wbGraphics       = new PIXI.Graphics();
  walls.addChild(wallGraphics, goalLines, teleportGraphics, wbGraphics, cornerMask);

  // clip arenaRoot to arena octagon
  const arenaMask = new PIXI.Graphics();
  arenaMask.beginFill(0xffffff)
    .drawPolygon([B, 0, W - B, 0, W, B, W, H - B, W - B, H, B, H, 0, H - B, 0, B])
    .endFill();
  arenaRoot.addChild(arenaMask);
  arenaRoot.mask = arenaMask;

  // entity renderers — one per active player slot
  // teamSize is half of maxPlayers (1 for 1v1, 2 for 2v2) — same formula the server uses
  const teamSize = maxPlayers / 2;
  renderers = [];
  for (let s = 0; s < maxPlayers; s++) {
    const style    = playerStyles[s] ?? { color: 0xaaaaaa, faceId: 'happy' };
    const slotTeam: Team = teamBySlot[s] ?? (s < teamSize ? 'A' : 'B');
    const ringColor = s === mySlot ? RING_SELF : slotTeam === myTeam ? RING_TEAMMATE : RING_ENEMY;
    const r = new EntityRenderer(style.faceId, PLAYER_RADIUS, style.color, ringColor);
    r.setName(playerNames[s] ?? `P${s + 1}`);
    r.container.visible = false;
    entities.addChild(r.container);
    renderers.push(r);
  }
  ballRenderer = new EntityRenderer('', BALL_RADIUS, 0xe0e0e0, null, '/assets/sprites/ball.png');
  ballRenderer.container.visible = false;
  entities.addChild(ballRenderer.container);

  pickupGraphics  = new PIXI.Graphics();
  pickupContainer = new PIXI.Container();
  pickupSprites.length = 0;
  for (const pos of map.pickupPositions) {
    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5);
    spr.width  = PICKUP_SPRITE_SIZE;
    spr.height = PICKUP_SPRITE_SIZE;
    spr.position.set(pos.x, pos.y);
    pickupContainer.addChild(spr);
    pickupSprites.push(spr);
  }
  fxGraphics  = new PIXI.Graphics();
  particleGfx = new PIXI.Graphics();
  effects.addChild(pickupGraphics, pickupContainer, fxGraphics, particleGfx);

  initHud(ui, W, H, mySlot, playerStyles);

  // countdown / goal overlay
  overlayContainer = new PIXI.Container();
  overlayContainer.visible = false;
  const overlayBg = new PIXI.Graphics();
  overlayBg.beginFill(0x000000, 0.55)
    .drawPolygon([B, 0, W - B, 0, W, B, W, H - B, W - B, H, B, H, 0, H - B, 0, B])
    .endFill();
  overlayLabel = new PIXI.Text('', { fill: '#ffffff', fontSize: 90, fontFamily: 'monospace', fontWeight: 'bold' });
  overlayLabel.anchor.set(0.5); overlayLabel.position.set(W / 2, H / 2);
  overlayArt = new PIXI.Sprite(PIXI.Texture.EMPTY);
  overlayArt.anchor.set(0.5); overlayArt.position.set(W / 2, H / 2); overlayArt.visible = false;
  overlayContainer.addChild(overlayBg, overlayLabel, overlayArt);
  ui.addChild(overlayContainer);

  waitingText = new PIXI.Text('', { fill: '#ffffff', fontSize: 20, fontFamily: 'monospace', align: 'center' });
  waitingText.anchor.set(0.5); waitingText.position.set(W / 2, H / 2);
  ui.addChild(waitingText);

  // ticker
  tickerFn = () => {
    const now = performance.now();
    const dt  = app!.ticker.deltaMS;

    // countdown slam + fade animation
    if (countdownAnimStart > 0) {
      const elapsed = now - countdownAnimStart;
      const slamScale = 2.2 - 1.2 * easeOut(Math.min(1, elapsed / 250));
      overlayLabel.scale.set(slamScale);
      overlayArt.scale.set(overlayArtBaseScale * slamScale);
      let a: number;
      if      (elapsed < 150)  a = elapsed / 150;
      else if (elapsed < 700)  a = 1;
      else if (elapsed < 1000) a = 1 - (elapsed - 700) / 300;
      else                     a = 0;
      overlayLabel.alpha = a; overlayArt.alpha = a;
      if (elapsed >= 1000) {
        overlayLabel.scale.set(1); overlayArt.scale.set(overlayArtBaseScale); countdownAnimStart = 0;
      }
    }

    // screen shake
    if (SCREEN_SHAKE && now < shakeUntil) {
      const intensity = 7 * ((shakeUntil - now) / 500);
      arenaRoot.x = (Math.random() - 0.5) * 2 * intensity;
      arenaRoot.y = (Math.random() - 0.5) * 2 * intensity;
    } else { arenaRoot.x = 0; arenaRoot.y = 0; }

    // post-goal field fade
    if (fieldFadeDir !== 'none') {
      const elapsed = now - fieldFadeStart;
      if (fieldFadeDir === 'out') {
        arenaRoot.alpha = Math.max(0, 1 - elapsed / FIELD_FADE_OUT_MS);
        if (elapsed >= FIELD_FADE_OUT_MS) { arenaRoot.alpha = 0; fieldFadeDir = 'in'; fieldFadeStart = now; }
      } else {
        arenaRoot.alpha = Math.min(1, elapsed / FIELD_FADE_IN_MS);
        if (elapsed >= FIELD_FADE_IN_MS) { arenaRoot.alpha = 1; fieldFadeDir = 'none'; }
      }
    }

    tickParticles(particleGfx, dt);

    const state = interpolated(prev, curr);
    if (!state) return;

    // per-snapshot detections
    if (curr && curr.time !== lastSnapshotTime) {
      if (prev) processSnapshot(curr, prev, mySlot, playerStyles, now);
      lastSnapshotTime = curr.time;
    }

    // effects
    fxGraphics.clear();
    tickTeleportFx(fxGraphics, now);
    tickBoostTrail(state, mySlot, playerStyles);
    tickWreckingBalls(wbGraphics, state, playerStyles,
      (isOpponent) => playWreckingBallLaunch(isOpponent),
      (isOpponent) => playWreckingBallReturn(isOpponent),
      mySlot,
    );
    tickTeleportCircle(teleportGraphics, state, mySlot, W, H, playerStyles, isTeleportMode());

    // entity positions
    waitingText.visible = false;
    ballRenderer.container.visible = true;
    ballRenderer.setPosition(state.ball.x, state.ball.y);
    renderers.forEach((r) => { r.container.visible = false; });
    for (const ps of state.players) {
      const r = renderers[ps.slot];
      if (r) {
        r.container.visible = true;
        r.setPosition(ps.position.x, ps.position.y);
      }
    }

    // pickups — sprite when pickup.png is loaded, fallback circles otherwise
    pickupGraphics.clear();
    for (let i = 0; i < state.pickups.length; i++) {
      const p = state.pickups[i];
      if (pickupTexture) {
        if (pickupSprites[i]) {
          if (pickupSprites[i].texture !== pickupTexture) pickupSprites[i].texture = pickupTexture;
          pickupSprites[i].visible = p.active;
        }
      } else {
        if (pickupSprites[i]) pickupSprites[i].visible = false;
        if (!p.active) continue;
        pickupGraphics.beginFill(PICKUP_COLOR, 0.25).drawCircle(p.x, p.y, PICKUP_GLOW_RADIUS).endFill();
        pickupGraphics.beginFill(PICKUP_COLOR).drawCircle(p.x, p.y, PICKUP_CORE_RADIUS).endFill();
      }
    }

    tickHud(state, mySlot, now);
  };
  app.ticker.add(tickerFn);
}

// ---- public API ----

export function getLocalPlayerPos() {
  if (!curr) return null;
  const myPs = curr.state.players.find((p) => p.slot === mySlot);
  return myPs?.position ?? null;
}

export function setWaiting(msg: string) {
  if (!waitingText) return;
  waitingText.text = msg;
  waitingText.visible = true;
}

export function receiveState(state: GameState) {
  prev = curr;
  curr = { state, time: performance.now() };
}

export function receiveCountdown(value: number | 'GO!') {
  if (!overlayContainer) return;
  const key     = COUNTDOWN_KEYS[String(value)];
  const texture = key ? countdownTextures[key] : undefined;
  if (texture) {
    overlayArt.texture = texture;
    overlayArtBaseScale = (COUNTDOWN_ART_HEIGHT / texture.height) * (key === 'go' ? 2.8 : 1.0);
    overlayArt.visible = true; overlayLabel.visible = false;
  } else {
    overlayLabel.text = String(value); overlayLabel.visible = true; overlayArt.visible = false;
  }
  overlayLabel.scale.set(2.2); overlayArt.scale.set(overlayArtBaseScale * 2.2);
  overlayLabel.alpha = 0; overlayArt.alpha = 0;
  countdownAnimStart = performance.now();
  overlayContainer.visible = true;
  if (value === 'GO!') {
    setTimeout(() => {
      overlayContainer.visible = false;
      overlayLabel.alpha = 1; overlayArt.alpha = 1;
    }, 1050);
  }
}

export function receiveGoal(scoringTeam: Team) {
  if (!overlayContainer) return;
  const goalTexture = countdownTextures['goal'];
  if (goalTexture) {
    overlayArt.texture = goalTexture;
    overlayArtBaseScale = (COUNTDOWN_ART_HEIGHT / goalTexture.height) * 1.5;
    overlayArt.scale.set(overlayArtBaseScale); overlayArt.alpha = 1;
    overlayArt.visible = true; overlayLabel.visible = false;
  } else {
    overlayLabel.text = 'GOAL!'; overlayLabel.scale.set(1); overlayLabel.alpha = 1;
    overlayLabel.visible = true; overlayArt.visible = false;
  }
  countdownAnimStart = 0;
  overlayContainer.visible = true;
  startScorePop(scoringTeam);
  if (SCREEN_SHAKE) shakeUntil = performance.now() + 500;

  // team A = slot 0, team B = slot 1 (for 1v1 — will be generalised in Phase 2)
  if (curr) spawnBurst(curr.state.ball.x, curr.state.ball.y, 18, 2.5, TEAM_COLORS[scoringTeam], 0.002);
  playGoal();

  fieldFadeDir = 'none';
  arenaRoot.alpha = 1;
  setTimeout(() => {
    fieldFadeDir   = 'out';
    fieldFadeStart = performance.now();
    muteAll();
    setTimeout(unmuteAll, 650);
  }, 750);
}

export function receiveGoalGrow(goalBounds: GoalBounds) {
  if (!app || !currentMap) return;
  const map = currentMap;
  const W = map.width, H = map.height;
  const staticWalls = map.walls.filter((w: typeof map.walls[number]) => w.role !== 'goalFrame');
  const frameWalls = [
    ...buildGoalFrameWalls(map, 'left',  goalBounds.left.yMin,  goalBounds.left.yMax),
    ...buildGoalFrameWalls(map, 'right', goalBounds.right.yMin, goalBounds.right.yMax),
  ];
  drawWalls(wallGraphics, map, [...staticWalls, ...frameWalls], W, H);
  drawGoalLines(goalLines, map, goalBounds.left.yMin, goalBounds.left.yMax, goalBounds.right.yMin, goalBounds.right.yMax);
  // left goal = team B territory, right goal = team A territory
  spawnBurst(0, (goalBounds.left.yMin + goalBounds.left.yMax)   / 2, 14, 2, TEAM_COLORS.B, 0.0035);
  spawnBurst(W, (goalBounds.right.yMin + goalBounds.right.yMax) / 2, 14, 2, TEAM_COLORS.A, 0.0035);
}

export function receiveWinner(_team: Team) {
  if (overlayContainer) overlayContainer.visible = false;
}

export function receiveNames(styles: Record<number, PlayerStyle>) {
  for (const [slotStr, style] of Object.entries(styles)) {
    const s = Number(slotStr);
    if (!playerStyles[s]) playerStyles[s] = { color: 0xffffff, faceId: 'happy' };
    playerStyles[s].color  = style.color;
    playerStyles[s].faceId = style.faceId;
    playerNames[s] = style.name;
    if (renderers[s]) renderers[s].setName(style.name);
  }
}

export function receivePlayerLeft(name: string, countA: number, countB: number) {
  showDisconnectNotice(name, countA, countB);
}

export function receiveOpponentDisconnected() {
  if (!overlayContainer) return;
  overlayLabel.text = 'opponent left';
  overlayContainer.visible = true;
}

// (#11) mid-match drop — game keeps running, just flag it
export function receiveOpponentDisconnectedTemp(name: string, graceMs: number) {
  showReconnectNotice(name, graceMs);
}

export function receiveOpponentReconnected(name: string) {
  showReconnectedNotice(name);
}

export function resetGame() {
  prev = null; curr = null;
  particles.length = 0;
  teleportFx.length = 0;
  resetSnapshot();
  resetEffects();
  resetHud();
  countdownAnimStart = 0; shakeUntil = 0;
  fieldFadeDir = 'none'; fieldFadeStart = 0;
  lastSnapshotTime = 0;
  if (arenaRoot) { arenaRoot.alpha = 1; arenaRoot.x = 0; arenaRoot.y = 0; }
  if (!renderers.length) return;
  renderers.forEach((r) => { r.container.visible = false; });
  if (ballRenderer) ballRenderer.container.visible = false;
  if (wbGraphics)       wbGraphics.clear();
  if (teleportGraphics) teleportGraphics.clear();
  if (pickupGraphics)   pickupGraphics.clear();
  if (pickupContainer)  pickupContainer.removeChildren();
  pickupSprites.length = 0;
  if (particleGfx)      particleGfx.clear();
  if (fxGraphics)       fxGraphics.clear();
  if (overlayLabel)     { overlayLabel.alpha = 1; overlayLabel.scale.set(1); }
  if (overlayContainer) overlayContainer.visible = false;
  if (waitingText)      { waitingText.text = 'get ready!'; waitingText.visible = true; }
}
