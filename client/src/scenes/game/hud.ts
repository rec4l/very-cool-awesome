import * as PIXI from 'pixi.js';
import type { GameState, Team } from '@shared/types';
import { BOOST_MAX, MAX_TELEPORT_CHARGES, TELEPORT_COOLDOWN_TICKS } from '@shared/constants';
import type { PlayerStyles } from './types';

// ---- layout constants (set in initHud, read in tickHud) ----
let CONTENT_X = 0, ROW1_CY = 0, ROW2_CY = 0, BAR_W = 0, BAR_H = 0;

// ---- score display ----
let scoreP1Text: PIXI.Text;  // team A (left side)
let scoreP2Text: PIXI.Text;  // team B (right side)
let matchTimerText: PIXI.Text;
let subtitleText: PIXI.Text;
let subtitleUntil = 0;
const SUBTITLE_DURATION = 3000;
const scorePop: { A: number; B: number } = { A: 0, B: 0 };
const TEAM_SCORE_COLORS: Record<Team, number> = { A: 0x7ec8ff, B: 0xff8fa3 };

// ---- boost bar ----
let boostFill1: PIXI.Graphics;

// ---- teleport pips ----
const pipSprites: PIXI.Sprite[]           = [];
const pipTextures: (PIXI.Texture | null)[] = [null, null, null, null, null];

// ---- HUD icon refs (cleared on reset) ----
let hudBoostIcon: PIXI.Sprite | null = null;
let hudTpIcon:    PIXI.Sprite | null = null;

export function initHud(ui: PIXI.Container, W: number, H: number, mySlot: number, playerStyles: PlayerStyles) {
  // ---- score box ----
  const scoreBox = new PIXI.Graphics();
  scoreBox.beginFill(0x000000, 0.5);
  scoreBox.drawRoundedRect(W / 2 - 70, 6, 140, 34, 4);
  scoreBox.endFill();
  ui.addChild(scoreBox);

  PIXI.Assets.load('/assets/ui/score-box.png')
    .then((texture: PIXI.Texture) => {
      const sprite = new PIXI.Sprite(texture);
      sprite.width = 140; sprite.height = 34;
      sprite.position.set(W / 2 - 70, 6);
      ui.addChildAt(sprite, ui.getChildIndex(scoreBox));
      scoreBox.destroy();
    })
    .catch(() => {});

  const colorA = TEAM_SCORE_COLORS.A;
  const colorB = TEAM_SCORE_COLORS.B;

  scoreP1Text = new PIXI.Text('0', { fill: colorA, fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' });
  scoreP1Text.anchor.set(0.5); scoreP1Text.position.set(W / 2 - 28, 23);

  const dashLabel = new PIXI.Text('—', { fill: '#555555', fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' });
  dashLabel.anchor.set(0.5); dashLabel.position.set(W / 2, 23);

  scoreP2Text = new PIXI.Text('0', { fill: colorB, fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' });
  scoreP2Text.anchor.set(0.5); scoreP2Text.position.set(W / 2 + 28, 23);

  matchTimerText = new PIXI.Text('0:00', { fill: '#aaaaaa', fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' });
  matchTimerText.anchor.set(0.5, 0); matchTimerText.position.set(W / 2, 44);

  subtitleText = new PIXI.Text('', { fill: '#888888', fontSize: 11, fontFamily: 'monospace', fontStyle: 'italic' });
  subtitleText.anchor.set(0.5, 0); subtitleText.position.set(W / 2, 62);
  subtitleText.alpha = 0;

  ui.addChild(scoreP1Text, dashLabel, scoreP2Text, matchTimerText, subtitleText);

  // ---- HUD panel below arena ----
  const PANEL_W   = 360;
  const PANEL_H   = 68;
  const PANEL_GAP = 24;
  const PANEL_PAD = 16;
  const ICON_SIZE = 20;
  const ICON_GAP  = 10;
  BAR_W = PANEL_W - PANEL_PAD * 2 - ICON_SIZE - ICON_GAP;
  BAR_H = 12;
  const PIP_SIZE  = 16;
  const PIP_GAP   = 8;

  const PANEL_X  = (W - PANEL_W) / 2;
  const PANEL_Y  = H + PANEL_GAP;
  const ICON_X   = PANEL_X + PANEL_PAD;
  CONTENT_X      = ICON_X + ICON_SIZE + ICON_GAP;
  ROW1_CY        = PANEL_Y + PANEL_H / 4;
  ROW2_CY        = PANEL_Y + PANEL_H * 3 / 4;

  const panelBg = new PIXI.Graphics();
  panelBg.beginFill(0x080812, 0.6).drawRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6).endFill();
  ui.addChild(panelBg);

  const panelBorder = new PIXI.Graphics();
  panelBorder.lineStyle(1, 0xffffff, 0.07).drawRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6);
  ui.addChild(panelBorder);

  PIXI.Assets.load('/assets/ui/hud-panel.png')
    .then((texture: PIXI.Texture) => {
      const sprite = new PIXI.Sprite(texture);
      sprite.width = PANEL_W; sprite.height = PANEL_H;
      sprite.position.set(PANEL_X, PANEL_Y);
      ui.addChildAt(sprite, ui.getChildIndex(panelBg));
      panelBg.destroy();
    })
    .catch(() => {});

  // ---- Row 1: boost icon + bar ----
  hudBoostIcon = new PIXI.Sprite(PIXI.Texture.EMPTY);
  hudBoostIcon.width = ICON_SIZE; hudBoostIcon.height = ICON_SIZE;
  hudBoostIcon.position.set(ICON_X, ROW1_CY - ICON_SIZE / 2);
  hudBoostIcon.tint = 0xffd700;
  ui.addChild(hudBoostIcon);

  PIXI.Assets.load('/assets/ui/hud-boost-icon.png')
    .then((t: PIXI.Texture) => {
      if (!hudBoostIcon) return;
      hudBoostIcon.texture = new PIXI.Texture(t.baseTexture, new PIXI.Rectangle(1, 1, t.orig.width - 2, t.orig.height - 2));
    })
    .catch(() => {});

  const boostBg = new PIXI.Graphics();
  boostBg.beginFill(0x0d0d24).drawRoundedRect(CONTENT_X, ROW1_CY - BAR_H / 2, BAR_W, BAR_H, BAR_H / 2).endFill();
  ui.addChild(boostBg);

  boostFill1 = new PIXI.Graphics();
  ui.addChild(boostFill1);

  // ---- Row 2: teleport icon + pips ----
  hudTpIcon = new PIXI.Sprite(PIXI.Texture.EMPTY);
  hudTpIcon.width = ICON_SIZE; hudTpIcon.height = ICON_SIZE;
  hudTpIcon.position.set(ICON_X, ROW2_CY - ICON_SIZE / 2);
  hudTpIcon.tint = 0xce93d8;
  ui.addChild(hudTpIcon);

  PIXI.Assets.load('/assets/ui/hud-teleport-icon.png')
    .then((t: PIXI.Texture) => {
      if (!hudTpIcon) return;
      hudTpIcon.texture = new PIXI.Texture(t.baseTexture, new PIXI.Rectangle(1, 1, t.orig.width - 2, t.orig.height - 2));
    })
    .catch(() => {});

  pipSprites.length = 0;
  for (let i = 0; i < MAX_TELEPORT_CHARGES; i++) {
    const pip = new PIXI.Sprite(PIXI.Texture.EMPTY);
    pip.width = PIP_SIZE; pip.height = PIP_SIZE;
    pip.position.set(CONTENT_X + i * (PIP_SIZE + PIP_GAP), ROW2_CY - PIP_SIZE / 2);
    pip.tint = 0xce93d8;
    ui.addChild(pip);
    pipSprites.push(pip);
  }
  for (let i = 0; i < 5; i++) {
    PIXI.Assets.load(`/assets/ui/hud-pip-${i}.png`)
      .then((t: PIXI.Texture) => { pipTextures[i] = t; })
      .catch(() => {});
  }

  void mySlot; // reserved for future per-player HUD theming
  void playerStyles;
}

export function showDisconnectNotice(name: string, countA: number, countB: number) {
  subtitleText.text = `${name} left  ·  ${countA}v${countB}`;
  subtitleText.alpha = 1;
  subtitleUntil = performance.now() + SUBTITLE_DURATION;
}

// (#11) shown for the whole reconnect grace period — game keeps running while
// the disconnected player's body sits frozen. Cleared early by
// showReconnectedNotice if they make it back, or replaced by player_left /
// opponent_disconnected if the grace period runs out.
export function showReconnectNotice(name: string, graceMs: number) {
  subtitleText.text = `${name} disconnected — reconnecting…`;
  subtitleText.alpha = 1;
  subtitleUntil = performance.now() + graceMs;
}

export function showReconnectedNotice(name: string) {
  subtitleText.text = `${name} is back!`;
  subtitleText.alpha = 1;
  subtitleUntil = performance.now() + SUBTITLE_DURATION;
}

export function startScorePop(team: Team) {
  scorePop[team] = performance.now();
}

export function tickHud(state: GameState, mySlot: number, now: number) {
  // score text + pop animation — A = left, B = right
  scoreP1Text.text = String(state.score.A);
  scoreP2Text.text = String(state.score.B);
  for (const side of ['A', 'B'] as const) {
    const text = side === 'A' ? scoreP1Text : scoreP2Text;
    if (scorePop[side] > 0) {
      const t = Math.min(1, (now - scorePop[side]) / 400);
      text.scale.set(1 + 0.7 * Math.sin(t * Math.PI));
      if (t >= 1) { text.scale.set(1); scorePop[side] = 0; }
    }
  }

  // subtitle fade-out
  if (subtitleUntil > 0) {
    const remaining = subtitleUntil - now;
    subtitleText.alpha = Math.min(1, remaining / 500);
    if (remaining <= 0) { subtitleText.alpha = 0; subtitleUntil = 0; }
  }

  // match timer
  const mins = Math.floor(state.matchSeconds / 60);
  const secs = state.matchSeconds % 60;
  matchTimerText.text = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  // boost bar — show my player's boost
  const myPs = state.players.find((p) => p.slot === mySlot);
  if (!myPs) return;
  const myPu = myPs.powerUps;

  const fill1  = (myPu.boostBar / BOOST_MAX) * BAR_W;
  const radius = Math.min(BAR_H / 2, fill1 / 2);
  boostFill1.clear();
  if (fill1 > 0) {
    boostFill1.beginFill(0xffd700, 1)
      .drawRoundedRect(CONTENT_X, ROW1_CY - BAR_H / 2, fill1, BAR_H, radius)
      .endFill();
  }

  // teleport pips
  for (let i = 0; i < MAX_TELEPORT_CHARGES; i++) {
    let stage: number;
    if (i < myPu.teleportCharges) {
      stage = 4;
    } else if (i === myPu.teleportCharges && myPu.teleportCooldown > 0) {
      stage = Math.min(3, Math.floor((1 - myPu.teleportCooldown / TELEPORT_COOLDOWN_TICKS) * 4));
    } else {
      stage = 0;
    }
    const tex = pipTextures[stage];
    if (tex && pipSprites[i]) pipSprites[i].texture = tex;
  }
}

export function resetHud() {
  hudBoostIcon = null;
  hudTpIcon    = null;
  pipSprites.length = 0;
  scorePop.A = 0; scorePop.B = 0;
  subtitleUntil = 0;
  if (subtitleText) { subtitleText.text = ''; subtitleText.alpha = 0; }
  if (scoreP1Text)    { scoreP1Text.text    = '0'; scoreP1Text.scale.set(1);    }
  if (scoreP2Text)    { scoreP2Text.text    = '0'; scoreP2Text.scale.set(1);    }
  if (matchTimerText) { matchTimerText.text = '0:00'; }
  if (boostFill1)     boostFill1.clear();
}
