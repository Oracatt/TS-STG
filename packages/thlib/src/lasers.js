import { Entity } from './world.js';
import { clamp, distanceToSegmentSq } from './math.js';
import { withAlpha } from './render.js';

/** Beam lifecycle is warning -> grow -> active -> fade; warning and fade never hit. */
export class Laser extends Entity {
  constructor(options = {}) {
    super({ ...options, group: options.group ?? 'enemyLaser', layer: options.layer ?? 40 });
    this.kind = options.kind ?? 'straight';
    this.angle = options.angle ?? Math.PI / 2;
    this.length = options.length ?? 400; this.width = options.width ?? 12;
    this.speed = options.speed ?? 0;
    this.angularVelocity = options.angularVelocity ?? options.turnRate ?? 0;
    this.warningFrames = options.warningFrames ?? options.warning ?? 60;
    this.growFrames = options.growFrames ?? options.grow ?? 12;
    this.activeFrames = options.activeFrames ?? options.duration ?? 180;
    this.fadeFrames = options.fadeFrames ?? options.fade ?? 20;
    for (const key of ['warningFrames', 'growFrames', 'activeFrames', 'fadeFrames']) {
      if (!Number.isFinite(this[key]) || this[key] < 0) throw new RangeError(`${key} must be finite and nonnegative`);
      this[key] = Math.ceil(this[key]);
    }
    this.color = options.color ?? 0x7cefffff;
    this.damage = options.damage ?? 1; this.cancelable = options.cancelable ?? true;
    this.grazeCooldown = options.grazeCooldown ?? 15;
    this.hitboxScale = options.hitboxScale ?? 0.75;
    this.grazeFrames = new Map(); this.owner = options.owner ?? null;
    this.follow = options.follow ?? null; this.offsetX = options.offsetX ?? 0; this.offsetY = options.offsetY ?? 0;
    this.maxPoints = Math.max(2, options.maxPoints ?? 80);
    this.points = (options.points ?? []).map(point => ({ x: point.x, y: point.y }));
    this.path = options.path ?? null; this.behavior = options.behavior ?? null;
    if (this.kind === 'curved' && !this.points.length) this.points.push({ x: this.x, y: this.y });
    this.cancelAge = null;
    // World increments public age after update. Keep the evaluated tick stable for
    // collision/render so even a one-frame beam gets exactly one harmful frame.
    this.phaseAge = 0;
  }
  get phase() {
    if (!this.alive) return 'dead';
    if (this.cancelAge !== null) return 'fade';
    if (this.phaseAge < this.warningFrames) return 'warning';
    if (this.phaseAge < this.warningFrames + this.growFrames) return 'grow';
    if (this.phaseAge < this.warningFrames + this.growFrames + this.activeFrames) return 'active';
    return 'fade';
  }
  get isActive() { const phase = this.phase; return phase === 'active' || (phase === 'grow' && this.currentWidth > 0); }
  get active() { return this.isActive; }
  get currentWidth() {
    const phase = this.phase;
    if (phase === 'dead') return 0;
    if (phase === 'warning') return Math.min(2, this.width * 0.15);
    if (phase === 'grow') return this.width * clamp((this.phaseAge - this.warningFrames + 1) / this.growFrames, 0, 1);
    if (phase === 'active') return this.width;
    const fadeAge = this.cancelAge === null ? this.phaseAge - this.warningFrames - this.growFrames - this.activeFrames : this.phaseAge - this.cancelAge;
    return (this.cancelAge === null ? this.width : this.cancelWidth) * (1 - clamp(fadeAge / Math.max(1, this.fadeFrames), 0, 1));
  }
  update(world) {
    this.phaseAge = this.age;
    const end = this.cancelAge === null ? this.warningFrames + this.growFrames + this.activeFrames + this.fadeFrames : this.cancelAge + this.fadeFrames;
    if (this.age >= end) { this.destroy('lifetime'); return; }
    this.behavior?.(this, world);
    if (!this.alive) return;
    this.angle += this.angularVelocity;
    if (this.follow?.alive !== false && this.follow) {
      this.x = this.follow.x + this.offsetX; this.y = this.follow.y + this.offsetY;
    } else if (this.path) {
      const next = this.path(this.age, this, world);
      this.x = next.x; this.y = next.y;
    } else {
      this.vx = Math.cos(this.angle) * this.speed; this.vy = Math.sin(this.angle) * this.speed;
      this.x += this.vx; this.y += this.vy;
    }
    if (this.kind === 'curved') {
      const last = this.points[this.points.length - 1];
      if (!last || last.x !== this.x || last.y !== this.y) this.points.push({ x: this.x, y: this.y });
      if (this.points.length > this.maxPoints) this.points.splice(0, this.points.length - this.maxPoints);
    }
  }
  segments() {
    if (this.kind === 'curved') {
      const segments = [];
      for (let i = 1; i < this.points.length; i++) segments.push([this.points[i - 1].x, this.points[i - 1].y, this.points[i].x, this.points[i].y]);
      return segments;
    }
    const dx = Math.cos(this.angle) * this.length, dy = Math.sin(this.angle) * this.length;
    return this.kind === 'moving' ? [[this.x - dx, this.y - dy, this.x, this.y]] : [[this.x, this.y, this.x + dx, this.y + dy]];
  }
  intersectsCircle(x, y, radius, width = this.currentWidth * this.hitboxScale) {
    const threshold = (radius + width / 2) ** 2;
    for (const [ax, ay, bx, by] of this.segments()) if (distanceToSegmentSq(x, y, ax, ay, bx, by) <= threshold) return true;
    return false;
  }
  collidesCircle(x, y, radius) { return this.isActive && this.intersectsCircle(x, y, radius); }
  canGraze(player, frame = this.world?.frame ?? this.age) {
    const key = typeof player === 'object' ? player.id : player;
    if (!this.isActive || frame - (this.grazeFrames.get(key) ?? -Infinity) < this.grazeCooldown) return false;
    this.grazeFrames.set(key, frame); return true;
  }
  graze(player, frame) { return this.canGraze(player, frame); }
  cancel(reason = 'cancel') {
    if (!this.alive || !this.cancelable || this.cancelAge !== null) return false;
    this.cancelWidth = this.currentWidth;
    this.cancelAge = this.age; this.cancelReason = reason;
    if (this.fadeFrames === 0) this.destroy(reason);
    this.world?.invalidateSpatial(); return true;
  }
  getAABB() {
    let x0 = this.x, x1 = this.x, y0 = this.y, y1 = this.y;
    for (const [ax, ay, bx, by] of this.segments()) {
      x0 = Math.min(x0, ax, bx); x1 = Math.max(x1, ax, bx);
      y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
    }
    const radius = this.width / 2;
    return { x: x0 - radius, y: y0 - radius, width: x1 - x0 + this.width, height: y1 - y0 + this.width };
  }
  draw(draw) {
    const phase = this.phase, width = this.currentWidth;
    if (width <= 0 || phase === 'dead') return;
    const color = phase === 'warning' ? withAlpha(this.color, 0.45 + 0.2 * Math.sin(this.age * 0.35)) : this.color;
    for (const [ax, ay, bx, by] of this.segments()) {
      draw.line(ax, ay, bx, by, width + (phase === 'warning' ? 0 : 3), withAlpha(color, phase === 'warning' ? 0.45 : 0.3));
      draw.line(ax, ay, bx, by, width, color);
      if (phase !== 'warning') draw.line(ax, ay, bx, by, width * 0.3, 0xffffffff);
    }
    if (this.kind === 'straight') { draw.circle(this.x, this.y, 6 + width * 0.5, color); draw.circle(this.x, this.y, 3, 0xffffffff); }
  }
  snapshot() { return { ...super.snapshot(), kind: this.kind, angle: this.angle, phase: this.phase, width: this.currentWidth, points: this.points.map(point => ({ ...point })) }; }
}
