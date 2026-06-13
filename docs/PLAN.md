# Project Plan — very cool awesome

---

## BEFORE YOU WRITE ANY CODE

1. Read this entire document from top to bottom.
2. Note anything ambiguous or unclear.
3. Ask the developer to resolve those questions before touching code.
4. Once questions are answered, begin Stage 0 and work sequentially.
5. Do not skip stages. Do not start a stage until the previous one's deliverable is working.

---

## What this is

A publicly-deployed browser-based 2-player competitive physics soccer game inspired by Rocket League. Two players join a room with a code, pick names, and try to hit a ball into each other's goals. First to 5 wins. The game is fast, hype, colorful, and feels like something a person made — not a product.

This plan is written to be handed to a coding session cold. Every decision, tradeoff, and preference is written out so nothing gets assumed wrong.

---

## Vision

**Tone:** Hype and energetic. The game is excited to exist. Button labels are punchy. Countdowns feel like an event. Winning feels good. Nothing is bland or generic.

**Art:** 32×32 pixel art sprites made in Aseprite by the developer. The pipeline is: AI generates clean flat-color placeholder shapes at the correct pixel dimensions, developer draws over them in Aseprite and exports PNGs, assets drop into `/client/public/assets/` and replace placeholders with no code changes. Arenas are bright and colorful. Each map has its own visual identity — palette, tile theme, vibe. No two maps should feel the same.

**Feel:** The game should feel like a person designed it. Quirky where appropriate, consistent where it matters. If a screen is boring to look at, that's a bug. If error text sounds like a system message, that's a bug.

**Not:** Corporate. Generic. Over-engineered. AI-flavored. Nothing in the UI or code should sound like it came from a template. Not "Start Game Session" — it's "PLAY". Not "An error occurred" — something with personality.

---

## Anti-patterns — actively avoid these

**Code:**
- No unnecessary abstraction layers. If a function does one thing and will never do two, don't wrap it.
- No enterprise naming (`EntityManagerFactory`, `AbstractRenderer`, `ServiceLocator`). Name things what they are.
- Comments explain *why*, not *what*. If the code is clear, don't comment it.
- No over-typed generics that exist to feel clever. Types should help reading, not show off.

**UI copy:**
- No template-sounding copy ("Enter your username", "Game room created successfully").
- No default browser-styled buttons or inputs. Everything looks intentional.
- Error states have personality. Players don't see raw error strings.
- Never use the words: Error, Invalid, Failed, Session, User.

**Architecture:**
- Don't build for hypothetical scale that isn't needed yet.
- Don't solve problems that don't exist yet.

---

## Technology stack — locked, do not change

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | **TypeScript** — mandatory everywhere, no plain JS files | Latest stable |
| Client renderer | **PixiJS** | **v7** |
| Client bundler | **Vite** | Latest stable |
| Server runtime | **Node.js** | v18+ |
| Networking | **Socket.io** | v4 |
| Physics | **Matter.js** (server only) | v0.19 |
| Deployment | **Railway** | — |

**What the client does:** Renders, captures input, interpolates. Nothing else.  
**What the server does:** Owns all game state. Runs physics. Broadcasts truth. Clients cannot change positions.

TypeScript is mandatory on client, server, and shared. If something seems easier in plain JS, write it in TypeScript anyway.

---

## Folder structure

```
/client
  /src
    /scenes       — MainMenu, Lobby, Game, PostGame (one file per scene)
    /rendering    — PixiJS app setup, EntityRenderer, sprite loader
    /network      — socket.io client, typed event handlers
    /input        — keyboard capture
    /ui           — HUD, overlays, screen components
  /assets
    /sprites      — player1.png, player2.png, ball.png (32×32)
    /ui           — buttons, fonts, icons
  index.html
  vite.config.ts
  tsconfig.json

/server
  /src
    /game         — game loop, room lifecycle, scoring
    /physics      — Matter.js wrapper, substep integration
    /rooms        — RoomManager, code generation, player sessions
    /maps         — map loader
  index.ts
  tsconfig.json

/shared
  /types          — all shared TypeScript types (see below)
  /maps           — map definitions
  constants.ts    — TICK_RATE, WIN_SCORE, SUBSTEPS, physics values

package.json      — root, runs client + server concurrently
tsconfig.base.json
```

---

## Shared TypeScript types — use these exactly

These go in `/shared/types/index.ts`. Do not rename or restructure them — other parts of the plan reference them by name.

```typescript
export type Vec2 = { x: number; y: number };

export type PlayerInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  pickaxeActive: boolean;  // true while toggle key is held
  pickaxeAngle: number;    // radians — angle from player center to mouse cursor, computed client-side
};

export type RoomState = 'waiting' | 'countdown' | 'playing' | 'postgame';

export type GameState = {
  p1: Vec2;
  p2: Vec2;
  ball: Vec2;
  score: { 1: number; 2: number };
  wreckingBalls: {
    1: { active: boolean; position: Vec2; velocity: Vec2 };
    2: { active: boolean; position: Vec2; velocity: Vec2 };
  };
};

export type GuestPlayer = {
  id: string;       // socket.id
  name: string;
  playerNumber: 1 | 2;
};

export type RoomInfo = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  state: RoomState;
};

export type MapWall = { x: number; y: number; w: number; h: number };

export type MapGoal = {
  side: 'left' | 'right';
  yMin: number;
  yMax: number;
  scoringPlayer: 1 | 2;
};

export type MapDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: number;   // PixiJS hex color e.g. 0x1a1a2e
  playerStarts: [Vec2, Vec2];
  ballStart: Vec2;
  walls: MapWall[];
  goals: MapGoal[];
};
```

---

## Shared constants — `/shared/constants.ts`

```typescript
export const TICK_RATE   = 30;    // server ticks per second
export const TICK_MS     = 1000 / TICK_RATE;
export const SUBSTEPS    = 4;     // physics steps per tick
export const WIN_SCORE   = 5;

export const PLAYER_RADIUS  = 25;
export const BALL_RADIUS    = 20;
export const PLAYER_SPEED   = 0.015;
export const BALL_RESTITUTION  = 0.8;
export const PLAYER_RESTITUTION = 0.5;
// frictionAir tuned for SUBSTEPS=4: (1 - 0.026)^4 ≈ (1 - 0.1)^1
export const PLAYER_FRICTION_AIR = 0.026;
export const BALL_FRICTION_AIR   = 0.005;
```

---

## Classic map definition — `/shared/maps/classic.ts`

```typescript
import type { MapDefinition } from '../types';

const W = 1200, H = 600, T = 20;
const GOAL_TOP = 200, GOAL_BOTTOM = 400;

export const classicMap: MapDefinition = {
  id: 'classic',
  name: 'Classic Arena',
  width: W,
  height: H,
  backgroundColor: 0x1a1a2e,
  playerStarts: [{ x: 200, y: 300 }, { x: 1000, y: 300 }],
  ballStart: { x: W / 2, y: H / 2 },
  walls: [
    { x: W/2,    y: -T/2,                         w: W, h: T }, // top
    { x: W/2,    y: H + T/2,                       w: W, h: T }, // bottom
    { x: -T/2,   y: GOAL_TOP / 2,                  w: T, h: GOAL_TOP },           // left top
    { x: -T/2,   y: GOAL_BOTTOM + (H-GOAL_BOTTOM)/2, w: T, h: H - GOAL_BOTTOM }, // left bottom
    { x: W+T/2,  y: GOAL_TOP / 2,                  w: T, h: GOAL_TOP },           // right top
    { x: W+T/2,  y: GOAL_BOTTOM + (H-GOAL_BOTTOM)/2, w: T, h: H - GOAL_BOTTOM }, // right bottom
    { x: -60,    y: H / 2,                         w: T, h: H }, // left back wall (catches ball after goal)
    { x: W + 60, y: H / 2,                         w: T, h: H }, // right back wall
  ],
  goals: [
    { side: 'left',  yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringPlayer: 2 },
    { side: 'right', yMin: GOAL_TOP, yMax: GOAL_BOTTOM, scoringPlayer: 1 },
  ],
};
```

---

## Proven patterns — copy these, do not reinvent

These were tested and debugged in a working prototype. Each has a noted failure mode if done differently.

**Physics substeps** — eliminates collision jitter at 30 ticks/s:
```typescript
function stepWorld(engine: Matter.Engine, delta: number, substeps = SUBSTEPS) {
  for (let i = 0; i < substeps; i++) {
    Matter.Engine.update(engine, delta / substeps);
  }
}
```

**Client interpolation** — simple prev/curr lerp. Do NOT use a snapshot buffer (tested; introduces jitter):
```typescript
let prevSnapshot: { state: GameState; time: number } | null = null;
let currSnapshot: { state: GameState; time: number } | null = null;

// on state received:
prevSnapshot = currSnapshot;
currSnapshot = { state, time: performance.now() };

// in render loop:
function getInterpolatedState(): GameState | null {
  if (!currSnapshot) return null;
  if (!prevSnapshot) return currSnapshot.state;
  const t = Math.min(1, (performance.now() - currSnapshot.time) / TICK_MS);
  const a = prevSnapshot.state, b = currSnapshot.state;
  return {
    p1:   { x: lerp(a.p1.x,   b.p1.x,   t), y: lerp(a.p1.y,   b.p1.y,   t) },
    p2:   { x: lerp(a.p2.x,   b.p2.x,   t), y: lerp(a.p2.y,   b.p2.y,   t) },
    ball: { x: lerp(a.ball.x, b.ball.x, t), y: lerp(a.ball.y, b.ball.y, t) },
    score: b.score,
  };
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
```

**Stuck key fix** — prevents inputs from being stuck when switching tabs:
```typescript
window.addEventListener('blur', () => {
  for (const k in keys) keys[k as keyof typeof keys] = false;
});
```

**Goal detection** — server-side, called after each physics step:
```typescript
function checkGoal(ball: Matter.Body, map: MapDefinition): 1 | 2 | null {
  for (const goal of map.goals) {
    const inRange = ball.position.y > goal.yMin && ball.position.y < goal.yMax;
    if (!inRange) continue;
    if (goal.side === 'left'  && ball.position.x < 0)          return goal.scoringPlayer;
    if (goal.side === 'right' && ball.position.x > map.width)  return goal.scoringPlayer;
  }
  return null;
}
```

**Countdown** — server-side, pauses the tick loop during it:
```typescript
function startCountdown(io: Server, roomId: string, callback: () => void) {
  [3, 2, 1].forEach((n, i) => {
    setTimeout(() => io.to(roomId).emit('countdown', n), i * 1000);
  });
  setTimeout(() => io.to(roomId).emit('countdown', 'GO!'), 3000);
  setTimeout(callback, 3500);
}
// During countdown, set room.scoring = true so the tick loop skips physics
```

---

## Stage 0 — Repository & tooling

**Deliverable:** `npm run dev` at the root starts both servers with no errors.

- Monorepo: `/client`, `/server`, `/shared` — each with their own `tsconfig.json` extending `tsconfig.base.json`
- Root `package.json` uses `concurrently` to run Vite dev server and `tsx watch server/src/index.ts` together
- Vite configured with `@shared` path alias pointing to `/shared`
- ESLint + Prettier configured at root, enforced
- `/shared/types/index.ts`, `/shared/constants.ts`, and `/shared/maps/classic.ts` created with the exact content from this document

---

## Stage 1 — Authoritative server core

**Deliverable:** Server runs a physics loop at 30 ticks/s and logs game state each second.

- Matter.js engine created with gravity disabled, walls and bodies from the classic map
- `createPhysics(map: MapDefinition)` returns `{ engine, player1, player2, ball }`
- `applyInputs(body, input: PlayerInput)` applies force per direction key
- `stepWorld(engine, delta)` runs with 4 substeps
- `getState(p1, p2, ball): GameState` returns current positions
- Game loop runs with `setInterval(TICK_MS)` — no networking yet
- Verify: console log shows ball position changing when you temporarily hard-code a moving input

---

## Stage 2 — Room system

**Deliverable:** Two rooms can run simultaneously without interfering.

- `RoomManager` class creates rooms keyed by code, cleans up on empty
- Room codes: 4 chars, uppercase, alphabet only excluding `O` and `I` (no ambiguous chars)
- Room lifecycle: `waiting → countdown → playing → postgame`
- Each room has its own `setInterval` game loop, started on second player join
- Room stores: `code`, `state`, `players: GuestPlayer[]`, `inputs`, `score`, `physics`
- On disconnect mid-game: stop loop, wait 10s for reconnect before ending match
- Verify: create two rooms in code, run both loops simultaneously, confirm no state bleed

---

## Stage 3 — Networking

**Deliverable:** Two browser tabs connect, send inputs, receive state.

**Server → client events:**

| Event | Payload | When |
|-------|---------|------|
| `assigned` | `{ playerNumber: 1\|2, map: MapDefinition, roomCode: string }` | On join |
| `state` | `GameState` | Every tick |
| `goal` | `{ scorer: 1\|2, score: GameState['score'], winner?: 1\|2 }` | On goal |
| `countdown` | `number \| 'GO!'` | During countdown |
| `full` | — | Room at capacity |
| `opponent_disconnected` | — | Other player left mid-game |

**Client → server events:**

| Event | Payload | When |
|-------|---------|------|
| `create_room` | `{ name: string }` | Player creates room |
| `join_room` | `{ code: string, name: string }` | Player joins with code |
| `input` | `PlayerInput` | Every tick |

---

## Stage 4 — Core gameplay

**Deliverable:** Two players, fully playable — movement, ball, goals, scoring, win.

- Classic map loaded from `/shared/maps/classic.ts`
- Client renders via plain Canvas for now (PixiJS comes in Stage 5)
- Client interpolation implemented using the proven pattern from this document
- Stuck key fix applied
- Goal detection, scoring, countdown, and win condition all working
- Physics values: `PLAYER_SPEED = 0.015`, `frictionAir = 0.026`, `ballRestitution = 0.8`

---

## Stage 5 — PixiJS rendering

**Deliverable:** Game renders via PixiJS v7. Sprites can be swapped in by dropping a PNG into `/client/public/assets/sprites/` with no code changes.

- PixiJS `Application` replaces Canvas rendering from Stage 4
- Render layers (PixiJS Containers, back to front): `background → walls → entities → effects → ui`
- `EntityRenderer` wraps a `Graphics` or `Sprite`. If `/assets/sprites/{name}.png` exists it uses it; otherwise falls back to a colored shape
- Placeholder shapes: player circles at 32×32, ball circle at 20×20
- Arena background color comes from `map.backgroundColor`
- Map `backgroundColor` for classic: `0x1a1a2e` (dark navy)

**Art pipeline:**
1. AI generates flat-color 32×32 reference PNGs for: `player1`, `player2`, `ball`
2. Developer redraws in Aseprite, exports PNGs at 32×32
3. Drop into `/client/public/assets/sprites/` — rendering upgrades automatically

---

## Stage 6 — Main menu, lobby, game flow

**Deliverable:** Full flow from URL open to post-game rematch.

**Screens and exact copy:**

**Main menu:**
- Animated background: idle physics loop (no players), ball bouncing around behind the title
- Game title large and centered
- Text input — placeholder: `"what do they call you?"`
- Two buttons: `CREATE ROOM` and `JOIN ROOM`

**Create room:**
- Room code displayed large
- One-click copy — button text briefly changes to `"copied!"`
- Status: `"waiting for someone to join..."`

**Join room:**
- 4-char input, auto-capitalizes
- Button: `JOIN`
- Wrong code: `"hmm, that room doesn't exist"`
- Room full: `"that room's full, sorry!"`

**Lobby:**
- Both player names shown
- `READY` button per player
- Countdown starts when both ready
- Host gets `START ANYWAY` after 10s

**In-game HUD:**
- Score centered at top in player colors
- Player names above sprites
- Countdown overlay: full-screen semi-transparent with large number

**Post-game:**
- Winner name + `WINS!` in their color, large
- `REMATCH` button — back to lobby, same room
- `LEAVE` button — back to main menu

**Copy rules:**
- Lowercase default, UPPERCASE for action buttons
- Short. No filler.
- Never: Error, Invalid, Failed, Session, User

---

## Stage 7 — Power-up system

**Deliverable:** Speed boost, teleportation, and pickaxe all working in-game.

**Decide at this stage:** pickups on the arena vs cooldown-based abilities for speed boost and teleportation. Let playtesting from Stages 4–6 inform this. Either way, all power-up state lives entirely on the server.

---

### Speed boost
- Force multiplier applied for a fixed duration (e.g. 2s)
- Multiplier must stay ≤ 2.0 — higher values cause collision tunneling at 30 ticks/s

---

### Teleportation
- `Body.setPosition` called server-side to the target position
- Target validation: within arena bounds, not overlapping any wall body
- Client sends desired destination as part of input (add `teleportTarget?: Vec2` to `PlayerInput` when implementing)

---

### Wrecking ball on a chain — the most complex mechanic

**What it is:** A heavy ball tethered to the player by a chain (Matter.js `Constraint`). Toggled with a key (e.g. `E`). When deployed, the ball is launched in the mouse direction and swings around on the chain. It's a real physics body — it bounces off walls, smashes the game ball, and pulls the player when the chain goes taut. The physics engine handles all of this naturally.

**Behaviour:**
- **Hitting the game ball:** Matter.js collision — the wrecking ball's mass and velocity transfer naturally. No special code needed beyond making the body collidable.
- **Hitting a wall:** The wrecking ball bounces off. If the chain is fully extended when it does, the constraint pulls the player toward the impact point — effectively a grapple.
- **Retracting:** Removing the wrecking ball body and constraint from the world when toggled off.

**How the client sends it:**
```typescript
// pickaxeAngle = angle from player center to mouse cursor, sent every tick
const dx = mouseX - playerPos.x;
const dy = mouseY - playerPos.y;
pickaxeAngle = Math.atan2(dy, dx);
```
`pickaxeActive` is `true` while the toggle key is held. The server only reads `pickaxeAngle` at the moment `pickaxeActive` transitions from `false → true` (the throw moment).

**How the server handles it:**

*On deploy (pickaxeActive transitions false → true):*
```typescript
const CHAIN_LENGTH  = 120;  // max distance from player, in px — tune this
const BALL_RADIUS   = 12;
const LAUNCH_SPEED  = 8;    // initial velocity magnitude — tune this

const wreckingBall = Bodies.circle(
  player.position.x + Math.cos(angle) * BALL_RADIUS,
  player.position.y + Math.sin(angle) * BALL_RADIUS,
  BALL_RADIUS,
  { restitution: 0.6, friction: 0, label: 'wreckingBall', density: 0.004 }
);
Body.setVelocity(wreckingBall, {
  x: Math.cos(angle) * LAUNCH_SPEED,
  y: Math.sin(angle) * LAUNCH_SPEED,
});

const chain = Constraint.create({
  bodyA: player,
  bodyB: wreckingBall,
  length: CHAIN_LENGTH,
  stiffness: 0.05,  // low stiffness = rope-like, not rigid. Tune this.
  damping: 0.01,
});

World.add(world, [wreckingBall, chain]);
// store wreckingBall and chain on the room's physics state for this player
```

*On retract (pickaxeActive transitions true → false):*
```typescript
World.remove(world, [wreckingBall, chain]);
// clear from room physics state
```

*Every tick when active:*
Include `{ active: true, position: wreckingBall.position, velocity: wreckingBall.velocity }` in `GameState.wreckingBalls[playerNumber]`.

**How the client renders it:**
- Draw a line from the player center to `wreckingBall.position` (the chain)
- Draw a circle at `wreckingBall.position` (the ball)
- Both are PixiJS `Graphics` draws — no sprite needed, though a 32×32 sprite for the ball head would look great

**Tuning constants (add to `/shared/constants.ts`):**
```typescript
export const WRECKING_BALL_RADIUS  = 12;
export const WRECKING_BALL_DENSITY = 0.004;
export const CHAIN_LENGTH          = 120;
export const CHAIN_STIFFNESS       = 0.05;  // 0 = no pull, 1 = rigid rod
export const CHAIN_DAMPING         = 0.01;
export const LAUNCH_SPEED          = 8;
```

**Key implementation notes:**
- `stiffness` is the most important feel parameter. Low (0.02–0.05) = floppy rope, satisfying swing. High (0.5+) = rigid, less fun.
- The wrecking ball colliding with the game ball is handled entirely by Matter.js — no special collision code needed.
- If the chain pulls the player too aggressively into walls, increase `damping`.
- `density` controls how heavy the wrecking ball feels. Higher = more momentum transfer to the game ball on impact.

---

## Stage 8 — Deployment

**Deliverable:** Live public URL.

- Railway connected to GitHub, auto-deploys on push to `main`
- `PORT` from `process.env.PORT` (Railway sets this)
- Vite builds to `/client/dist`, Express serves it as static files
- Socket.io: websocket transport with polling fallback
- `GET /healthz` returns `200 OK`
- `.env.example` committed, `.env` gitignored

---

## Stage 9 — Visual polish

**Deliverable:** The game feels alive and reactive. Every significant moment has visual feedback.

- **Particles:** burst on ball hit (scaled to impact velocity), goal celebration explosion, wrecking ball impact sparks — implemented as a simple client-side particle pool (position, velocity, lifetime, color — no library needed)
- **Screen shake:** on goal and hard ball hits, intensity proportional to impact — short duration, decays quickly, client-side only
- **Boost trail:** particle trail behind the player while boosting, in the player's color
- **Score pop:** goal scored triggers the scorer's number scaling up then snapping back — PixiJS scale tween
- **Countdown slam:** each number scales from large → normal with a quick ease, feels like an event rather than a label changing
- **Button states:** hover and press visual feedback on all UI buttons — no default browser styling visible anywhere
- **Screen transitions:** short fade (100–150ms) between menu, lobby, and game screens
- **Goal box geometry:** replace the flat goal gate barrier with a proper recessed goal box — add side walls to `classicMap` that frame the opening and extend outward, remove the flat gate. Players can enter the goal box freely (like Rocket League) but can't escape sideways. Back wall already exists. Requires wall additions to `/shared/maps/classic.ts` and removing the goal gate logic from `physics.ts`
- All visual polish changes are client-side only except the goal box geometry (map + physics)

---

## Stage 10 — Sound effects

**Deliverable:** The game sounds satisfying. Every impactful moment has audio feedback.

- **Library:** Howler.js — simpler API than raw Web Audio, handles format fallbacks automatically
- **Asset pipeline:** drop audio files into `/client/public/assets/sounds/` — same philosophy as sprites. Formats: `.mp3` with `.ogg` fallback
- **Sounds to implement:**

| Sound | Trigger | Notes |
|-------|---------|-------|
| Ball hit | Ball collides with player or wall | Pitch/volume scaled to impact velocity |
| Goal scored | `goal` event received | Distinct, celebratory |
| Boost activate | Shift held + boost bar non-empty | Short punchy burst |
| Teleport | Teleport executes successfully | Blink/whoosh feel |
| Wrecking ball launch | E pressed, ball fires | Impact launch sound |
| Wrecking ball return | Ball arrives back at player | Satisfying thud/snap |
| Win sting | `winner` in goal event | Short victory fanfare |

- All triggered client-side from events already in the state stream — no new server events or shared type changes needed
- Volume controls respected — no sound plays if the tab is backgrounded (Howler handles this)

---

## Stage 11 — Extended modes *(post-launch)*

- **2v2 / 3v3:** Add team assignment to `RoomConfig`, track score per team in `GameState`
- **Free for all:** No teams, individual scores, `maxPlayers` up to 6
- **More maps:** Add a file to `/shared/maps/`, register it — no other code changes
- **Spectator mode:** Socket joins as `spectator` role, receives state, sends nothing, not counted toward capacity

---

## Stage 12 — Automated tests

**Deliverable:** Confidence that the authoritative server logic behaves correctly, backed by an automated test suite that runs via `npm test`.

- **Tooling:** Vitest — pairs naturally with the existing Vite setup, works for TS on both client and server without extra config
- **Focus:** server-side game logic only (`physics.ts`, `game.ts`, `rooms.ts`) — this is the authoritative, highest-value code, and it's deterministic enough to test without DOM/canvas mocking
- **Unit tests to cover:**
  - Goal detection at various ball positions, velocities, and angles
  - Win condition triggers at exactly `WIN_SCORE`
  - Room lifecycle — create, join, full, leave, disconnect, rematch
  - Power-up math — boost drain rate, teleport cooldown ticks, wrecking ball max distance and retract behavior
- **Stretch (optional):** physics-stepping tests that run the Matter.js world forward N ticks and assert resulting state stays within tolerance — useful but fiddly (floating point, timing assumptions)
- **Explicitly out of scope:** client/UI/rendering tests (PixiJS, particles, DOM screens) and full end-to-end tests — both require heavy mocking/scaffolding for low payoff right now; human playtesting covers that ground better
- All new tests live alongside the code they test or in a parallel `__tests__` structure — keep it simple, no custom test framework abstractions

---

## Parked ideas — revisit later

Surfaced during discussion but deliberately not scheduled into a stage yet:

- **Goal pocket visibility:** the recessed goal box (added in Stage 9) sits outside the current canvas viewport (`x < 0` / `x > map.width`), so a player who skates into the net becomes invisible — clipped off-canvas rather than hidden behind anything. Proposed fix: widen the PixiJS `Application` canvas (and its CSS sizing) by roughly 70px on each side so both goal pockets stay in frame at all times. Would also need a visual treatment for the newly-visible "behind the net" strip — e.g., tinting/highlighting each goal pocket in its defending player's color.
- **Back-wall scoring (arcade-style goal-line save mechanic):** currently a goal counts the instant the ball's center crosses the front goal line (`ball.x < 0` / `ball.x > map.width`), which matches real soccer's "fully crosses the line = goal" rule. A discussed alternative would require the ball to travel further back and strike the net/back wall before the goal counts — a deliberate departure from real soccer rules that would let defenders contest balls that have already crossed the line for a brief "last-ditch save" window. Worth prototyping to see if it adds excitement or just frustration before committing either way.

---

## Done criteria per stage

| Stage | It's done when |
|-------|---------------|
| 0 | `npm run dev` starts clean, no TS errors |
| 1 | Server logs ball position changing 30×/s |
| 2 | Two independent rooms run simultaneously |
| 3 | Two tabs connect, state flows, inputs handled |
| 4 | Two players move, collide, score, win |
| 5 | PixiJS rendering, sprite swap works |
| 6 | Menu → room → lobby → game → post-game → rematch |
| 7 | Speed boost, teleport, and wrecking ball all feel good — ball swings on chain, smashes game ball, and pulls player when chain goes taut against a wall |
| 8 | Public URL, anyone can play |
| 9 | Every major game moment has a visual reaction — particles, shake, animations all firing |
| 10 | Every major game moment has a sound — game feels empty without audio |
| 11 | Multiple modes selectable from lobby, all stable |
| 12 | `npm test` runs and passes, covering goal detection, win conditions, room lifecycle, and power-up math |
