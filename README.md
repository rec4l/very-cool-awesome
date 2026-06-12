# very cool awesome 🚀⚽

**Live:** https://zero4-student-choice-very-cool-awesome.onrender.com/

## Project description

A browser-based 2-player (and 2v2) competitive physics soccer game, Rocket League-inspired. Players join a room with a 4-letter code, pick a name/color/face, and knock a ball into each other's goal — first to 5 wins. On top of the core soccer loop, players can pop a speed boost, teleport short distances, and fire a wrecking ball to smack the ball (or each other) around the arena. Everything runs on an authoritative Node server with PixiJS rendering the live game state on the client.

## Setup

1. **Install dependencies** (from the repo root — this is a single npm workspace covering `client/`, `server/`, and `shared/`):
   ```bash
   npm install
   ```

2. **Configure environment variables.** Copy the example file and adjust if needed:
   ```bash
   cp .env.example client/.env.development
   ```
   This project doesn't call any external/third-party APIs, so there are no API keys to configure. The only environment variable is the client's pointer to the game server:

   `.env.example`
   ```bash
   # URL of the Socket.IO game server.
   # In dev, the client (Vite, port 3000) and server (port 3001) run separately,
   # so the client needs to be told where the server lives.
   VITE_SERVER_URL=http://localhost:3001
   ```

   In production (Render), this var is left **unset** — the built client is served by the same Express server it connects to, so Socket.IO just connects to the current origin.

## How to run

### Run the game (pipeline)
Starts both the Vite dev client (port 3000) and the Socket.IO/Matter.js game server (port 3001) together:
```bash
npm run dev
```

Or run them separately:
```bash
npm run dev:client   # Vite client only — http://localhost:3000
npm run dev:server   # Express + Socket.io server only — http://localhost:3001
```

To build and run a production bundle (same as the Render deploy):
```bash
npm run build
npm start
```

### Run the eval harness (tests)
Server-side game logic (physics, spawn assignment, room/lobby management, etc.) is covered by Vitest. Run it from the repo root:
```bash
npm test          # single run
npm run test:watch  # watch mode
```

## Demo video

🎥 [3–5 min walkthrough — pipeline running, eval results, code/prompt walkthrough](https://youtu.be/3v8slE4iB2E) (YouTube, unlisted)
