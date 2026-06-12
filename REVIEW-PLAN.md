Review by James:
- Consider trying local 2 players against each other with wasd and arrow keys. And also against AI? Have more players?

Local would be impractical due to the complexity of the inputs. Rejected.
AI was scrapped due to lack of time.
More players was implemented, a 2v2 mode is available. (and 1v2)

- Add client-side prediction with server reconciliation for the local player might fix the drifty input feel. Only need to predict the local player's circle, not the ball or opponent.

Not necessarily implemented, but the underlying problem was solved.

Review by Xiao:

- Handling refreshes gracefully.

Found to be quite difficult with some efforts. Currently this only works if the player briefly loses connection but DOESN'T actually refresh the page. 

- Implement multi room support.

Done, the server allows for multiple rooms at once cleanly.

Meta-review:

- Wire the boost mechanic (`boosting` is hardcoded `false` in
`server/gameLoop.js`)

Fixed, boost runs smoothly.

- Fix the boost stuck-direction bug

Fixed, does not stuck direction anymore.

- Normalize diagonal movement so it isn't ~41% faster than cardinal

Fixed as desired.

- Add a jitter buffer for interpolation

Fixed, game runs smoothly.

- Multi-room support (global `session` limits the server to one match)

Fixed, game can handle up to 26^4 rooms (theoretically) but can at least run 2 smoothly from testing.

- Handle tab-refresh / reconnection

Found to be quite difficult with some efforts. Currently this only works if the player briefly loses connection but DOESN'T actually refresh the page. 
