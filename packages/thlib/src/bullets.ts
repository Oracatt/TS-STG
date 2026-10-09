import type { DrawList } from './render.js';
import type { World } from './world.js';
import type { Vec2, Bounds, BulletShape, BulletCommand, BulletOptions } from './core-types.js';
import { Entity } from './world.js';
import { approachAngle, angleTo, clamp, distanceToSegmentSq, circlesOverlap, mod } from './math.js';
import { withAlpha } from './render.js';

export class Bullet extends Entity {
  declare activeThisFrame: boolean;  declare onBounce?: (edge: string, world: World | null) => void;
  declare onWrap?: (world: World | null) => void;

  declare angle: number;
  declare speed: number;
  declare acceleration: number;
  declare maxSpeed: number;
  declare minSpeed: number;
  declare angularVelocity: number;
  declare angularAcceleration: number;
  declare delay: number;
  declare lifetime: number;
  declare bounce: number;
  declare bounceEdges: string[];
  declare wrap: number;
  declare cullMargin: number;
  declare offscreenGrace: number;
  declare autoCull: boolean;
  declare owner: Entity | null;
  declare damage: number;
  declare cancelable: boolean;
  declare color: number;
  declare shape: BulletShape;
  declare sprite: number | null;
  declare scale: number;
  declare grazeRadius: number;
  declare grazed: Set<number>;

  declare hitbox: 'circle' | 'capsule' | 'box';
  declare halfLength: number;
  declare halfWidth: number;
  declare homing: BulletOptions['homing'];
  declare homingRate: number;
  declare homingFrames: number;
  declare behavior: BulletOptions['behavior'] | null;
  declare commands: BulletCommand[];
  declare commandIndex: number;

  constructor(options: BulletOptions = {}) {
    super({ ...options, group: options.group ?? 'enemyBullet', radius: options.radius ?? 4, layer: options.layer ?? 50 });
    this.angle = options.angle ?? Math.atan2(this.vy, this.vx);
    this.speed = options.speed ?? Math.hypot(this.vx, this.vy);
    this.acceleration = options.acceleration ?? 0; this.maxSpeed = options.maxSpeed ?? Infinity;
    this.minSpeed = options.minSpeed ?? -Infinity; this.angularVelocity = options.angularVelocity ?? 0;
    this.angularAcceleration = options.angularAcceleration ?? 0;
    this.delay = options.delay ?? 0; this.lifetime = options.lifetime ?? 3600;
    this.activeThisFrame = this.delay <= 0;
    this.bounce = options.bounce === true ? Infinity : (options.bounce ?? 0) as number;
    this.bounceEdges = options.bounceEdges ?? ['left', 'right', 'top', 'bottom'];
    this.wrap = options.wrap === true ? Infinity : (options.wrap ?? 0) as number;
    this.cullMargin = options.cullMargin ?? 64; this.offscreenGrace = options.offscreenGrace ?? 0;
    this.autoCull = options.autoCull ?? true; this.owner = options.owner ?? null;
    this.damage = options.damage ?? 1; this.cancelable = options.cancelable ?? true;
    this.color = options.color ?? 0xff578aff; this.shape = options.shape ?? 'circle';
    this.sprite = options.sprite ?? null; this.scale = options.scale ?? 1;
    this.grazeRadius = options.grazeRadius ?? 0; this.grazed = new Set();
    this.homing = options.homing ?? null; this.homingRate = options.homingRate ?? 0.03;
    this.homingFrames = options.homingFrames ?? Infinity;
    this.behavior = options.behavior ?? null;
    this.commands = (options.commands ?? []).map((command, order) => ({ ...command, order })).sort((a, b) => a.at - b.at || a.order - b.order);
    this.commandIndex = 0;
    this.hitbox = options.hitbox ?? (['rice', 'kunai', 'arrow'].includes(this.shape) ? 'capsule' : 'circle');
    this.halfLength = options.halfLength ?? this.radius * 1.15;
    this.halfWidth = options.halfWidth ?? this.radius;
    this.syncVelocity();
  }
  get isActive() { return this.alive && this.activeThisFrame; }
  syncVelocity(): void { this.vx = Math.cos(this.angle) * this.speed; this.vy = Math.sin(this.angle) * this.speed; }
  setVelocity(angle: number, speed: number = this.speed): this { this.angle = angle; this.speed = speed; this.syncVelocity(); return this; }
  aimAt(target: Vec2, offset: number = 0): this { this.angle = angleTo(this, target) + offset; this.syncVelocity(); return this; }
  graze(player: number | Entity): boolean {
    const key = typeof player === 'object' ? player.id : player;
    if (!this.isActive || this.grazed.has(key)) return false;
    this.grazed.add(key); return true;
  }
  cancel(reason: string = 'cancel'): boolean { return this.cancelable && this.destroy(reason); }
  execute(command: BulletCommand, world: World): void {
    if (typeof command.action === 'function') { command.action(this, world); return; }
    switch (command.type) {
      case 'turn': this.angle = command.angle ?? this.angle + (command.delta ?? 0); break;
      case 'aim': { const target = typeof command.target === 'function' ? command.target(this, world) : command.target ?? world.game?.player; if (target) this.aimAt(target, command.offset ?? 0); break; }
      case 'speed': this.speed = command.value!; break;
      case 'acceleration': this.acceleration = command.value!; break;
      case 'angularVelocity': this.angularVelocity = command.value!; break;
      case 'pause': this.delay = this.age + (command.frames ?? 1); break;
      case 'style': if (command.color !== undefined) this.color = command.color; if (command.shape) this.shape = command.shape; break;
      case 'cancel': this.cancel(); break;
      default: throw new Error(`Unknown bullet command: ${command.type}`);
    }
  }
  update(world: World): void {
    while (this.commandIndex < this.commands.length && this.commands[this.commandIndex].at <= this.age) {
      this.execute(this.commands[this.commandIndex++], world);
      if (!this.alive) return;
    }
    this.activeThisFrame = this.age >= this.delay;
    if (this.age >= this.lifetime) { this.destroy('lifetime'); return; }
    if (!this.isActive) return;
    this.behavior?.(this, world);
    if (!this.alive) return;
    if (this.homing && this.age - this.delay < this.homingFrames) {
      const target = typeof this.homing === 'function' ? this.homing(this, world) : this.homing;
      if (target?.alive !== false && target) this.angle = approachAngle(this.angle, angleTo(this, target), this.homingRate);
    }
    this.angularVelocity += this.angularAcceleration;
    this.angle += this.angularVelocity;
    this.speed += this.acceleration;
    if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    this.syncVelocity(); this.x += this.vx; this.y += this.vy;
    if (this.bounce > 0 || this.wrap > 0) this.handleBounds(world.bounds);
    if (this.autoCull && this.age >= this.offscreenGrace) {
      const b = world.bounds, m = this.cullMargin + this.radius;
      if (this.x < b.x - m || this.x > b.x + b.width + m || this.y < b.y - m || this.y > b.y + b.height + m) this.destroy('offscreen');
    }
  }
  handleBounds(bounds: Bounds): void {
    const left = bounds.x, right = left + bounds.width, top = bounds.y, bottom = top + bounds.height;
    if (this.x >= left && this.x <= right && this.y >= top && this.y <= bottom) return;
    // Reflect overshoot, preserving distance travelled even at high speeds.
    const reflect = (axis: 'x' | 'y', lo: number, hi: number, lowEdge: string, highEdge: string) => {
      let guard = 1024;
      while (this.bounce > 0 && guard-- && (this[axis] < lo || this[axis] > hi)) {
        const lower = this[axis] < lo;
        if (!this.bounceEdges.includes(lower ? lowEdge : highEdge)) break;
        this[axis] = 2 * (lower ? lo : hi) - this[axis];
        this.angle = axis === 'x' ? Math.PI - this.angle : -this.angle;
        this.bounce--; this.onBounce?.(lower ? lowEdge : highEdge, this.world);
      }
    };
    if (this.bounce > 0) { reflect('x', left, right, 'left', 'right'); reflect('y', top, bottom, 'top', 'bottom'); this.syncVelocity(); }
    if (this.wrap > 0 && (this.x < left || this.x > right || this.y < top || this.y > bottom)) {
      if (this.x < left || this.x > right) this.x = left + mod(this.x - left, bounds.width);
      if (this.y < top || this.y > bottom) this.y = top + mod(this.y - top, bounds.height);
      this.wrap--; this.onWrap?.(this.world);
    }
  }
  collidesCircle(x: number, y: number, radius: number): boolean {
    if (!this.isActive) return false;
    if (this.hitbox === 'circle') return circlesOverlap(this.x, this.y, this.radius * this.scale, x, y, radius);
    const cosine = Math.cos(this.angle), sine = Math.sin(this.angle);
    const localX = (x - this.x) * cosine + (y - this.y) * sine;
    const localY = -(x - this.x) * sine + (y - this.y) * cosine;
    const length = this.halfLength * this.scale, width = this.halfWidth * this.scale;
    if (this.hitbox === 'box') {
      return (localX - clamp(localX, -length, length)) ** 2 + (localY - clamp(localY, -width, width)) ** 2 <= radius * radius;
    }
    return distanceToSegmentSq(localX, localY, -length, 0, length, 0) <= (width + radius) ** 2;
  }
  getAABB(out: Partial<Bounds> = {}): Bounds {
    const radius = (this.hitbox === 'circle' ? this.radius : this.halfLength + this.halfWidth) * this.scale;
    out.x = this.x - radius; out.y = this.y - radius; out.width = out.height = radius * 2; return out as Bounds;
  }
  draw(draw: DrawList): void {
    const r = this.radius * this.scale, color = this.isActive ? this.color : withAlpha(this.color, 0.3);
    if (this.sprite !== null) { draw.sprite(this.sprite, this.x, this.y, r * 4, r * 4, this.angle, color); return; }
    const c = Math.cos(this.angle), s = Math.sin(this.angle), x = this.x, y = this.y;
    if (this.shape === 'rice' || this.shape === 'kunai' || this.shape === 'arrow') {
      const length = this.halfLength * this.scale;
      draw.line(x - c * length, y - s * length, x + c * length, y + s * length, r * 2, color);
      draw.line(x - c * length * 0.6, y - s * length * 0.6, x + c * length, y + s * length, r * 0.65, 0xffffffff);
    } else if (this.shape === 'diamond') {
      draw.triangle(x + c * r * 1.8, y + s * r * 1.8, x - s * r, y + c * r, x - c * r * 1.8, y - s * r * 1.8, color);
      draw.triangle(x + c * r * 1.8, y + s * r * 1.8, x - c * r * 1.8, y - s * r * 1.8, x + s * r, y - c * r, color);
    } else if (this.shape === 'star') {
      for (let i = 0; i < 5; i++) {
        const a = this.angle + i * Math.PI * 0.4;
        draw.triangle(x, y, x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7, x + Math.cos(a + 0.6) * r * 0.6, y + Math.sin(a + 0.6) * r * 0.6, color);
      }
    } else {
      draw.circle(x, y, r + 1.5, color);
      if (this.shape === 'orb') draw.ring(x, y, r * 0.55, r * 0.8, 0xffffffff);
      else draw.circle(x - r * 0.18, y - r * 0.18, r * 0.45, 0xffffffff);
    }
  }
  snapshot(): Record<string, any> { return { ...super.snapshot(), angle: this.angle, speed: this.speed, delay: this.delay, grazed: [...this.grazed] }; }
}
