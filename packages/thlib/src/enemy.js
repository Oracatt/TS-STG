import { Entity } from './world.js';
import { Effects } from './effects.js';
import { spawnDrops } from './items.js';

export class Enemy extends Entity {
  constructor(options = {}) {
    super({ group: 'enemy', layer: 30, radius: 17, ...options });
    this.hp = options.hp ?? 30;
    this.maxHp = this.hp;
    this.score = options.score ?? 1000;
    this.drops = options.drops ?? { power: 1, point: 2 };
    this.color = options.color ?? 0xc192ffff;
    this.invulnerable = options.invulnerable ?? false;
    this.contactDamage = options.contactDamage ?? true;
    this.bombResistance = options.bombResistance ?? 1;
    this.script = options.script;
    this._startedScript = false;
    this.onDefeat = options.onDefeat;
    this.offscreenMargin = options.offscreenMargin ?? 80;
  }
  update(world) {
    if (this.script && !this._startedScript) {
      this._startedScript = true;
      this.tasks.add(this.script(this, world));
    }
    this.x += this.vx; this.y += this.vy;
    const b = world.bounds, m = this.offscreenMargin;
    if (this.x < b.x - m || this.x > b.x + b.width + m || this.y < b.y - m || this.y > b.y + b.height + m)
      this.destroy('offscreen');
  }
  damage(amount, source = 'shot') {
    if (!this.alive || this.invulnerable || !Number.isFinite(amount) || amount <= 0) return 0;
    const dealt = Math.min(this.hp, amount * (source === 'bomb' ? this.bombResistance : 1));
    this.hp -= dealt;
    if (this.hp <= 0) this.destroy('defeated');
    return dealt;
  }
  onDestroy(reason, world) {
    if (reason !== 'defeated') return;
    world.game?.addScore(this.score);
    if (world.game) world.game.stats.enemiesDefeated++;
    spawnDrops(world, this.x, this.y, this.drops);
    Effects.burst(world, this.x, this.y, this.color);
    this.onDefeat?.(this, world);
    world.game?.emit('enemyDefeated', { enemy: this });
  }
  draw(draw) {
    const r = this.radius;
    draw.triangle(this.x - r * 1.5, this.y + r * 0.6, this.x, this.y - r, this.x + r * 1.5, this.y + r * 0.6, this.color);
    draw.circle(this.x, this.y, r * 0.48, 0xfff0ddff);
    draw.ring(this.x, this.y, r * 0.6, r * 0.7, 0xffffffff);
  }
}
