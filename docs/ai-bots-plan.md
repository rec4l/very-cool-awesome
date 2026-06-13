# AI Bots — Discussion Handoff

Captures a planning conversation about adding AI-controlled players. Nothing
implemented yet — this is context for picking the thread back up.

---

## Decisions made so far

- **Placement**: bots fill empty slots in the lobby (not a separate "vs AI"
  menu flow). An "ADD BOT" button per empty slot in 1v1/2v2 lobbies.
- **Power-ups**: bots should use boost/teleport/wrecking ball, scaled by
  difficulty — not movement-only.
- **Difficulty UI**: still undecided. Leaning toward a slider per bot slot
  labeled with both a tier name and an Elo-style number underneath
  (`PUSHOVER · 600` ... `TRYHARD · 2400`), to keep the game's punchy tone
  while still feeling like "customizable Elo."

---

## Architecture sketch (rule-based — recommended starting point)

- Bots are `GuestPlayer` entries with no socket: add `isBot?: boolean`,
  `elo?: number` to `GuestPlayer`. Synthetic id like `bot-${slot}`.
  `room.players` already drives `canStart`, `buildGameState`, spawn
  assignment — most of that should work unchanged.
- New `server/src/bot.ts`: `computeBotInput(room, slot): PlayerInput`, called
  once per tick for bot slots, before the existing input-processing loop in
  `game.ts`. Per-bot persistent state (reaction-delay buffer, current target)
  lives in a new `room.botState: BotState[]`, same indexing convention as
  `powerUps`/`inputs`.
- **Target → input conversion** (same for any AI approach): compute
  `dx/dy` from body position to target point, set `up/down/left/right`
  booleans from sign of dx/dy with a small deadzone to avoid jitter.
- **Decision logic**: small state machine (`CHASE_BALL`, `DEFEND_GOAL`,
  `RETURN_TO_POSITION`) computing a target point each tick, plus predictive
  ball-targeting (extrapolate ball position a few ticks ahead using current
  velocity + `BALL_FRICTION_AIR` — cheap arithmetic, no re-simulation).
- **Elo → knobs**: reaction delay (ticks before target updates), aim noise
  (random offset on target), prediction lookahead, state-transition
  aggressiveness, power-up usage thresholds/probabilities.

### Edge cases noted
- Bot-only team after a human leaves: `hasBothTeams` would stay true and the
  match wouldn't auto-end — needs an explicit rule (forfeit, or remove bot
  when its last human teammate leaves).
- Bot slots should count as "ready" automatically (no `READY` button shown).
- Disconnect/reconnect grace-period logic should skip bot slots.

---

## RL exploration (stretch goal, discussed but not started)

User wants to explore a trained RL policy instead of (or in addition to)
rule-based bots. See [docs/ai-bots-rl-plan.md](ai-bots-rl-plan.md) for the
in-depth design (observation/action spaces, network architecture, ES training
algorithm, reward shaping, Elo tournament, runtime integration, and staged
milestones). Key points from discussion:

- **Training env must reuse the real `physics.ts`/Matter.js sim headlessly**
  (no Socket.io/rendering) — avoids sim-to-real gap between training and the
  live game.
- **Observation space**: own pos/vel, ball pos/vel, opponent pos/vel, goal
  positions, own power-up state — normalized, ~12-16 numbers.
- **Action space**: discretize `PlayerInput` — ~8-9 movement directions ×
  boost/teleport/wrecking-ball toggles, to keep the policy output small.
- **Reward shaping** is the hard part — sparse goal reward (±1) is realistic
  but slow; some shaping (ball-toward-goal, touching ball) helps but risks
  the bot learning weird exploits if overdone. Expect iteration.
- **Tooling**: stay dependency-free — hand-rolled small MLP policy + simple
  algorithm (evolution strategy / self-play via many headless parallel
  matches in Node). Avoids tfjs-node's native-build pain; runtime inference
  is just a few matrix multiplies.
- **Elo ladder — the elegant tie-in**: self-play produces a skill
  progression naturally. Run a round-robin tournament between checkpoints
  (and the rule-based bots as anchors) to compute *real* Elo per checkpoint.
  Ship ~5-8 checkpoints spanning the range; the difficulty slider picks the
  nearest one. Checkpoints are small JSON/binary weight files in the repo.

### Recommended staging
Ship rule-based bots first — needed regardless as a fallback, and they
double as tournament anchors for Elo calibration if RL bots are added later.
RL becomes a stretch layer on top, not a replacement.

---

## Open questions for next session
- Difficulty UI: slider vs. preset buttons vs. both — not yet decided.
- Scope/timeline for the RL stretch goal — project is no longer bound by a
  class deadline (see [docs/CLAUDE.md](CLAUDE.md)), so RL is more viable as
  a real (if longer-term) goal rather than a pure stretch item.
