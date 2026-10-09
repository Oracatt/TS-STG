import type { CancellableEntity } from './core-types.js';
import type { Game } from './game.js';
import type { DrawList } from './render.js';
import type { World } from './world.js';
import type { BeamTarget } from './bomb-geometry.js';
import type { Bounds } from './core-types.js';
import type { WeaponOptions, PlayerShotOptions, BombOptions, PlayerOptions } from './api-types.js';
import { Entity } from './world.js';
import { Keys } from './input.js';
import { Effects } from './effects.js';
import { Item } from './items.js';
import { beamIntersectsCircle, beamIntersectsEntity } from './bomb-geometry.js';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export class PlayerShot extends Entity {

  declare angle: number;
  declare speed: number;
  declare damage: number;
  declare homing: boolean;
  declare turnRate: number;
  declare piercing: boolean;
  declare length: number;
  declare duration: number;
  declare color: number;
  declare hitTargets: Set<number>;
  declare follow?: Player;
  declare offsetX: number;
  declare sprite: string | null;

  constructor(options: PlayerShotOptions = {}) {
    super({ group: 'playerShot', layer: 20, radius: 4, ...options });
    this.angle = options.angle ?? -Math.PI / 2;
    this.speed = options.speed ?? 15;
    this.damage = options.damage ?? 3;
    this.homing = options.homing ?? false;
    this.turnRate = options.turnRate ?? 0.14;
    this.piercing = options.piercing ?? false;
    this.length = options.length ?? 0;
    this.duration = options.duration ?? 90;
    this.color = options.color ?? 0x9ceaffff;
    this.hitTargets = new Set();
    this.follow = options.follow;
    this.offsetX = options.offsetX ?? 0;
    this.sprite = options.sprite ?? null;
  }
  update(world: World): void {
    if (this.follow) {
      if (this.follow.state !== 'normal') { this.destroy('owner'); return; }
      this.x = this.follow.x + this.offsetX; this.y = this.follow.y - 20;
    } else {
      if (this.homing) {
        let closest = null, best = Infinity;
        for (const enemy of world.entities) {
          if (!enemy.alive || enemy.group !== 'enemy' || (enemy as import('./enemy.js').Enemy).invulnerable) continue;
          const d = (enemy.x - this.x) ** 2 + (enemy.y - this.y) ** 2;
          if (d < best) { best = d; closest = enemy; }
        }
        if (closest) {
          const desired = Math.atan2(closest.y - this.y, closest.x - this.x);
          const delta = Math.atan2(Math.sin(desired - this.angle), Math.cos(desired - this.angle));
          this.angle += clamp(delta, -this.turnRate, this.turnRate);
        }
      }
      this.x += Math.cos(this.angle) * this.speed; this.y += Math.sin(this.angle) * this.speed;
    }
    const b = world.bounds;
    if (this.age >= this.duration || this.x < b.x - 40 || this.x > b.x + b.width + 40 ||
      this.y < b.y - 80 || this.y > b.y + b.height + 40) this.destroy('expired');
  }
  collidesCircle(x: number, y: number, radius: number): boolean {
    if (!this.length) return Math.hypot(x - this.x, y - this.y) <= radius + this.radius;
    const dx = Math.cos(this.angle) * this.length, dy = Math.sin(this.angle) * this.length;
    const t = clamp(((x - this.x) * dx + (y - this.y) * dy) / (this.length * this.length), 0, 1);
    return Math.hypot(x - this.x - dx * t, y - this.y - dy * t) <= radius + this.radius;
  }
  draw(draw: DrawList): void {
    const length = this.length || 16;
    draw.line(this.x, this.y, this.x + Math.cos(this.angle) * length,
      this.y + Math.sin(this.angle) * length, this.radius * 2, this.color);
    draw.circle(this.x, this.y, Math.max(1, this.radius * 0.45), 0xffffffff);
  }
}

/** Configurable emitter; custom emit(player, world, weapon) can replace the built-in profiles. */
export class Weapon {

  declare type: string;
  declare interval: number;
  declare damage: number;
  declare shotSpeed: number;
  declare cooldown: number;
  declare shotSprite: string | null;
  declare optionSprite: string | null;
  declare laserSprite: string | null;
  declare emit?: WeaponOptions['emit'];

  constructor(options: WeaponOptions = {}) {
    this.type = options.type ?? 'spread';
    this.interval = options.interval ?? (this.type === 'laser' ? 6 : 5);
    this.damage = options.damage ?? (this.type === 'laser' ? 4 : 3);
    this.shotSpeed = options.shotSpeed ?? 16;
    this.cooldown = 0;
    this.emit = options.emit;
    this.shotSprite = options.shotSprite ?? null;
    this.optionSprite = options.optionSprite ?? null;
    this.laserSprite = options.laserSprite ?? null;
  }
  update(player: Player, world: World, firing: boolean): void {
    if (this.cooldown > 0) this.cooldown--;
    if (!firing || this.cooldown > 0) return;
    this.cooldown = this.interval;
    if (this.emit) { this.emit(player, world, this); return; }
    const color = this.type === 'homing' ? 0xf6b5ffff : 0x8ee7ffff;
    for (const offsetX of [-5, 5]) world.spawn(new PlayerShot({ x: player.x + offsetX, y: player.y - 12,
      damage: this.damage, speed: this.shotSpeed, color, sprite: this.shotSprite }));
    for (let i = 0; i < player.options.length; i++) {
      const option = player.options[i];
      if (this.type === 'laser') {
        world.spawn(new PlayerShot({ x: option.x, y: option.y, damage: this.damage, length: world.bounds.height,
          speed: 0, duration: 3, radius: player.focused ? 4 : 3, piercing: true,
          color: player.focused ? 0xb9ffffff : 0x8ce3eacc, sprite: this.laserSprite }));
      } else {
        const spread = player.focused ? 0.025 : 0.13;
        world.spawn(new PlayerShot({ x: option.x, y: option.y, damage: this.damage * 0.75,
          angle: -Math.PI / 2 + (i - (player.options.length - 1) / 2) * spread,
          speed: this.shotSpeed * 0.8, homing: this.type === 'homing',
          piercing: this.type === 'piercing', color, radius: 4, sprite: this.optionSprite }));
      }
    }
    world.game?.emit('shot', { player, weapon: this });
  }
}

export class Bomb extends Entity {

  declare owner?: Player;
  declare duration: number;
  declare damage: number;
  declare maxRadius: number;
  declare expansion: number;
  declare color: number;
  declare shape: 'orb' | 'beam';
  declare angle: number;
  declare length: number;
  declare width: number;
  declare growFrames: number;
  declare followOwner: boolean;
  declare offsetX: number;
  declare offsetY: number;

  declare onTick?: BombOptions['onTick'];

  constructor(options: BombOptions = {}) {
    super({ group: 'bomb', layer: 65, ...options });
    this.owner = options.owner;
    this.duration = options.duration ?? 150;
    this.damage = options.damage ?? 2;
    this.maxRadius = options.maxRadius ?? 950;
    this.expansion = options.expansion ?? 24;
    this.radius = 0;
    this.onTick = options.onTick;
    this.color = options.color ?? 0x98ebff66;
    this.shape = options.shape ?? 'orb';
    if (this.shape !== 'orb' && this.shape !== 'beam') throw new RangeError('Bomb shape must be orb or beam');
    this.angle = options.angle ?? -Math.PI / 2;
    this.length = options.length ?? 900;
    this.width = options.width ?? 128;
    this.growFrames = options.growFrames ?? 18;
    this.followOwner = options.followOwner ?? this.shape === 'beam';
    this.offsetX = options.offsetX ?? 0;
    this.offsetY = options.offsetY ?? -12;
    if (![this.length, this.width, this.growFrames].every(n => Number.isFinite(n) && n >= 0))
      throw new RangeError('Bomb beam dimensions and growth must be finite and nonnegative');
  }
  get currentWidth() { return this.width * (this.growFrames ? Math.min(1, (this.age + 1) / this.growFrames) : 1); }
  intersectsCircle(x: number, y: number, radius: number): boolean {
    return this.shape === 'beam' ? beamIntersectsCircle(this, x, y, radius) :
      Math.hypot(x - this.x, y - this.y) <= this.radius + radius;
  }
  collidesCircle(x: number, y: number, radius: number): boolean { return this.alive && this.intersectsCircle(x, y, radius); }
  intersectsEntity(entity: import('./bomb-geometry.js').BeamTarget): boolean {
    return this.shape === 'beam' ? beamIntersectsEntity(this, entity) :
      (entity.intersectsCircle ? entity.intersectsCircle(this.x, this.y, this.radius) :
        this.intersectsCircle(entity.x, entity.y, entity.radius ?? 0));
  }
  getAABB(out: Partial<Bounds> = {}): Bounds {
    if (this.shape !== 'beam') return super.getAABB(out);
    const ex = this.x + Math.cos(this.angle) * this.length, ey = this.y + Math.sin(this.angle) * this.length;
    const radius = this.currentWidth / 2;
    out.x = Math.min(this.x, ex) - radius; out.y = Math.min(this.y, ey) - radius;
    out.width = Math.abs(ex - this.x) + radius * 2; out.height = Math.abs(ey - this.y) + radius * 2;
    return out as Bounds;
  }
  update(world: World): void {
    if (this.shape === 'beam') {
      if (this.followOwner && this.owner?.alive !== false && this.owner) {
        this.x = this.owner.x + this.offsetX; this.y = this.owner.y + this.offsetY;
      }
      this.radius = this.currentWidth / 2;
      if (world.game?.cancelBeam) world.game.cancelBeam(this, { reward: true });
      else cancelBombBeam(world, this);
    } else {
      this.radius = Math.min(this.maxRadius, (this.age + 1) * this.expansion);
      world.game?.cancelBullets(this.x, this.y, this.radius, { reward: true });
    }
    for (const enemy of world.entities) {
      if (enemy.alive && enemy.group === 'enemy' && (this.shape === 'beam' ? this.intersectsCircle(enemy.x, enemy.y, enemy.radius) :
        Math.hypot(enemy.x - this.x, enemy.y - this.y) < this.radius + enemy.radius))
        (enemy as import('./enemy.js').Enemy).damage?.(this.damage, 'bomb');
    }
    this.onTick?.(this, world);
    if (this.age >= this.duration - 1) this.destroy('expired');
  }
  draw(draw: DrawList): void {
    if (this.shape === 'beam') {
      draw.line(this.x, this.y, this.x + Math.cos(this.angle) * this.length,
        this.y + Math.sin(this.angle) * this.length, this.currentWidth, this.color);
      return;
    }
    const radius = this.radius;
    draw.ring(this.x, this.y, Math.max(0, radius - 16), radius, this.color);
    for (let i = 0; i < 8; i++) {
      const angle = this.age * 0.055 + i * Math.PI / 4;
      const r = Math.min(210, radius * 0.6);
      draw.circle(this.x + Math.cos(angle) * r, this.y + Math.sin(angle) * r, 12, 0xa0f3ff88);
    }
  }
}

/** Standalone beam cancellation, also used by Game.cancelBeam. */
export function cancelBombBeam(world: World, beam: Bomb, { reward = true, force = false }: { reward?: boolean; force?: boolean } = {}): number {
  let count = 0;
  for (const entity of world.entities.concat(world.pending) as CancellableEntity[]) {
    if (!entity.alive || (entity.group !== 'enemyBullet' && entity.group !== 'enemyLaser') ||
      (!force && !entity.cancelable) || !beam.intersectsEntity(entity)) continue;
    const alreadyCancelled = entity.cancelAge !== undefined && entity.cancelAge !== null;
    if (!(force ? entity.destroy('phaseClear') : entity.cancel('cancel'))) continue;
    count++;
    if (reward && !alreadyCancelled) world.spawn(new Item({ x: entity.x, y: entity.y, type: 'cancel', attracted: true }));
  }
  return count;
}

export const createOrbBomb = (options: BombOptions = {}): Bomb => new Bomb({ ...options, shape: 'orb' });
export const createBeamBomb = (options: BombOptions = {}): Bomb => new Bomb({ ...options, shape: 'beam' });

export class Player extends Entity {

  declare speed: number;
  declare focusSpeed: number;
  declare grazeRadius: number;
  declare pickupRadius: number;
  declare lives: number;
  declare bombs: number;
  declare power: number;
  declare maxPower: number;
  declare lifePieces: number;
  declare bombPieces: number;
  declare graze: number;
  declare state: 'normal' | 'dying' | 'respawning' | 'gameover';
  declare focused: boolean;
  declare invulnerableFrames: number;
  declare deathbombFrames: number;
  declare deathbombRemaining: number;
  declare respawnDuration: number;
  declare respawnRemaining: number;
  declare respawnInvulnerability: number;
  declare weapon: Weapon;
  declare options: Array<{ x: number; y: number }>;
  declare bombOptions: BombOptions;
  declare activeBomb: Bomb | null;
  declare character: string | null;
  declare bombFactory?: PlayerOptions['bombFactory'];



  constructor(options: PlayerOptions = {}) {
    super({ group: 'player', layer: 60, radius: 2.5, ...options });
    this.speed = options.speed ?? 5;
    this.focusSpeed = options.focusSpeed ?? 2.2;
    this.grazeRadius = options.grazeRadius ?? 23;
    this.pickupRadius = options.pickupRadius ?? 13;
    this.lives = options.lives ?? 2;
    this.bombs = options.bombs ?? 3;
    this.power = options.power ?? 1;
    this.maxPower = options.maxPower ?? 4;
    this.lifePieces = 0; this.bombPieces = 0; this.graze = 0;
    this.state = 'normal'; this.focused = false;
    this.invulnerableFrames = options.invulnerableFrames ?? 120;
    this.deathbombFrames = options.deathbombFrames ?? 8;
    this.deathbombRemaining = 0;
    this.respawnDuration = options.respawnDuration ?? 75;
    this.respawnRemaining = 0;
    this.respawnInvulnerability = options.respawnInvulnerability ?? 180;
    this.weapon = options.weapon instanceof Weapon ? options.weapon : new Weapon(options.weapon);
    this.options = [];
    this.bombOptions = options.bomb ?? {};
    this.activeBomb = null;
    this.character = options.character ?? null;
    this.bombFactory = options.bombFactory;
    if (this.bombFactory !== undefined && typeof this.bombFactory !== 'function')
      throw new TypeError('bombFactory must be a function');
  }
  get score() { return this.world?.game?.score ?? 0; }
  get vulnerable() { return this.state === 'normal' && this.invulnerableFrames <= 0; }
  update(world: World): void {
    const game = world.game, input = game?.input;
    if (!input) return;
    if (this.activeBomb && !this.activeBomb.alive) this.activeBomb = null;
    if (this.invulnerableFrames > 0) this.invulnerableFrames--;
    if ((this.state === 'normal' || this.state === 'dying') && input.pressed(Keys.BOMB)) this.useBomb(game);
    if (this.state === 'dying') {
      if (--this.deathbombRemaining <= 0) this.miss(game);
      return;
    }
    if (this.state === 'respawning') {
      if (--this.respawnRemaining <= 0) {
        this.state = 'normal'; this.invulnerableFrames = this.respawnInvulnerability;
        this.x = world.bounds.x + world.bounds.width / 2;
        this.y = world.bounds.y + world.bounds.height - 72;
      }
      return;
    }
    if (this.state !== 'normal') return;
    this.focused = input.down(Keys.FOCUS);
    let dx = Number(input.down(Keys.RIGHT)) - Number(input.down(Keys.LEFT));
    let dy = Number(input.down(Keys.DOWN)) - Number(input.down(Keys.UP));
    const length = Math.hypot(dx, dy) || 1;
    const speed = this.focused ? this.focusSpeed : this.speed;
    const b = world.bounds;
    this.x = clamp(this.x + dx / length * speed, b.x + 10, b.x + b.width - 10);
    this.y = clamp(this.y + dy / length * speed, b.y + 12, b.y + b.height - 12);
    const optionCount = Math.floor(this.power + 0.000001);
    this.options.length = Math.min(this.options.length, optionCount);
    for (let i = 0; i < optionCount; i++) {
      const spacing = this.focused ? 19 : 36;
      const ox = this.x + (i - (optionCount - 1) / 2) * spacing;
      const oy = this.y + (this.focused ? -24 : 10 + Math.abs(i - (optionCount - 1) / 2) * 10);
      if (!this.options[i]) this.options[i] = { x: ox, y: oy };
      this.options[i].x += (ox - this.options[i].x) * 0.25;
      this.options[i].y += (oy - this.options[i].y) * 0.25;
    }
    this.weapon.update(this, world, input.down(Keys.SHOOT) && !game.stage?.dialogue?.active);
  }
  receiveHit(game: Game): boolean {
    if (!this.vulnerable) return false;
    this.state = 'dying'; this.deathbombRemaining = this.deathbombFrames;
    Effects.burst(game.world, this.x, this.y, 0xff8fbcff, 6);
    game.emit('hit', { player: this });
    if (this.deathbombRemaining <= 0) this.miss(game);
    return true;
  }
  useBomb(game: Game): boolean {
    if (this.bombs <= 0 || this.activeBomb?.alive || (this.state !== 'normal' && this.state !== 'dying')) return false;
    const deathbomb = this.state === 'dying';
    const options = { x: this.x, y: this.y, owner: this, ...this.bombOptions };
    const bomb = this.bombFactory ? this.bombFactory(this, game, options) : new Bomb(options);
    if (!(bomb instanceof Bomb)) throw new TypeError('bombFactory must return a Bomb');
    this.bombs--; this.state = 'normal'; this.deathbombRemaining = 0;
    this.activeBomb = game.world.spawn(bomb);
    this.invulnerableFrames = this.activeBomb.duration + 60;
    game.stats.bombsUsed++;
    game.boss?.invalidateCapture('bomb');
    game.emit('bomb', { player: this, deathbomb });
    return true;
  }
  miss(game: Game): void {
    this.lives--; this.state = 'respawning'; this.respawnRemaining = this.respawnDuration;
    this.bombs = game.rules.respawnBombs;
    const lostPower = Math.min(1, this.power);
    this.power = Math.max(0, this.power - lostPower);
    for (let i = 0; i < 5; i++) game.world.spawn(new Item({ x: this.x + (i - 2) * 12, y: this.y,
      vx: (i - 2) * 0.6, vy: -2.5, type: 'power', value: lostPower / 10 }));
    game.stats.misses++; game.boss?.invalidateCapture('miss');
    game.cancelBullets(this.x, this.y, 110, { reward: false });
    Effects.burst(game.world, this.x, this.y, 0xff8fbcff, 24);
    game.emit('miss', { player: this });
    if (this.lives < 0) { this.state = 'gameover'; game.gameOver(); }
  }
  draw(draw: DrawList): void {
    if (this.state === 'respawning' || this.state === 'gameover') return;
    if (this.invulnerableFrames > 0 && Math.floor(this.age / 4) % 2) return;
    for (const option of this.options) {
      draw.ring(option.x, option.y, 6, 8, 0xff89c9cc);
      draw.circle(option.x, option.y, 3, 0xffd6eaff);
    }
    draw.triangle(this.x, this.y - 17, this.x - 13, this.y + 12, this.x + 13, this.y + 12, 0xeefaffff);
    draw.triangle(this.x, this.y - 9, this.x - 7, this.y + 8, this.x + 7, this.y + 8, 0xec668dff);
    if (this.focused || this.state === 'dying') {
      draw.ring(this.x, this.y, 6, 7, 0xffffffff);
      draw.circle(this.x, this.y, this.radius, 0xff386aff);
    }
  }
}
