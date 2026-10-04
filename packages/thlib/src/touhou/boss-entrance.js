import { PI, mul } from './math.js';

/** st02bs..st07bs Boss(): two EffChargePoint2 calls, 101-frame wait,
 * then the Boss body is attached. The four streams use EffectInf1's original
 * two Hermite paths and effect149 subtractive / effect150 additive particles.
 * st01bs varies the two outer angles; callers may supply their own streams.
 * Fly-in movement belongs to the stage: it need not summon any black fog. */
export const TOUHOU_BOSS_ENTRANCE_PRESETS = Object.freeze({
  blackFog: Object.freeze({ revealFrame: 101, readyFrame: 101, sound: 54,
    streams: Object.freeze([
      Object.freeze({ script: 153, rotation: mul(PI, .5) }),
      Object.freeze({ script: 157, rotation: 0 }),
      Object.freeze({ script: 158, rotation: mul(PI, .5) }),
      Object.freeze({ script: 154, rotation: PI }),
    ]) }),
  flyIn: Object.freeze({ revealFrame: 0, readyFrame: 0, sound: null, streams: Object.freeze([]) }),
});

/** An explicitly started entrance, separate from persistent aura attachment.
 * ready allows dialogue/combat to proceed; alive also includes the fog tail.
 * This owner updates only its own roots and particles. As with other public
 * presentation owners, callers must not additionally call bank.update(). */
export class TouhouBossEntrance {
  constructor(bank, { mode = 'blackFog', x = 0, y = 128, z = 0, follow = null,
    revealFrame, readyFrame, streams, sound = null, onReveal = null, onComplete = null } = {}) {
    if (!bank?.create) throw new TypeError('Boss entrance requires an effect ANM bank');
    const preset = TOUHOU_BOSS_ENTRANCE_PRESETS[mode];
    if (!preset) throw new RangeError('Unknown Boss entrance mode');
    revealFrame ??= preset.revealFrame; readyFrame ??= Math.max(revealFrame, preset.readyFrame);
    if (![x, y, z].every(Number.isFinite)) throw new TypeError('Boss entrance coordinates must be finite');
    if (!Number.isInteger(revealFrame) || revealFrame < 0 || !Number.isInteger(readyFrame) || readyFrame < revealFrame)
      throw new RangeError('Boss entrance requires 0 <= revealFrame <= readyFrame integer frames');
    const recipe = streams ?? preset.streams;
    if (!Array.isArray(recipe) || recipe.some(stream => !Number.isInteger(stream.script) || !Number.isFinite(stream.rotation)))
      throw new TypeError('Boss entrance streams require an integer script and a finite rotation');
    this.bank = bank; this.mode = mode; this.position = { x, y, z }; this.follow = follow;
    Object.assign(this, { revealFrame, readyFrame, onReveal, onComplete });
    this.age = 0; this.alive = true; this.revealed = false; this.ready = false; this.completed = false;
    this.cancelled = false; this.revealDelivered = false; this.completeDelivered = false;
    // ECL303 attached roots are front-registered; their spawned effect149/150
    // particles use the ordinary named registration in ConvergingParticles.
    this.roots = recipe.map(stream => bank.create(stream.script, { ...this.position, rotation: stream.rotation, front: true }));
    this.particles = [];
    if (preset.sound !== null) sound?.(preset.sound, x);
    this.advanceState();
  }
  get isHidden() { return !this.revealed; }
  advanceState() {
    if (!this.revealed && this.age >= this.revealFrame) this.revealed = true;
    this.ready = this.revealed && this.age >= this.readyFrame;
    if (this.ready && !this.roots.some(vm => vm.alive) && !this.particles.some(vm => vm.alive)) {
      this.alive = false; this.completed = true;
    }
  }
  /** Owners call this after assigning the new entrance. A standalone owner
   * may simply update: zero-duration events are dispatched at age0 there.
   * Cancellation during onReveal suppresses its pending completion event. */
  dispatchEvents() {
    if (this.cancelled) return this;
    if (this.revealed && !this.revealDelivered) { this.revealDelivered = true; this.onReveal?.(this); }
    if (this.cancelled) return this;
    if (this.completed && !this.completeDelivered) { this.completeDelivered = true; this.onComplete?.(this); }
    return this;
  }
  update() {
    if (!this.alive) return this.dispatchEvents();
    const previous = this.particles.slice(), position = this.follow ?? this.position;
    if (![position.x, position.y, position.z ?? 0].every(Number.isFinite)) throw new TypeError('Boss entrance follow coordinates must be finite');
    this.position = { x: position.x, y: position.y, z: position.z ?? 0 };
    for (const root of this.roots) if (root.alive) {
      root.x = this.position.x; root.y = this.position.y; root.z = this.position.z; root.update();
    }
    // Snapshot before parent updates: newly born particles have already run
    // frame zero. They are exclusively owned here, so updateDetached cannot
    // advance or draw them a second time in TouhouGame or a demo adapter.
    this.particles = this.roots.flatMap(root => root.attachedEffect?.particles.map(particle => particle.vm) ?? []);
    for (const vm of this.particles) vm.detachedRoot = false;
    for (const vm of previous) if (vm.alive) vm.update();
    this.particles = this.particles.filter(vm => vm.alive);
    this.age++; this.advanceState(); return this.dispatchEvents();
  }
  draw(draw, view = { x: 336, y: 24, scale: 1.5, screenScale: 1 }) {
    if (this.alive) {
      for (const root of this.roots) root.draw(draw, view);
      for (const vm of this.particles) vm.draw(draw, view);
    }
    return draw;
  }
  destroy() {
    for (const root of this.roots) root.destroy();
    for (const vm of this.particles) vm.destroy();
    this.roots.length = this.particles.length = 0; this.alive = false; this.cancelled = true;
  }
  snapshot() { return { mode: this.mode, age: this.age, alive: this.alive, revealed: this.revealed,
    ready: this.ready, completed: this.completed, cancelled: this.cancelled, revealFrame: this.revealFrame, readyFrame: this.readyFrame,
    position: { ...this.position }, roots: this.roots.map(root => ({ ...root.snapshot(), effect: root.attachedEffect?.snapshot() ?? null })),
    particles: this.particles.length }; }
}
