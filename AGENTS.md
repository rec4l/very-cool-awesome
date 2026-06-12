# very cool awesome — Project Context

## What this is
A browser-based 2-player competitive physics soccer game (Rocket League-inspired). Two players join a room with a code, pick names, and try to hit a ball into each other's goal. First to 5 wins.

This is a CSE 190 assignment. The developer draws pixel art sprites in Aseprite and has specific aesthetic preferences — hype and energetic tone, punchy UI copy, no corporate-sounding text.

## Tech stack — locked, do not change
| Layer | Technology |
|-------|-----------|
| Language | TypeScript everywhere — no plain JS |
| Client renderer | PixiJS v7 |
| Client bundler | Vite v4 |
| Server runtime | Node.js v18+ |
| Networking | Socket.io v4 |
| Physics | Matter.js v0.19 (server only) |
| Deployment | Render (Stage 8 — live) |

## Monorepo structure
```
/client/src
  /scenes     — Game.ts (PixiJS), MainMenu.ts (canvas animation)
  /rendering  — EntityRenderer.ts (auto sprite-swap on PNG drop)
  /audio      — sounds.ts (Howler.js wrapper, auto sound-swap on file drop)
  /network    — socket.ts
  /input      — keyboard.ts, mouse.ts
/server/src
  index.ts    — socket.io event handlers
  game.ts     — game loop, power-up logic, goal detection
  physics.ts  — all Matter.js operations
  rooms.ts    — RoomManager, Room type, room lifecycle
/shared
  types/index.ts   — all shared TypeScript types
  constants.ts     — all tuning values (edit here for feel changes)
  maps/classic.ts  — classic arena map definition
```

## What's done (Stages 0–9)
- **Stage 0** — monorepo, Vite, tsx, ESLint, Prettier
- **Stage 1** — authoritative physics loop at 30 ticks/s
- **Stage 2** — room system with isolated physics per room
- **Stage 3** — full Socket.io networking, typed events
- **Stage 4** — playable game with canvas rendering
- **Stage 5** — PixiJS rendering with auto sprite-swap pipeline
- **Stage 6** — full game flow: main menu → create/join → lobby → game → post-game → rematch
- **Stage 7** — speed boost (bar + pickups), teleportation (Q key + range circle), wrecking ball (E key, cursor-driven)
- **Stage 8** — deployed to Render (public URL, Express serves built client)
- **Stage 9** — visual polish: particles (impact/goal/boost trail/teleport), screen shake (goal only, toggleable via `SCREEN_SHAKE`), score pop, countdown slam animation, button hover/press states, screen fade transitions, settings preview panel, pastel color palette, recessed goal box geometry (players can skate into the net and get boxed in, like Rocket League — flat `goalGate` barrier removed, side walls added to `classicMap`)

## What's left
- **Stage 10** — sound effects (Howler.js)
- **Stage 11** — extended modes (2v2/3v3, FFA, more maps, spectator mode) — post-launch
- **Stage 12** — automated tests (Vitest, server-side game logic)

## Running locally
```
npm run dev          # starts both Vite (port 3000) and server (port 3001)
npm run dev:client   # Vite only
npm run dev:server   # server only
```

## Key architectural decisions

**Authoritative server** — all game state lives on the server. Clients send inputs, receive state. Clients never set positions.

**Client interpolation** — clients lerp between the previous and current server snapshot using `performance.now()`. Do NOT use a snapshot buffer (tested; causes jitter). See the proven pattern in `client/src/scenes/Game.ts`.

**Physics substeps** — `SUBSTEPS = 8` (was 4, doubled to prevent tunneling at high speeds). `PLAYER_FRICTION_AIR = 0.05` is the tuned value at SUBSTEPS=8.

**Wrecking ball** — projectile-style, not swing physics. E key fires a ball toward the cursor at `LAUNCH_SPEED`. Server tracks max distance and whether it hit something; once either threshold is met it retracts via `applyRetractForce` each tick until the ball is close enough to the player, then it's removed from the world. No Matter.js Constraint is used.

**Boost friction** — no frictionAir change during boost. Just `BOOST_FORCE_MULTIPLIER = 1.5` applied to `applyInputs`. Same friction = predictable 50% faster terminal velocity.

## Sprite pipeline
Drop a PNG into `client/public/assets/sprites/` named `player1.png`, `player2.png`, or `ball.png`. `EntityRenderer.ts` auto-swaps on load, falls back to colored circles. No code changes needed.

Placeholder sprites already exist (32×32 colored circles). Developer draws over them in Aseprite at 32×32.

## Sound pipeline
Drop an audio file into `client/public/assets/sounds/` named to match: `hit`, `goal`, `boost`, `teleport`, `wb-launch`, `wb-return`, `win` — any of `.mp3`, `.ogg`, or `.wav` work (the loader probes each extension in order and uses whichever exists, since Howler's own format auto-detection only checks codec support, not whether the file is actually present). `audio/sounds.ts` (Howler.js) loads them on startup and plays on the matching game event — missing files fail silently so the game runs fine without audio. No code changes needed once files are in place.

## Controls
| Key | Action |
|-----|--------|
| WASD / arrows | Move |
| Shift (hold) | Speed boost (drains bar, collect gold pickups to refill) |
| Q | Toggle teleport mode (shows range circle, click to teleport, 4s cooldown) |
| E (hold) | Deploy wrecking ball toward cursor; release to retract |

## Important constants (all in `/shared/constants.ts`)
| Constant | Value | Notes |
|----------|-------|-------|
| TICK_RATE | 30 | Server ticks per second |
| SUBSTEPS | 8 | Physics steps per tick — do not lower |
| WIN_SCORE | 5 | Goals to win |
| PLAYER_SPEED | 0.015 | Force per tick per direction |
| PLAYER_FRICTION_AIR | 0.05 | Tuned for SUBSTEPS=8 |
| BOOST_FORCE_MULTIPLIER | 1.5 | ~50% faster top speed |
| BOOST_DRAIN_PER_TICK | BOOST_MAX/(3×30) | Full bar empties in 3s |
| TELEPORT_RANGE | 200 | Pixels |
| TELEPORT_COOLDOWN_TICKS | 120 | 4 seconds at 30 ticks/s |
| CHAIN_LENGTH | 240 | Max WB travel distance in pixels |

## Collaboration preferences
- Explain design decisions before coding non-trivial choices — wait for confirmation
- Ask when something is ambiguous rather than guessing
- Keep code simple and readable — no clever abstractions beyond the task
- No extra features beyond what's asked
- Comments only for non-obvious WHY, not WHAT

## Known issues / things to watch
- `BOOST_FORCE_MULTIPLIER` must stay ≤ 2.0 — higher values cause collision tunneling at 30 ticks/s
- Shift key held + WASD: keyboard.ts uses `e.key.toLowerCase()` to handle the uppercase letter case correctly — don't revert this
- PixiJS Text `fill` accepts strings (`'#ffffff'`) or hex numbers — be consistent within a block
- Wrecking ball retract: `applyRetractForce` runs pre-step (so physics sees the pull), distance check runs post-step (so we read the settled position). Both passes are required.
