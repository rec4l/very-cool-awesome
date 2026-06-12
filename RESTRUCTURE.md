# RESTRUCTURE.md — very cool awesome

What needs to change to reach the full vision in PLAN.md. Organized by priority: bugs first, then unfinished stages, then polish, then future modes.

---

## Active Bugs (fix before anything else)

### 1. Teleport range circle renders over corner masks
In `Game.ts`, `teleportGraphics` lives in the `effects` container (render index 3), which draws on top of the `walls` container (index 1). The corner triangle masks are in `walls`. So the purple range circle bleeds into the beveled corners visually. Fix: clip `teleportGraphics` drawing to arena bounds `(0, 0, W, H)` using a rectangular clipping mask, or move the corner masks above effects.

### 3. Join room allows empty name
In `main.ts`, the join handler falls back to `'player'` instead of requiring a real name like the create handler does:
```ts
const name = nameInput.value.trim() || 'player'; // allows blank name
```
Should show a focus + error if name is empty, matching the `btn-create` behavior.

### 4. Winner color is hardcoded
`main.ts` line ~296 hardcodes `'#4fc3f7'` for player 1 and `'#ff7043'` for player 2 on the postgame screen regardless of the player's chosen custom color. Should derive from the player's actual `color` value stored in `playerNames` or `playerStyles`.

---

## Stage 8 — Deployment (almost done, one gap)

The server already has:
- `GET /healthz` → `{ ok: true }`
- `express.static` serving `client/dist`
- `process.env.PORT` fallback

**What's missing:**
- `.env.example` committed to repo (`.env` itself gitignored) — required by PLAN.md Stage 8
- Verify Railway auto-deploy config is wired to `main` branch

---

## Stage 9 — Visual Polish (not started)

These are all the items from PLAN.md Stage 9. None are implemented yet.

### 9a. Client-side particle pool
Simple object pool: `{ x, y, vx, vy, life, maxLife, color, radius }`. No library. Render in the PixiJS `effects` container each tick; step positions manually.

**Triggers needed:**
- Ball hits player or wall → burst scaled to impact velocity
- Goal scored → celebration explosion at ball position
- Wrecking ball impact → sparks at collision point
- Boost active → trail behind local player in their color

The server emits `state` every tick, which already includes ball position and velocity. For impact events specifically, consider adding a lightweight `ball_impact` server event with velocity magnitude, OR detect large frame-over-frame velocity changes client-side.

### 9b. Screen shake
Client-side only. On `goal` event and on hard ball hits: offset the entire PixiJS stage `x/y` by a decaying random amount for ~300ms. Intensity proportional to impact.

### 9c. Score pop animation
When `goal` event fires, scale the scorer's score text up (e.g. `scale(1.6)`) then animate back to `1.0` over ~400ms using the PixiJS ticker. No library needed — manual lerp in the ticker.

### 9d. Countdown slam animation
Each countdown number should scale from large (e.g. 2.5×) → normal (1×) with a quick ease-in. Currently the countdown overlay just swaps text. Add a scale animation in `receiveCountdown`.

### 9e. Button hover/press visual feedback
All UI buttons need CSS-level hover and active states. No default browser styling should be visible. Check every `<button>` in `index.html` — confirm `:hover` and `:active` are styled intentionally.

### 9f. Screen fade transitions
Short (~120ms) opacity fade between menu, lobby, and game screens. Currently screens are shown/hidden instantly via `display`. A simple CSS `opacity` transition on `.screen` with a brief JS delay before hiding the old screen would work.

### 9g. Goal box geometry (requires server + map changes)
PLAN.md Stage 9 calls for replacing the flat invisible goal gate with a recessed goal box. Currently `physics.ts` adds a flat 20px gate body at each goal. The desired final shape: side walls framing the opening + the existing back wall, so players can enter the goal box freely but can't escape sideways.

**Files to change:** `shared/maps/classic.ts` (add side wall segments for the goal box), `physics.ts` (remove the `goalGate` body creation — no longer needed once the geometry handles it), all 3 maps.

---

## Stage 10 — Sound Effects (not started)

PLAN.md specifies Howler.js. No sound exists yet.

**What needs to happen:**
1. `npm install howler` + `@types/howler` in `client/`
2. Create `/client/assets/sounds/` — developer drops `.mp3` + `.ogg` pairs here
3. Create `client/src/audio/sounds.ts` — thin wrapper that loads sounds lazily and exposes typed trigger functions
4. Wire triggers to existing socket events in `main.ts` and the PixiJS ticker in `Game.ts`:

| Sound | Where to trigger |
|-------|-----------------|
| `ball_hit` | Client-side velocity delta check in ticker, or new server event |
| `goal` | `socket.on('goal', ...)` in `main.ts` |
| `boost_on` | In ticker when `isBoosting && !wasBoosting` |
| `teleport` | After teleport click confirmed (clear `pendingTeleport`) |
| `wb_launch` | When `wb.active` transitions false→true in ticker |
| `wb_return` | When `wb.active` transitions true→false in ticker |
| `win_sting` | `socket.on('goal', ...)` when `winner` is present |

---

## Stage 11 — Extended Modes (post-launch)

None of these exist yet. Don't build until Stages 9 and 10 are done.

- **2v2 / 3v3:** Add `team: 1 | 2` to `GuestPlayer`, add `maxPlayers` and `teamScores` to `RoomState`, update `RoomManager` to support up to 4–6 sockets, update `GameState` with per-team positions
- **Free for all:** Remove teams, individual scores, `maxPlayers` up to 6
- **More maps:** Add a file to `/shared/maps/`, register in `MAPS` — no other changes needed (the system already supports this)
- **Spectator mode:** Add `role: 'player' | 'spectator'` to `GuestPlayer`, server sends state but ignores inputs from spectators, not counted toward capacity

---

## Developer Note Items (from note.md)

These are the dev's own issues on top of the plan stages.

| Item | Status | What to do |
|------|--------|-----------|
| Skins and emojis | Not implemented | Emoji support in player names (filter/render); skin system needs design |
| New modes | Not started | → Stage 11 |
| Corners "kind of weird" | Partial — bevel exists | Tune `CORNER_BEVEL` value and bevel body dimensions; test that ball doesn't stick or bounce oddly |
| Infinite WB timer | Intentional — no max cap by design | No action needed |
| Teleport conserve momentum | Needs verification | `setPosition` preserves velocity — momentum IS conserved already. Test if this feels correct or if the intent is something else |
| Move abilities off arena | UI design question | Likely means: don't render the boost pickup dots inside the arena; move them to corners or the HUD strip |
| Abilities only visible to user | Partial — teleport circle is local-only; WB renders for both | WB should be visible to both players (it's a physical object). This note may be stale or mean something specific |
| 3 teleports + adjust visuals | Done — `MAX_TELEPORT_CHARGES = 3`, icons implemented | Verify the charge icon UI looks right at 3 charges |
| Require name to join | Bug | → Bug #3 above |
| WB heavier | Feel tweak | Increase `WRECKING_BALL_DENSITY` in `constants.ts` — currently `0.004` |
| Render enemy with red circle | Partially done | `EntityRenderer` accepts a `ringColor` — enemy gets team color ring, local player gets white. Could make enemy explicitly red |
| Teleport circle below corner | Bug | → Bug #2 above |
| Fix powerup UI | Unclear scope | Test the HUD panel layout at different resolutions; check boost bar and teleport icons align |
| Fix emoji | Likely broken emoji rendering | Emoji in player names probably breaks the PixiJS `PIXI.Text` monospace font; needs a fallback or separate emoji canvas layer |
| Fix lag | Networking / interpolation | Profile tick timing and socket round-trip; the lerp pattern is already proven. May be a Railway hosting latency issue |

---

## Tech Debt / Code Issues

### Map visual identity
All 3 maps use `backgroundColor: 0x1a1a2e` — identical dark navy. PLAN.md says each map should have its own palette and vibe. `large.ts` and `xl.ts` should get distinct colors and eventually different wall layouts, not just scaled-up versions of classic.

### `main.ts` is doing too much
Scene logic, socket event handling, DOM manipulation, settings, and lobby are all in one ~438-line file. PLAN.md intended `/client/src/ui/` for HUD and screen components. This doesn't need a full refactor now, but as new screens (Stage 9 transitions, Stage 11 mode select) are added, consider extracting each screen into its own file to avoid the file growing unmanageably.

### Wrecking ball diverged from PLAN.md design
PLAN.md describes a proper Matter.js `Constraint` swing mechanic (a rope that pulls the player). The implementation instead fires a projectile that retracts with a force. This is simpler and already working, but means the "grapple when chain goes taut against a wall" behavior from the plan doesn't exist. Worth noting if the plan's mechanic is still desired.

### `PLAYER_FRICTION_AIR = 0.05` discrepancy
Documented twice as different values (see Bug #5). Either update `CLAUDE.md` to reflect the actual tuned value, or tune the constant to match the intended behavior.

### Canvas scaling / responsiveness
The game canvas is fixed at map dimensions (e.g. 1200×600 for classic). On small screens the canvas may overflow or be clipped. No CSS scaling or responsive behavior exists. Consider a CSS `transform: scale()` approach to fit the canvas to the viewport while keeping internal coordinates fixed.

### Pickup count and symmetry
Classic map has 2 asymmetric pickups at `(180, 150)` and `(1020, 450)`. The asymmetry creates unbalanced play — player 1 has their pickup in the top corner, player 2 has theirs in the bottom corner. Consider symmetric placement: `(180, 150)` + `(1020, 150)` + `(180, 450)` + `(1020, 450)` for 4 symmetric pickups, or mirror the current 2.
