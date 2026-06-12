# Title

2D Rocket League

# One sentence description

A browser-based 2-player competitive physics soccer game inspired by Rocket League, focused on low-latency multiplayer synchronization using an authoritative WebSocket server.

---

# Planned technologies

## Frontend - TypeScript, Phaser.js, HTML5 Canvas
> **Modified.** TypeScript and Phaser.js were dropped in favour of vanilla JavaScript and plain HTML5 Canvas. Phaser's built-in physics runs client-side, which conflicts with the authoritative server model — mirroring the same simulation on both ends would have been awkward. Vanilla Canvas gives full control with no framework overhead. HTML5 Canvas is in use as planned: `client/renderer.js`.

## Backend - Node.js, Express, WebSockets
> **Implemented as written.** Node.js (`server/index.js`) serves the client files via Express and handles all game logic. WebSocket communication is handled through Socket.io (a WebSocket abstraction) in `server/index.js` and `client/network.js`. Socket.io was chosen over raw WebSockets for its built-in room support and event API.

## Deployment - Vercel/Railway
> **Implemented with slight changes. ** The server runs on https://zero4-student-choice-very-cool-awesome.onrender.com/

---

# First Deliverable

## Basic player movement
> **Implemented.** Keyboard input is captured in `client/input.js` (WASD and arrow keys). Inputs are sent to the server each tick and applied as physics forces in `server/physics.js` via `Body.applyForce`.

## WebSocket multiplayer connectivity
> **Implemented.** Two clients connect to the same session via Socket.io. The server assigns each a player number on connect (`server/index.js`). Connection, disconnection, and a full game session are handled.

## Synchronized player and ball positions
> **Implemented.** The server broadcasts authoritative game state 30 times per second from `server/gameLoop.js`. Clients receive state in `client/game.js` and interpolate between the two most recent snapshots for smooth 60fps rendering.

## Simple collision physics
> **Implemented.** Matter.js runs server-side in `server/physics.js`. Player-ball, ball-wall, and player-wall collisions are all resolved by the physics engine. To improve stability, the physics is stepped at 4× the tick rate (substeps) to reduce collision oscillation.

## A single playable arena
> **Implemented.** The classic arena is defined in `shared/maps/classic.js` with configurable wall layout, goal positions, and player start positions. A map registry in `shared/maps/index.js` makes it straightforward to add new arenas.

## Fallback: two players on one device
> **Out of scope.** Full two-device (two browser tabs) multiplayer was achieved without issues. Having 2 players locally would be impractical due to the complexity of inputs and movements.

---

# Rough Architecture

## 1. Game Client
> **Implemented as written.** Renders the arena, players, and ball on an HTML5 Canvas at 60fps. Split across `client/index.html`, `client/game.js`, and `client/renderer.js`.

## 2. Input Manager
> **Implemented as written.** `client/input.js` listens for `keydown` and `keyup` events and exposes a `getInput()` function that returns the current movement state each tick. Also clears keys on window blur to prevent stuck inputs.

## 3. WebSocket Networking Layer
> **Implemented as written.** `client/network.js` connects to the server via Socket.io and handles all incoming events (`assigned`, `state`, `goal`, `countdown`). The client sends input to the server every tick via `socket.emit('input', ...)`.

## 4. Authoritative Game Server
> **Implemented as written.** `server/index.js` and `server/gameLoop.js` together own the true game state. The server applies client inputs, steps physics, checks for goals, and broadcasts state. Clients cannot modify positions directly.

## 5. Physics Simulation System
> **Implemented as written.** `server/physics.js` wraps Matter.js. Creates the world from the active map's wall definitions, manages player and ball bodies, applies input forces, and steps the simulation. Runs with 4 substeps per tick for collision stability.

## 6. Match Session Manager
> **Implemented as written.** The session object in `server/index.js` tracks connected players, their inputs, scores, and boost meters. Manages the game lifecycle: waiting for players → countdown → in-game → goal pause → countdown → in-game → win.

---

# After first deliverable

## General polishing
> **Partially implemented.** Added: goal detection and scoring, 3-2-1-GO! countdown before kickoff and after goals, win condition (first to 5 goals), goal visual indicators on the arena, score display on canvas.

## Better network handling
> **Handled**. Game feels quite smooth!

## Push towards a more competitive friendly environment
> **Mostly complete.** Boost mechanic has been built but is currently disabled pending physics tuning. Additional maps (with custom wall layouts) are supported by the map system and planned. Player labels, match history, and rematch flow are not yet implemented.