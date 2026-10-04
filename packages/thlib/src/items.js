import { Entity } from './world.js';
import { Effects } from './effects.js';

export const ItemTypes = Object.freeze({ POWER: 'power', POINT: 'point', LIFE: 'life', BOMB: 'bomb',
  LIFE_PIECE: 'lifePiece', BOMB_PIECE: 'bombPiece', FULL_POWER: 'fullPower', CANCEL: 'cancel' });
const COLORS = { power: 0xff6d84ff, point: 0x73c9ffff, life: 0xff96e0ff, bomb: 0x82eeabff,
  lifePiece: 0xff96e0ff, bombPiece: 0x82eeabff, fullPower: 0xffd589ff, cancel: 0xffebaeff };
const SYMBOLS = { power: 'P', point: 'S', life: 'L', bomb: 'B', lifePiece: '+', bombPiece: '+', fullPower: 'F' };

export class Item extends Entity {
  constructor(options = {}) {
    super({ group: 'item', layer: 45, radius: 8, vy: -2, ...options });
    this.type = options.type ?? 'point';
    this.value = options.value ?? (this.type === 'power' ? 0.1 : 1);
    this.attracted = options.attracted ?? this.type === 'cancel';
    this.fullValue = false;
    this.collectSpeed = options.collectSpeed ?? 10;
  }
  update(world) {
    const player = world.game?.player;
    if (player?.state === 'normal') {
      const dx = player.x - this.x, dy = player.y - this.y;
      const distance = Math.hypot(dx, dy);
      const collectLine = world.bounds.y + world.bounds.height * 0.27;
      if (player.y < collectLine) { this.attracted = true; this.fullValue = true; }
      if (distance < (player.focused ? 88 : 40)) this.attracted = true;
      if (this.attracted) {
        const step = Math.min(this.collectSpeed, distance);
        this.x += dx / (distance || 1) * step; this.y += dy / (distance || 1) * step;
        return;
      }
    }
    this.vy = Math.min(2.8, this.vy + 0.05);
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.98;
    if (this.y > world.bounds.y + world.bounds.height + 32) this.destroy('offscreen');
  }
  collect(game) {
    if (!this.alive) return;
    const player = game.player;
    switch (this.type) {
      case 'power': {
        if (player.power >= player.maxPower) game.addScore(Math.round(this.value * 10000));
        else player.power = Math.min(player.maxPower, player.power + this.value);
        break;
      }
      case 'fullPower': player.power = player.maxPower; break;
      case 'point': {
        const height = 1 - (player.y - game.world.bounds.y) / game.world.bounds.height;
        game.addScore(Math.round(game.pointValue * this.value * (this.fullValue ? 1 : Math.max(0.2, height))));
        game.stats.pointItems++; break;
      }
      case 'cancel': game.addScore(100 * this.value); break;
      case 'life': player.lives = Math.min(game.rules.maxLives, player.lives + this.value); break;
      case 'bomb': player.bombs = Math.min(game.rules.maxBombs, player.bombs + this.value); break;
      case 'lifePiece':
        player.lifePieces += this.value;
        while (player.lifePieces >= game.rules.lifePieceThreshold) {
          player.lifePieces -= game.rules.lifePieceThreshold;
          player.lives = Math.min(game.rules.maxLives, player.lives + 1);
        }
        break;
      case 'bombPiece':
        player.bombPieces += this.value;
        while (player.bombPieces >= game.rules.bombPieceThreshold) {
          player.bombPieces -= game.rules.bombPieceThreshold;
          player.bombs = Math.min(game.rules.maxBombs, player.bombs + 1);
        }
        break;
      default: game.emit('customItem', { item: this, player });
    }
    game.emit('item', { type: this.type, value: this.value });
    this.destroy('collected');
  }
  draw(draw) {
    const color = COLORS[this.type] ?? 0xffffffff;
    if (this.type === 'cancel') { draw.circle(this.x, this.y, 3, color); return; }
    draw.rect(this.x - 7, this.y - 7, 14, 14, color);
    draw.text(SYMBOLS[this.type] ?? '?', this.x - 4, this.y - 6, 12, 0x132035ff);
  }
}

export function spawnDrops(world, x, y, drops = {}) {
  const spawned = [];
  for (const type of Object.keys(drops)) {
    const count = Math.max(0, Math.floor(drops[type]));
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      spawned.push(world.spawn(new Item({ x: x + Math.cos(angle) * 10, y: y + Math.sin(angle) * 8,
        vx: Math.cos(angle) * 1.1, vy: -1.8 - (i % 3) * 0.3, type })));
    }
  }
  return spawned;
}
