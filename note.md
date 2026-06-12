low importance - refactor files to be of less than 500 lines?
medium importance - better main menu bg
high importance - all buttons drawn
medium importance - when 2v2 wins, it should say x and y win! not x win
low/medium importance - win page need touchup
medium importance - randomize spawnpoints from the 2 spawnpoints given as a team
medium importance - in 1v1 score should be blue vs red not player color vs player color
medium importance - randomize spawnpoints between 2 players in a 1v1 but keep them symmetrical
medium importance - increase # of spawn points? probably a 2x3 grid minus the speed boost orb but i leave the design up to claude mostly
high importance - normalize movement along diagonal so you dont get 41% speed boost
high importance - need to handle reconnecting to a game

Stage 14 — UI/text correctness (medium importance, low effort)
#4 — 2v2 winner banner should name both players: main.ts's goal handler currently sets "team a wins!" / "team b wins!" regardless of mode. playerNames and slotTeam are already populated from lobby_update/names, so this is just building "Alice and Bob win!" (2v2) vs "Alice wins!" (1v1) from those maps.
#7 — 1v1 score should be team colors (blue/red), not player colors: the in-game HUD (hud.ts) already uses TEAM_SCORE_COLORS (blue A / pink-red B) — looks done there. I'd need to check the postgame/lobby score displays for any leftover player-color usage; likely a quick confirm-and-fix.
Stage 15 — buttons (high importance per note, mostly an art task)
#3 — all buttons drawn: the buttonArt.ts auto-swap pipeline exists, but STATIC_BUTTON_IDS is missing several live buttons (btn-leave-room, btn-copy-link, btn-swap-team, and the mode/create buttons don't have matching PNGs yet). The code fix is trivial — add the missing IDs to the array so art auto-swaps in once dropped. The actual pixel art is the developer's Aseprite work, per the existing pipeline convention (no code changes needed once files land). I also noticed several unused PNGs (btn-back-create.png, btn-create.png, btn-go-join.png, btn-settings-back.png, etc.) that don't match any current button ID — likely leftovers from an earlier menu layout; worth a quick check on whether to delete or repurpose.
Stage 16 — expanded spawn grid (medium importance, design-heavy)
#9 — increase spawn points (2x3 grid minus boost orb): needs new spawn coordinates designed for classicMap (and the larger maps) that clear the walls/goal boxes/pickup positions, plus extending the shuffled-based remap in game.ts to pick from >2 spawns per team. This is the most "design it yourself" item — I'd sketch coordinates and confirm with you before wiring it in, since it affects map feel.
Stage 17 — polish, needs direction first (low/medium importance)
#2 — better main menu bg and #5 — win page touchup: both are subjective/ambiguous as written. Per "ask when ambiguous rather than guess" — I'd want a quick back-and-forth on what's currently bothering you about each (main menu bg is currently just bouncing translucent circles; postgame is the #winner-display text + rematch/leave buttons) before touching them.
Stage 18 — file size cleanup (low importance, mostly moot right now)
#1 — files under 500 lines: checked current sizes — only client/src/scenes/Game.ts (481 lines) is even close, and nothing's actually over 500 yet. I'd defer this until a file actually crosses the line rather than do a speculative split now.
Flagging a conflict — #11 (reconnect)
Your memory file notes Stage 6 (reconnect + bots) was explicitly shelved earlier as "too complex relative to value for the current scope." note.md now lists reconnect as high importance. Before I plan this in, I want to confirm: has that priority genuinely changed? If so, I'd scope it down from the original "reconnect + bots" idea to something much lighter — e.g., a grace-period pause (freeze the match for N seconds if a player's socket drops, resume if they rejoin with the same room code, otherwise end the match as it does now) — rather than the full token/session-reconnect system from the old plan.





    A narrated summary of the changes from your initial submission to your final submission

    - cosmetics
    - control section
    - lobby creation and 2v2 handling
    - mechanics in game, boosting, teleport
    - sound effects
    - scoring system
    
    A demo of one feature you added since the initial submission

    new mechanics like teleporting and boosting and wrecking ball

    A demo of one feature or fix that came out of review day
    
    there was some nasty bug with physics that 

    A demo of another workflow that you think is the coolest thing your app can do



teleport when game reset
i think when the game ends and you go into a new game then it bugs new game join
wrecking ball still can go out of bounds
wrecking ball should go a little further extend the hit force?
draw ball asset
make goal smaller initially
3v3?