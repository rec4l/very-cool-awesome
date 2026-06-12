# Hat Cosmetics — Implementation Plan

Player sprites don't rotate, so hats are always upright with zero extra math.

## Asset pipeline
- Drop PNGs into `client/public/assets/sprites/hats/`
- Naming: `tophat.png`, `crown.png`, etc. — whatever you draw
- Recommended canvas size: 32×24 (wider than tall, sits on top of the 32×32 ball)
- Anchor point: bottom-center of the PNG aligns to the top of the ball

## Files to touch

### `shared/types/index.ts`
Add `hatId: string` to `PlayerStyle`.

### `client/src/ui/settings.ts`
- Add `HATS` array (same pattern as `FACES`)
- Add `selectedHat` / `getSelectedHat()` — same pattern as face
- `savePrefs` / `loadPrefs` — add `vca_hat` localStorage key
- `buildDOM` — add hat picker section (copy face picker block, point at `/assets/sprites/hats/`)

### `client/index.html`
- Add `<div class="hat-picker" id="hat-picker"></div>` in the settings panel
- Add `.hat-picker` / `.hat-opt` CSS (copy `.face-picker` / `.face-opt` rules)

### `client/src/rendering/EntityRenderer.ts`
- Add a `hatSprite: PIXI.Sprite` to the container
- Position: `x = 0, y = -(PLAYER_RADIUS + hatSprite.height / 2)` — sits flush on top
- Load `hatId` PNG on construction, same `PIXI.Assets.load` pattern as face sprite
- Add `setHat(hatId: string)` method for runtime swap (called from `receiveNames`)

### `server/src/index.ts` / `rooms.ts`
- Include `hatId` in the `names` event payload alongside `faceId`
- Pass it through from the `create_room` / `join_room` socket events

### `client/src/main.ts`
- Add `getSelectedHat()` to the `create_room` / `join_room` emits
- `receiveNames` already calls through to `EntityRenderer` — just extend it

## No-hat fallback
If `hatId` is `'none'` (or the PNG 404s), the hat sprite stays hidden. First entry in `HATS` should be `'none'` so it's the default.
