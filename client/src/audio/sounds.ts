import { Howl, Howler } from 'howler';

// ---- sound asset pipeline ----
// Drop an audio file into /client/public/assets/sounds/ named to match a key below,
// in any of the formats listed in EXTENSIONS (e.g. hit.ogg, teleport.wav).
// Same philosophy as the sprite pipeline — no code changes needed once a file
// is in place, and a missing sound fails silently so the game still runs.
//
// Note: Howler's `src` array picks ONE format up front based on what the
// browser's codec supports (almost always .mp3) — it does not try the next
// entry if that file 404s. So instead we probe each extension in order
// ourselves and use whichever file actually exists.
const SOUND_NAMES = [
  'hit',
  'goal',
  'boost',
  'teleport',
  'wb-launch',
  'wb-return',
  'win',
  'collision',
  'wall',
  'pickup',
] as const;

const EXTENSIONS = ['mp3', 'ogg', 'wav'] as const;

type SoundName = (typeof SOUND_NAMES)[number];

const sounds = {} as Record<SoundName, Howl>;

function loadSound(name: SoundName, extIndex = 0) {
  if (extIndex >= EXTENSIONS.length) return; // no file found for this name — stays silent
  const ext = EXTENSIONS[extIndex];
  sounds[name] = new Howl({
    src: [`/assets/sounds/${name}.${ext}`],
    format: [ext],
    preload: true,
    onloaderror: () => loadSound(name, extIndex + 1), // try the next extension
  });
}

for (const name of SOUND_NAMES) loadSound(name);

function play(name: SoundName, { volume = 1, rate = 1 }: { volume?: number; rate?: number } = {}) {
  const howl = sounds[name];
  if (!howl) return;
  const id = howl.play();
  if (typeof id !== 'number') return; // not yet loaded — Howler returns false
  howl.volume(volume, id);
  howl.rate(rate, id);
}

// ---- opponent attenuation ----
// Opponent sounds play at ~55% volume to cue "that wasn't me" without being silent.
const OPP_VOL = 0.55;

// ---- user mute preference (persisted to localStorage) ----
// muteAll/unmuteAll are used for the brief goal-reset window; they respect this flag
// so the mute button state isn't clobbered by a goal event.
let userMuted = localStorage.getItem('muted') === 'true';
if (userMuted) Howler.mute(true);

export function setUserMuted(v: boolean) {
  userMuted = v;
  Howler.mute(v);
  localStorage.setItem('muted', String(v));
}

export function isUserMuted() { return userMuted; }

export function muteAll()   { Howler.mute(true); }
export function unmuteAll() { if (!userMuted) Howler.mute(false); }

// ---- public triggers — one per game moment, called from Game.ts ----

export function playHit(impactMag: number) {
  const t = Math.min(1, impactMag / 15);
  play('hit', { volume: 0.3 + t * 0.7, rate: 0.9 + t * 0.3 });
}

export function playGoal() {
  play('goal', { volume: 0.7 });
}

// opponent = true → attenuated so the player can tell it wasn't their action
export function playBoostStart(opponent = false) {
  play('boost', { volume: opponent ? 0.14 * OPP_VOL : 0.14 });
}

export function playTeleport(opponent = false) {
  play('teleport', { volume: opponent ? OPP_VOL : 1 });
}

export function playWreckingBallLaunch(opponent = false) {
  play('wb-launch', { volume: opponent ? 0.3 * OPP_VOL : 0.3 });
}

export function playWreckingBallReturn(opponent = false) {
  play('wb-return', { volume: opponent ? OPP_VOL : 1 });
}

export function playWin() {
  play('win');
}

export function playCollision(impactMag: number) {
  const t = Math.min(1, impactMag / 10);
  play('collision', { volume: 0.1 + t * 0.25, rate: 0.85 + t * 0.25 });
}

export function playWall(impactMag: number) {
  const t = Math.min(1, impactMag / 10);
  play('wall', { volume: 0.1 + t * 0.25, rate: 0.85 + t * 0.25 });
}

export function playPickup() {
  play('pickup', { volume: 0.8 });
}
