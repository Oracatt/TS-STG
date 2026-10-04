import { SpriteAtlas } from './sprite-atlas.js';

const opacity = (color, alpha) => ((color & 0xffffff00) | Math.round((color & 255) * Math.max(0, Math.min(1, alpha)))) >>> 0;
const viewOf = ({ scale = 1, offsetX = 0, offsetY = 0, alpha = 1, ...rest } = {}) => {
  if (![scale, offsetX, offsetY, alpha].every(Number.isFinite) || scale < 0)
    throw new RangeError('Player view must have finite coordinates and nonnegative scale');
  return { ...rest, scale, offsetX, offsetY, alpha };
};
const point = (view, x, y) => [view.offsetX + x * view.scale, view.offsetY + y * view.scale];
const visible = player => player.alive && player.state !== 'respawning' && player.state !== 'gameover';
const playerAlpha = (player, view) => view.alpha *
  (player.invulnerableFrames > 0 && Math.floor(player.age / 4) % 2 ? 0.35 : 1);

/** Primitive adapter for existing public Item/Effect drawing in canonical Y-down coordinates. */
function primitiveView(draw, view) {
  const xy = (x, y) => point(view, x, y), s = view.scale, color = c => opacity(c, view.alpha);
  return {
    circle(x, y, r, c) { draw.circle(...xy(x, y), r * s, color(c)); },
    ring(x, y, inner, outer, c) { draw.ring(...xy(x, y), inner * s, outer * s, color(c)); },
    line(ax, ay, bx, by, width, c) { draw.line(...xy(ax, ay), ...xy(bx, by), width * s, color(c)); },
    rect(x, y, w, h, c) { draw.rect(...xy(x, y), w * s, h * s, color(c)); },
    text(text, x, y, size, c, font) { draw.text(text, ...xy(x, y), size * s, color(c), font); },
    triangle(ax, ay, bx, by, cx, cy, c) { draw.triangle(...xy(ax, ay), ...xy(bx, by), ...xy(cx, cy), color(c)); },
    point(x, y, c) { draw.point(...xy(x, y), color(c)); },
    sprite(id, x, y, w, h, rotation, c) { draw.sprite(id, ...xy(x, y), w * s, h * s, rotation, color(c)); },
    spriteRegion(id, sx, sy, sw, sh, x, y, w, h, rotation, c) {
      draw.spriteRegion(id, sx, sy, sw, sh, ...xy(x, y), w * s, h * s, rotation, color(c));
    },
  };
}

/** Shared visual skin for public player entities. Atlas ownership remains with the caller.
 * Every coordinate is canonical Y-down; body artwork is supplied by the application. */
export class PlayerPresentation {
  constructor(atlas) {
    if (!(atlas instanceof SpriteAtlas)) throw new TypeError('PlayerPresentation requires a SpriteAtlas');
    this.atlas = atlas;
    this.sprites = new Map(); this.usedSprites = new Set();
  }
  sprite(draw, name, x, y, width, height, rotation, color, view) {
    this.atlas.assertLive();
    if (!this.sprites.has(name)) this.sprites.set(name, this.atlas.getSprite(name));
    const sprite = this.sprites.get(name);
    this.usedSprites.add(name);
    draw.spriteRegion(this.atlas.texture(sprite.texture), sprite.x, sprite.y, sprite.width, sprite.height,
      ...point(view, x, y), width * view.scale, height * view.scale, rotation, opacity(color, view.alpha));
  }
  snapshot() { return { usedSprites: [...this.usedSprites].sort() }; }
  drawShots(draw, world, options) {
    const view = viewOf(options);
    for (const shot of world.entities) {
      if (!shot.alive || shot.group !== 'playerShot') continue;
      const name = shot.sprite ?? (shot.length ? 'laser.straight.light-cyan' :
        shot.homing ? 'bullet.amulet.red' : 'bullet.star.yellow');
      if (shot.length) {
        this.sprite(draw, name, shot.x + Math.cos(shot.angle) * shot.length / 2,
          shot.y + Math.sin(shot.angle) * shot.length / 2, shot.length, shot.radius * 2,
          shot.angle, shot.color, view);
      } else {
        const size = Math.max(8, shot.radius * 4);
        this.sprite(draw, name, shot.x, shot.y, size, size, shot.angle + Math.PI / 2, shot.color, view);
      }
    }
    return draw;
  }
  /** Draw option satellites and body only. Call drawFocus after enemy bullets. */
  drawPlayer(draw, player, options) {
    const view = viewOf(options);
    if (!visible(player)) return draw;
    const alpha = playerAlpha(player, view), skin = { ...view, alpha };
    const reimu = player.character !== 'marisa';
    for (const option of player.options) this.sprite(draw, reimu ? 'bullet.amulet.red' : 'bullet.star.yellow',
      option.x, option.y, 16, 16, player.age * (reimu ? 0.03 : -0.04), 0xffffffff, skin);
    const [x, y] = point(view, player.x, player.y);
    if (view.body) view.body(draw, player, { x, y, scale: view.scale, alpha });
    else {
      const adapter = primitiveView(draw, skin);
      adapter.triangle(player.x, player.y - 17, player.x - 13, player.y + 12, player.x + 13, player.y + 12, 0xeefaffff);
      adapter.triangle(player.x, player.y - 9, player.x - 7, player.y + 8, player.x + 7, player.y + 8, reimu ? 0xec668dff : 0x7863e8ff);
    }
    return draw;
  }
  drawFocus(draw, player, options) {
    const view = viewOf(options);
    if (!visible(player) || (!player.focused && player.state !== 'dying')) return draw;
    this.sprite(draw, player.character === 'marisa' ? 'effect.focus.green' : 'effect.focus.red',
      player.x, player.y, 32, 32, player.age * 0.03, 0xffffffff, view);
    const adapter = primitiveView(draw, view);
    adapter.circle(player.x, player.y, player.radius + 1, 0xffffffff);
    adapter.circle(player.x, player.y, player.radius, player.character === 'marisa' ? 0x386d52ff : 0xd6304eff);
    return draw;
  }
  drawBombs(draw, world, options) {
    const view = viewOf(options);
    draw.blend('add');
    try {
      for (const bomb of world.entities) {
      if (!bomb.alive || bomb.group !== 'bomb') continue;
      const skin = { ...view, alpha: view.alpha * Math.min(1, Math.max(0, (bomb.duration - bomb.age) / 20)) };
      if (bomb.shape === 'beam') {
        const width = bomb.currentWidth, x = bomb.x + Math.cos(bomb.angle) * bomb.length / 2,
          y = bomb.y + Math.sin(bomb.angle) * bomb.length / 2;
        this.sprite(draw, 'bomb.beam-shell', x, y, width * 1.5, bomb.length, bomb.angle + Math.PI / 2, bomb.color, skin);
        this.sprite(draw, 'bomb.beam', x, y, bomb.length, width, bomb.angle, bomb.color, skin);
        this.sprite(draw, 'bomb.radiant-orb', bomb.x, bomb.y, width * 1.7, width * 1.7, bomb.age * 0.04, bomb.color, skin);
      } else {
        // The cancellation radius is an influence area, not a single enlarged texture.
        // Keep the source orb detailed and show the expanding area as a thin light ring.
        const adapter = primitiveView(draw, { ...skin, alpha: skin.alpha * 0.25 });
        adapter.ring(bomb.x, bomb.y, Math.max(0, bomb.radius - 3), bomb.radius, 0xffa8d8ff);
        const centreSize = Math.min(96, 48 + bomb.radius * 0.1);
        this.sprite(draw, 'bomb.orb', bomb.x, bomb.y, centreSize, centreSize, bomb.age * 0.025, bomb.color, skin);
        for (let i = 0; i < 6; i++) {
          const angle = bomb.age * 0.055 + i * Math.PI / 3, radius = Math.min(140, bomb.radius * 0.6);
          this.sprite(draw, 'bomb.orb', bomb.x + Math.cos(angle) * radius, bomb.y + Math.sin(angle) * radius,
            48, 48, -angle, 0xffffffff, skin);
        }
      }
      }
    } finally { draw.blendEnd(); }
    return draw;
  }
  drawEffects(draw, world, options) {
    const view = viewOf(options), adapter = primitiveView(draw, view);
    for (const effect of world.entities) {
      if (!effect.alive || effect.group !== 'effect') continue;
      if (effect.style === 'text') effect.draw(adapter);
      else {
        const t = Math.min(1, effect.age / effect.duration), radius = Math.max(0.1, effect.size + effect.age * effect.growth);
        this.sprite(draw, effect.style === 'spark' ? 'effect.particle' : 'effect.death-ring.blue', effect.x, effect.y,
          radius * 2, radius * 2, effect.age * 0.025, opacity(effect.color, 1 - t), view);
      }
    }
    return draw;
  }
  drawItems(draw, world, options) {
    const adapter = primitiveView(draw, viewOf(options));
    for (const item of world.entities) if (item.alive && item.group === 'item') item.draw(adapter);
    return draw;
  }
  /** Convenience draw order; use the individual methods when interleaving enemy layers.
   * groups optionally selects playerShot, item, player, bomb, effect and focus. */
  drawWorld(draw, world, options = {}) {
    const groups = options.groups ?? ['playerShot', 'item', 'player', 'bomb', 'effect', 'focus'];
    const includes = name => groups.includes ? groups.includes(name) : groups.has(name);
    if (includes('playerShot')) this.drawShots(draw, world, options);
    if (includes('item')) this.drawItems(draw, world, options);
    if (includes('player')) for (const player of world.query('player')) this.drawPlayer(draw, player, options);
    if (includes('bomb')) this.drawBombs(draw, world, options);
    if (includes('effect')) this.drawEffects(draw, world, options);
    if (includes('focus')) for (const player of world.query('player')) this.drawFocus(draw, player, options);
    return draw;
  }
}
