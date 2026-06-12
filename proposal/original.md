# Title

2D Rocket League (tbd)

# One sentence description

A browser-based 2-player competitive physics soccer game inspired by Rocket League, focused on low-latency multiplayer synchronization using an authoritative WebSocket server.

(Propose your own)

# Past project

None

# Planned technologies

- Frontend - TypeScript, Phaser.js, HTML5 Canvas
- Backend - Node.js, Express, WebSockets
- Deployment - Vercel/Railway

# First Deliverable

The first deliverable will be a playable prototype where two users can connect to the same game session and interact with a shared physics-based ball in real time.

This version will include:

- basic player movement
- WebSocket multiplayer connectivity
- synchronized player and ball positions
- simple collision physics
- a single playable arena

If this is pushing it a little bit, I want to have a playable arena with just two people on one device rather than 2 separate devices. I leave this option open because I've never tried to handle live multiplayer.

# Rough Architecture

1. Game Client - Responsible for rendering the arena, players, and ball in the browser.
2. Input Manager - Captures keyboard inputs and converts them into movement commands.
3. WebSocket Networking Layer - Maintains persistent real-time communication between client and server.
4. Authoritative Game Server - Has the true game state, and validates movements & collisions.
5. Physics Simulation System - Handles physics interactions.
6. Match Session Manager - Manages multiplayer game rooms.

# After first deliverable

- General polishing, better network handling, and push it towards a more competitive friendly environment.