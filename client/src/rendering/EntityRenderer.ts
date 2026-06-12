import * as PIXI from 'pixi.js';

export class EntityRenderer {
  readonly container: PIXI.Container;
  private graphic: PIXI.Graphics;
  private nameText: PIXI.Text;

  constructor(faceId: string, radius: number, color: number, ringColor: number | null = null, fullSpriteUrl?: string) {
    this.container = new PIXI.Container();

    // colored circle — always visible (fallback if no full sprite is found)
    this.graphic = new PIXI.Graphics();
    this.graphic.beginFill(color);
    this.graphic.drawCircle(0, 0, radius);
    this.graphic.endFill();
    this.container.addChild(this.graphic);

    // optional full sprite (e.g. the drawn ball) — replaces the colored circle once loaded
    if (fullSpriteUrl) {
      PIXI.Assets.load(fullSpriteUrl)
        .then((texture: PIXI.Texture) => {
          const sprite = new PIXI.Sprite(texture);
          sprite.width = radius * 2;
          sprite.height = radius * 2;
          sprite.anchor.set(0.5);
          this.graphic.visible = false;
          this.container.addChildAt(sprite, this.container.getChildIndex(this.graphic));
        })
        .catch(() => { /* no sprite file, colored circle stays as-is */ });
    }

    // ring around the player — white for local, team color for enemy
    if (ringColor !== null) {
      const ring = new PIXI.Graphics();
      ring.lineStyle(3, ringColor, 1);
      ring.drawCircle(0, 0, radius + 3);
      this.container.addChild(ring);
    }

    // name label floating above
    this.nameText = new PIXI.Text('', {
      fill: '#ffffff',
      fontSize: 11,
      fontFamily: 'monospace',
      fontWeight: 'bold',
    });
    this.nameText.anchor.set(0.5, 1);
    this.nameText.position.set(0, -(radius + 8));
    this.container.addChild(this.nameText);

    // load face overlay — transparent PNG on top of the colored circle
    if (faceId) {
      PIXI.Assets.load(`/assets/sprites/faces/${faceId}.png`)
        .then((texture: PIXI.Texture) => {
          const sprite = new PIXI.Sprite(texture);
          sprite.width = radius * 2;
          sprite.height = radius * 2;
          sprite.anchor.set(0.5);
          // insert after the circle (index 1) so the ring and name stay on top
          this.container.addChildAt(sprite, 1);
        })
        .catch(() => { /* no face file, circle stays as-is */ });
    }
  }

  setPosition(x: number, y: number) {
    this.container.position.set(x, y);
  }

  setName(name: string) {
    this.nameText.text = name;
  }
}
