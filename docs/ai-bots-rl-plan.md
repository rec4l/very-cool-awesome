# RL Policy Bots — In-Depth Design

A deeper dive on the "RL exploration" thread from [docs/ai-bots-plan.md](ai-bots-plan.md).
This is a design reference, not an implementation order — nothing here is built
yet. Numbers/decisions below are picked deliberately (not left open) per the
project's "be decisive, revisit if wrong" approach.

---

## 1. Headless training environment — `server/src/ml/env.ts`

Wraps the existing physics primitives (`createPhysics`, `applyInputs`,
`stepWorld`, `checkGoal`, `resetPositions`, `initRoundGoalBounds` from
`server/src/physics.ts`) **directly** — not through `Room`/`RoomManager`/
sockets. Those carry lobby-shaped state (`reconnectTimers`, `loop`, etc.)
that's dead weight for training, and `RoomManager.startLoop` uses
`setInterval`, which is wrong when training wants to step as fast as the CPU
allows, synchronously.

```ts
export type SoccerEnv = {
  physics: ReturnType<typeof createPhysics>;
  goalBounds: GoalBounds;
  score: { A: number; B: number };
  ticks: number;
};

export function createEnv(map: MapDefinition = classicMap): SoccerEnv { ... }
export function reset(env: SoccerEnv): Observation[]; // length 2 for 1v1
export function step(env: SoccerEnv, actions: PlayerInput[]): {
  observations: Observation[];
  rewards: number[];
  done: boolean;
  scoringTeam: Team | null;
};
```

**v1 scope decisions:**
- **In scope**: movement (`applyInputs`), physics stepping, goal detection,
  episode reset on goal.
- **Deferred to v2**: boost, teleport, wrecking ball, pickups. Each adds a
  discrete action/observation dimension and a large amount of reward-shaping
  surface area. A policy that masters pure positioning/ball-striking is a
  coherent, shippable v1 — harder skills compose on top later without
  architecture changes (bigger action/obs vectors), once the basic policy is
  known to converge.
- `room.inputs[slot].boosting/teleportTarget/pickaxeActive` stay at
  `defaultInput()` defaults for both agents — physics behaves identically to
  a real match minus those mechanics.
- **Episode = one round** (kickoff → goal), not a full 5-goal match — ~5x
  more episodes per wall-clock second. `done=true` on `checkGoal` returning
  non-null, OR a 900-tick (30s) timeout → `done=true, scoringTeam=null,
  reward=0` (prevents stalls from inflating training time).
- `reset()` re-randomizes spawns via the same `pickSpawns`/`assignSpawns`
  logic as `game.ts`, so the policy doesn't overfit one kickoff layout.

---

## 2. Observation space — `server/src/ml/observation.ts`

**Fixed-size 16-float vector, self-relative frame.** Agent 0's observation
mirrors agent 1's by construction: swap "self"/"opponent" and flip the x-axis
sign for the agent on the right side. This means **one policy only ever
learns "play as the left-side attacker"** and runs as either slot via a
coordinate flip at inference — dramatically simplifies self-play (no need to
learn a mirrored strategy separately).

Vector layout (normalized to roughly [-1, 1]):

| # | Field | Normalization |
|---|-------|---------------|
| 1 | `selfPos.x` | `(x - W/2) / (W/2)` |
| 2 | `selfPos.y` | `(y - H/2) / (H/2)` |
| 3 | `selfVel.x` | `vx / MAX_VEL` (MAX_VEL ≈ 15, clipped) |
| 4 | `selfVel.y` | `vy / MAX_VEL` |
| 5 | `oppPos.x` | same as selfPos.x |
| 6 | `oppPos.y` | same as selfPos.y |
| 7 | `oppVel.x` | same as selfVel.x |
| 8 | `oppVel.y` | same as selfVel.y |
| 9 | `ballPos.x` | `(x - W/2) / (W/2)` |
| 10 | `ballPos.y` | `(y - H/2) / (H/2)` |
| 11 | `ballVel.x` | `/ MAX_BALL_VEL` (≈ 25, clipped) |
| 12 | `ballVel.y` | same |
| 13 | `ownGoalCenter.x` | constant per side |
| 14 | `ownGoalCenter.y` | 0 (kept for symmetry / future offset-goal maps) |
| 15 | `oppGoalCenter.x` | constant per side |
| 16 | `oppGoalCenter.y` | 0 |

For the right-side agent: `x -> -x` on all position/velocity fields, swap
self/opp labels, and swap own/opp goal centers.

**2v2 extension (sketch only, not built now)**: fixed max-agents-per-team =
2. Observation becomes self (4) + ball (4) + own/opp goal (4) + teammate (4,
zero-padded + presence flag) + 2 opponents (4 each, zero-padded + presence
flags) ≈ 26 floats. Fixed-size padding means the same network architecture
works for 1v1 and 2v2 — a 2v2 policy could bootstrap from 1v1-pretrained
hidden-layer weights with a resized input layer.

---

## 3. Action space — `server/src/ml/actions.ts`

**9 discrete actions** = the 9 movement combinations
(`none/up/down/left/right` + 4 diagonals). `applyInputs` already normalizes
diagonal force, so "up-left" is just `{up:true, left:true}` — no special
casing needed.

```ts
const ACTION_TABLE: PlayerInput[] = [
  { up:false, down:false, left:false, right:false, ...REST }, // 0: idle
  { up:true,  down:false, left:false, right:false, ...REST }, // 1: up
  { up:false, down:true,  left:false, right:false, ...REST }, // 2: down
  { up:false, down:false, left:true,  right:false, ...REST }, // 3: left
  { up:false, down:false, left:false, right:true,  ...REST }, // 4: right
  { up:true,  down:false, left:true,  right:false, ...REST }, // 5: up-left
  { up:true,  down:false, left:false, right:true,  ...REST }, // 6: up-right
  { up:false, down:true,  left:true,  right:false, ...REST }, // 7: down-left
  { up:false, down:true,  left:false, right:true,  ...REST }, // 8: down-right
];
// REST = { boosting:false, teleportTarget:null, pickaxeActive:false, pickaxeAngle:0 }
```

Right-side agents mirror the chosen action's `left`/`right` flags before
lookup (matching the observation's x-flip).

**v2 note**: when boost is added, double the table to 18 (9 movements × 2
boost states) — kept as a flat enum rather than a multi-discrete head, since
that's simplest for a hand-rolled net (one softmax/argmax output).

---

## 4. Network — `server/src/ml/network.ts`, `weights.ts`

Pure feedforward MLP, hand-rolled forward pass only — Evolution Strategies
(section 5) needs no backprop.

- **Input**: 16 (the observation vector)
- **Hidden**: 1 layer, 32 units, `tanh`
- **Output**: 9 units (action logits) → `argmax` for deterministic inference

Parameter count: `16*32 + 32 + 32*9 + 9 = 841` floats. A full population of
100 candidates is ~336KB — trivial to keep in memory and serialize.

**Why 32 hidden units / 1 layer**: this is a low-dimensional control problem
(16 → 9). A small net keeps forward-pass cost negligible (~1000 multiply-adds,
sub-microsecond at 30Hz) and ES sample efficiency degrades with parameter
count, so smaller directly speeds convergence. If the policy plateaus early,
bump to 48 units or add a second 16-unit layer — but start minimal.

**Weight serialization** (`weights.ts`):

```ts
export type NetworkShape = { input: number; hidden: number; output: number };
export type WeightsFile = {
  shape: NetworkShape;
  weights: number[]; // flattened: W1, b1, W2, b2 — JSON-serializable
  meta?: { elo?: number; generation?: number; trainedAt?: string };
};
```

JSON, not binary — 841 floats ≈ 8KB, grep-able/diffable, no buffer-loading
code path needed. `weights.ts` exports `loadWeights`, `saveWeights`, and
`forward(weights, shape, obs) -> Float32Array(9)`.

---

## 5. Training algorithm — Evolution Strategies

`server/src/ml/train.ts` (training loop, run via `tsx`, not part of the
server runtime) + `server/src/ml/train-worker.ts` (worker_threads worker).

OpenAI-ES style: perturb the current parameter vector with Gaussian noise in
multiple directions, evaluate fitness for each, update the mean toward
better-scoring perturbations. No gradients, trivially parallelizable across
independent episode rollouts.

**Concrete hyperparameters:**
- **Population N = 50** perturbations/generation, **mirrored sampling**
  (`θ + σ·ε_i` and `θ - σ·ε_i`) → 100 evaluations/gen, halves variance for the
  same compute.
- **Noise scale σ = 0.05** (relative to ~O(1) weight magnitudes after small
  random init).
- **Learning rate α = 0.02**, standard ES update:
  `θ ← θ + (α / (N·σ)) · Σ_i fitness_i · ε_i`, with **rank-normalized**
  fitness (raw scores → ranks in [-0.5, 0.5]) — avoids one lucky episode
  dominating the update, important given noisy/sparse soccer rewards.
- **2 episodes/candidate** (900 ticks each, capped), averaged — reduces
  variance from random kickoff side/spawn without doubling compute.
- **Opponent schedule:**
  - **Gens 1-50 ("anchor phase")**: every candidate plays a fixed anchor
    opponent. A stable, non-moving-target opponent gives early random
    policies something learnable — pure self-play between two random nets is
    noise vs. noise.
  - **Gens 50+ ("self-play phase")**: each candidate plays a randomly-sampled
    checkpoint from a frozen historical pool (best checkpoint every 10 gens —
    a tiny "league," avoids overfitting to the immediate previous self /
    strategy cycling).
- **Anchor opponent — open dependency**: the natural anchor is the planned
  rule-based bot's `computeBotInput` (see [docs/ai-bots-plan.md](ai-bots-plan.md)),
  which doesn't exist yet. **Not resolved in this doc** — whoever picks up RL
  implementation can either sequence after the rule-based bot lands, or unblock
  with a throwaway scripted "move toward ball" placeholder anchor (a few
  lines) if RL work starts first.
- **Parallelization**: Node `worker_threads`, one per CPU core
  (`os.cpus().length`). Main thread dispatches `{theta, noiseSeed,
  opponentWeights, episodes}` jobs, collects `{fitness}`, computes the
  update, broadcasts new `theta`.
- **Realistic wall-clock**: one 900-tick episode (7200 Matter.js substeps of
  2 circles + ~10 static walls) ≈ 0.5-1.5s. 100 evals/gen ÷ 8 workers × 2
  episodes ≈ **~25-30s/generation**. 200-500 generations to a competent
  policy → **~1.5-4 hours** on an 8-core machine. Checkpoint every generation
  so a run is resumable.

---

## 6. Reward shaping — `server/src/ml/reward.ts`

```
reward = goalReward + ballProximityShaping + ballVelocityShaping - timePenalty
```

- **`goalReward`**: `+1` if this agent's team scores this tick, `-1` if the
  opponent scores. Dominant signal — must stay ~10-50x larger than the
  per-tick shaping sum over an episode.
- **`ballProximityShaping`**: `+0.001 * (prevDistToBall - currDistToBall) /
  MAX_VEL`, clipped to `[-0.001, 0.001]`/tick. Rewards *closing distance* (not
  absolute proximity, which would reward camping). Max accumulation over 900
  ticks ≈ ±0.9 — comparable to but smaller than ±1 goal reward, by design
  (encourages ball-chasing as a means, not an end).
- **`ballVelocityShaping`**: `+0.002 * clamp(ballVel · directionToOppGoal,
  -1, 1)`, only counted on ticks where the agent is within `PLAYER_RADIUS +
  BALL_RADIUS + 5` of the ball (right after a touch) — avoids rewarding the
  ball rolling toward goal on its own. Max accumulation ≈ ±0.1-0.2/episode.
- **`timePenalty`**: `-0.0005`, applied only on the final tick of a
  timed-out (no-goal) episode — nudges away from "both bots stand still"
  equilibria without meaningfully affecting the scale.

**Staged shaping decay**: full shaping for gens 1-100 (bootstraps "go toward
ball" / "hit ball forward" — nearly undiscoverable from sparse ±1 alone with
random-init policies). From gen 100, multiply `ballProximityShaping` and
`ballVelocityShaping` by `max(0, 1 - (gen-100)/200)`, zeroing by gen 300 — by
then ball-control should be emergent from the goal reward, and removing
shaping avoids "maximize shaping, never actually score" local optima.

**#1 risk / time-sink**: reward shaping iteration. Expect to re-run gens 1-50
multiple times with different constants/clips before behavior looks sane
(bots approach and strike the ball rather than orbiting/freezing). Build a
replay/visualization tool early — log position traces to JSON, render via the
existing PixiJS client as a "replay" state stream — so shaping bugs are
visible, not just inferred from reward numbers.

---

## 7. Checkpointing & Elo tournament

**Checkpoints**: `server/src/ml/checkpoints/gen-{N}.json` (`WeightsFile` with
`meta.generation`), saved every generation locally — mostly gitignored.

**Tournament** (`server/src/ml/tournament.ts`, run via `tsx`):
- Entrants: ~15-25 checkpoints (every ~20th generation of a 300-500 gen run)
  + rule-based bot presets at their Elo-tagged difficulty configs.
- **Round-robin**, 10 rounds/pairing, alternating sides (physics/spawn-grid
  randomness means side matters slightly even with mirrored observations).
- **Elo**: K=32, all start at 1000, sequential updates over a shuffled match
  order. ~20-30 entrants, 10 rounds, ~1s/episode → manageable, under an hour.
- **Output**: `server/src/ml/elo-table.json` —
  `Array<{ file: string; elo: number; isRuleBased?: boolean }>`, sorted by
  Elo. This is the runtime lookup table for the difficulty slider.
- **Curation**: pick ~6-8 checkpoints spanning the Elo range evenly (nearest
  to e.g. 600/900/1200/1500/1800/2100), copy to
  `server/src/ml/checkpoints/curated/` — only these ship in the repo.

---

## 8. Runtime integration

`server/src/bot.ts`'s `computeBotInput(room, slot)` dispatches on
`room.botState[slot].kind`:

```ts
export function computeBotInput(room: Room, slot: number): PlayerInput {
  const state = room.botState[slot];
  if (state.kind === 'rl') return computeRLBotInput(room, slot, state);
  return computeRuleBasedInput(room, slot, state); // from docs/ai-bots-plan.md
}
```

`server/src/ml/inference.ts`:
- `loadCheckpoint(path)` — called once when a bot's Elo maps to a checkpoint
  via `elo-table.json`; cached (module-level `Map<path, WeightsFile>` — 8KB
  each, trivial even with several cached).
- `computeRLBotInput(room, slot, state)`:
  1. Build the 16-float observation via `buildObservation(physics, mySlot,
     oppSlot, map, goalBounds, side)` — **the same function `env.ts` uses for
     training**. This shared function is the critical sim-to-real consistency
     point; any drift here silently degrades the bot.
  2. Apply side-mirroring (x-flip) if on the right side.
  3. `forward(weights, shape, obs)` → argmax → action index.
  4. Un-mirror the action, look up `ACTION_TABLE[index]` → `PlayerInput`.
- Forward pass cost (~850 multiply-adds/tick/bot) is negligible at 30Hz, even
  with multiple RL bots in a 2v2 room.
- Boost/teleport/pickaxe stay at `defaultInput()` for RL bots until v2
  training adds them.

---

## 9. File layout

```
server/src/ml/
  env.ts            — headless step()/reset(), no sockets/RoomManager
  observation.ts    — buildObservation(...) -> Float32Array(16), shared by env + inference
  actions.ts        — ACTION_TABLE: PlayerInput[9], mapAction(index, side) -> PlayerInput
  reward.ts         — computeReward(prev, curr, agentSlot) -> number, staged decay
  network.ts        — forward(weights, shape, obs) -> Float32Array(9), randomWeights(shape)
  weights.ts        — WeightsFile type, loadWeights/saveWeights (JSON)
  train.ts          — ES training loop entrypoint (tsx script), worker pool, checkpoints
  train-worker.ts   — worker_threads worker: N episodes for theta+opponent -> fitness
  tournament.ts     — round-robin + Elo entrypoint (tsx script)
  inference.ts      — loadCheckpoint (cached), computeRLBotInput for bot.ts
  elo-table.json    — generated lookup table: [{file, elo, isRuleBased}]
  checkpoints/
    curated/        — 6-8 committed checkpoints spanning Elo range
    (gitignored full training run output otherwise)
  *.test.ts         — co-located, per existing convention (game.test.ts next to game.ts)
```

---

## 10. Staged milestones

| Stage | Risk | Est. effort | Deliverable |
|-------|------|-------------|-------------|
| **M1** | Low | ~1 day | `env.ts`/`observation.ts`/`actions.ts` + a Vitest test running a full random-action episode: no NaNs, correct `done` triggering, observations stay in expected normalized ranges. Pure wiring check, no learning. |
| **M2** | Medium | ~2-3 days | `network.ts`/`weights.ts` + sequential (no workers) ES on **only** `ballProximityShaping` ("move toward ball"). Dense, easy signal — if ES doesn't converge within ~20-30 gens, the bug is in wiring (network/reward sign/mirroring), not the algorithm. This is where x-flip mirroring sign-errors are most likely to surface — budget extra debugging time here specifically. |
| **M3** | Highest | ~1-2 weeks incl. iteration | Full reward (goal + velocity shaping + decay), `train-worker.ts` + worker pool, overnight training run (200-500 gens, checkpoint every gen), `tournament.ts` + `elo-table.json`, curated checkpoints. **Blocked on the rule-based bot system for anchor opponents** (see section 5) — or unblocked via scripted placeholder. Reward-shaping iteration (section 6) is the dominant risk; also watch for anchor-strength mismatch (too-strong anchor → flat fitness gradient; too-weak/buggy anchor → candidate learns to exploit the bug rather than play well). |
| **M4** | Low-medium | ~2-3 days | `inference.ts`, wired into `bot.ts`'s `computeBotInput` dispatch; lobby difficulty slider maps to `elo-table.json` entries (depends on the difficulty-UI decision in [docs/ai-bots-plan.md](ai-bots-plan.md)). Sanity test: headless room, RL bot vs. rule-based bot via `RoomManager`, win rates roughly track the Elo gap — catches observation/mirroring drift between training and runtime. |

---

## Open dependencies for implementation
- **Rule-based bot system** (`server/src/bot.ts`, `computeBotInput`,
  `room.botState[]`) — needed for M3's anchor phase and as tournament anchors
  in M4's `elo-table.json`. See [docs/ai-bots-plan.md](ai-bots-plan.md).
- **Difficulty UI decision** (slider vs. presets) — needed for M4's
  Elo→checkpoint selection in the lobby.
