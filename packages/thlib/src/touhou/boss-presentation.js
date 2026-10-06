import { TouhouSpell } from './spell.js';
import { TouhouBossHud } from './boss-hud.js';
import { TouhouEnemyDistortion } from './distortion.js';
import { TouhouBossDeath } from './boss-death.js';
import { TouhouBossEntrance } from './boss-entrance.js';
import { createTouhouCamera } from './anm-projection.js';
import { f32, sub, mul, TouhouRNG } from './math.js';

export const TOUHOU_BOSS_VIEW = Object.freeze({ x: 336, y: 24, scale: 1.5, screenScale: 1 });
export const TOUHOU_BOSS_SCREEN_VIEW = Object.freeze({ x: 0, y: 0, scale: 1, screenScale: 1.5,
  screenOffsets: Object.freeze([Object.freeze({ x: 48, y: 24 }), Object.freeze({ x: 336, y: 24 })]) });
/** Repeated Boss combat setup in st01bs..st07bs and st01mbs..st05mbs: effect ANM
 * attachment slots 1/2 and ECL 621. Neither entry contains a specific Boss. */
export const TOUHOU_BOSS_PROFILES = Object.freeze({
  boss: Object.freeze({ auraScripts: Object.freeze([99, 108]), radius: 160, color: 0x00f00f80 }),
  midboss: Object.freeze({ auraScripts: Object.freeze([99]), radius: 128, color: 0x008080ff }),
});
/** Attack preparation from st01bs..st04bs/st07bs ECL 307: effect72, wait60,
 * effect89. These shrinking/expanding circle cohorts are distinct from the
 * entry EffChargePoint151..192 callbacks and the persistent aura99/108. */
export const TOUHOU_BOSS_CHARGE_PRESETS = Object.freeze(Object.fromEntries(
  ['magenta', 'red', 'blue', 'cyan', 'green', 'yellow', 'white'].map((color, index) =>
    [color, Object.freeze({ chargeScript: 64 + index * 2, releaseScript: 79 + index * 2 })])));

function chargeClockFrame(clock) {
  const frame = clock();
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Boss charge clock must return a nonnegative integer frame');
  return frame;
}

/** A source ECL307 position is sampled at each spawn. Existing roots stay at
 * that position while their own ANM children converge or expand. A caller may
 * supply follow for later repeat/release births without dragging live particles. */
export class TouhouBossCharge {
  constructor(bank, { x = 0, y = 128, z = 0, color = 'green', releaseColor = 'yellow',
    repeatCount = 1, repeatInterval = 24, releaseFrame = 60, release = true, follow = null, clock = null } = {}) {
    if (!bank?.create) throw new TypeError('Boss charge requires an effect ANM bank');
    if (!Object.prototype.hasOwnProperty.call(TOUHOU_BOSS_CHARGE_PRESETS, color) ||
      !Object.prototype.hasOwnProperty.call(TOUHOU_BOSS_CHARGE_PRESETS, releaseColor))
      throw new RangeError('Unknown original Boss charge color');
    if (![x, y, z].every(Number.isFinite)) throw new TypeError('Boss charge coordinates must be finite');
    if (!Number.isInteger(repeatCount) || repeatCount < 1 || !Number.isInteger(repeatInterval) || repeatInterval < 1 ||
      !Number.isInteger(releaseFrame) || releaseFrame < (repeatCount - 1) * repeatInterval)
      throw new RangeError('Invalid Boss charge timeline');
    if (clock !== null && typeof clock !== 'function') throw new TypeError('Boss charge clock must be a function or null');
    const age = clock === null ? 0 : chargeClockFrame(clock);
    this.bank = bank; this.position = { x, y, z }; this.follow = follow;
    Object.assign(this, { color, releaseColor, repeatCount, repeatInterval, releaseFrame, release, clock });
    this.age = age; this.emitted = 0; this.released = false; this.stopped = false; this.alive = true; this.roots = [];
    this.spawn(TOUHOU_BOSS_CHARGE_PRESETS[color].chargeScript); this.emitted++;
  }
  spawn(script) {
    const position = this.follow ?? this.position;
    if (![position.x, position.y, position.z ?? 0].every(Number.isFinite)) throw new TypeError('Boss charge follow coordinates must be finite');
    // ECL307 uses named_spawn flags2 (front registration), not an attached VM.
    const vm = this.bank.create(script, { x: position.x, y: position.y, z: position.z ?? 0, front: true });
    this.roots.push(vm); return vm;
  }
  update() {
    if (!this.alive) return this;
    // A stage may create this owner during an update's damage pass or from a
    // later phase cue. Reading that owner's logical clock keeps a same-frame
    // presentation update at age0, instead of releasing one frame too early.
    // ANM roots still advance once per fixed update independently of this age.
    // stop severs the logical dependency on a finished phase. That phase may
    // already have reset/reused its clock while these ANM particles retire.
    this.age = this.clock === null ? this.age + 1 : this.stopped ? this.age : chargeClockFrame(this.clock);
    if (!this.stopped) {
      if (this.emitted < this.repeatCount && this.age >= this.emitted * this.repeatInterval) {
        this.spawn(TOUHOU_BOSS_CHARGE_PRESETS[this.color].chargeScript); this.emitted++;
      }
      if (this.release && !this.released && this.age >= this.releaseFrame) {
        this.spawn(TOUHOU_BOSS_CHARGE_PRESETS[this.releaseColor].releaseScript); this.released = true;
      }
    }
    for (const vm of this.roots) if (vm.alive) vm.update();
    this.roots = this.roots.filter(vm => vm.alive);
    const pending = !this.stopped && (this.emitted < this.repeatCount || this.release && !this.released);
    this.alive = !!(pending || this.roots.length); return this;
  }
  draw(draw, view = TOUHOU_BOSS_VIEW) { for (const vm of this.roots) vm.draw(draw, view); return draw; }
  /** Stop future repeat/release births. Existing source animations finish. */
  stop() { this.stopped = true; return this; }
  destroy() { for (const vm of this.roots) vm.destroy(); this.roots.length = 0; this.alive = false; this.stopped = true; }
  snapshot() { return { age: this.age, alive: this.alive, color: this.color, releaseColor: this.releaseColor,
    emitted: this.emitted, released: this.released, stopped: this.stopped, roots: this.roots.map(vm => vm.snapshot()) }; }
}
/** Keep the original 416×480 gameplay projection while placing it in the
 * caller's playfield. A projected ANM camera does not consume the 2D x/y view
 * translation automatically, so its output viewport must be mapped explicitly. */
export function createTouhouBossAuraView(view = TOUHOU_BOSS_VIEW) {
  if (view.projection) return view;
  const scale = mul(view.scale ?? 1, view.screenScale ?? 1), width = view.canvasWidth ?? mul(640, scale), height = view.canvasHeight ?? mul(480, scale);
  const cx = f32(Math.trunc(width / 2)), cy = f32(Math.trunc(height / 2));
  return { ...view, canvasWidth: width, canvasHeight: height, projection: {
    ...createTouhouCamera({ x: sub(cx, 208), y: sub(cy, 240), width: 416, height: 480 }),
    screenScale: scale, screenOffsets: [{ x: cx, y: sub(cy, 224) }, { x: cx, y: mul(16, scale) }],
    outputViewport: { x: sub(view.x ?? 0, mul(208, scale)), y: sub(view.y ?? 0, mul(16, scale)), width: mul(416, scale), height: mul(480, scale) },
  } };
}

/** Common original presentation, with caller-owned attacks, portraits and backgrounds.
 * card_system/start.cpp selects effect 6 (children 4/5) and 13, not a substitute
 * procedural ring or third-party spell shader. The banks retain the source ANM
 * timing, geometry, blend modes, easing, UVs and callback-layer priorities.
 *
 * Coordinates are original game units: x -192..192, y 0..448. The caller owns
 * the background render target; drawDistortion samples that completed target.
 * This owner advances only its own animation roots, never an entire shared bank.
 */
export class TouhouBossPresentation {
  constructor({ banks, player = null, font = null, context = {}, spellOptions = {}, spell = null, hud = null,
    manageSpell = spell === null, manageHud = hud === null, view = TOUHOU_BOSS_VIEW,
    screenView = TOUHOU_BOSS_SCREEN_VIEW, distortion = {}, profile = 'boss', auraScripts = null, auraView = null, visualRng = new TouhouRNG(1) } = {}) {
    if (!banks?.effect || !banks?.front || !banks?.ascii_960)
      throw new TypeError('TouhouBossPresentation requires the common effect, front and ascii_960 ANM banks');
    this.banks = banks; this.player = player; this.font = font; this.view = { ...view }; this.screenView = { ...screenView };
    this.visualRng = visualRng;
    this.context = { createNameAnimation: banks.text?.environment.createNameAnimation, ...context }; this.boss = null; this.frame = 0; this.alive = true;
    if (!TOUHOU_BOSS_PROFILES[profile]) throw new RangeError('Unknown original Boss presentation profile');
    this.profile = TOUHOU_BOSS_PROFILES[profile]; this.profileName = profile;
    this.auraScripts = (auraScripts ?? this.profile.auraScripts).slice(); this.auraView = auraView ?? createTouhouBossAuraView(view);
    this.aura = []; this.auraPending = false; this.combatActive = false; this.charges = []; this.deaths = []; this.entrance = null; this.manageSpell = manageSpell; this.manageHud = manageHud; this.distortionOptions = distortion;
    this.hud = hud ?? new TouhouBossHud({ bank: banks.front, textBank: banks.ascii_960, font });
    const notifyHud = this.context.hudNumberInterrupt;
    this.context.hudNumberInterrupt = label => {
      for (const vm of this.hud.numbers) vm.interruptNow(label);
      notifyHud?.(label);
    };
    this.spell = spell ?? new TouhouSpell({ player, textBank: banks.ascii_960, effectBank: banks.effect,
      font, ...spellOptions, context: this.context,
      presentation: { ...spellOptions.presentation, screenView: this.screenView } });
    this.distortion = null; this.distortionReady = false;
  }
  checkAlive() { if (!this.alive) throw new Error('TouhouBossPresentation has been destroyed'); }
  /** Bind a Boss without starting combat. ECL519 waits for the active dialogue
   * to release it before source aura99/108 and ECL621. Neither the body's reveal
   * nor an elapsed entrance timer releases that independent dialogue gate. */
  enter(boss, { distortion = this.distortionOptions, profile = this.profileName,
    auraScripts = profile === this.profileName ? this.auraScripts : null, auraView = this.auraView } = {}) {
    this.checkAlive();
    if (!boss || !Number.isFinite(boss.x) || !Number.isFinite(boss.y)) throw new TypeError('A Boss with finite original-space x/y is required');
    if (!TOUHOU_BOSS_PROFILES[profile]) throw new RangeError('Unknown original Boss presentation profile');
    const scripts = auraScripts ?? TOUHOU_BOSS_PROFILES[profile].auraScripts;
    const changed = profile !== this.profileName || scripts.length !== this.auraScripts.length || scripts.some((id, i) => id !== this.auraScripts[i]);
    this.profile = TOUHOU_BOSS_PROFILES[profile]; this.profileName = profile;
    this.auraScripts = scripts.slice(); this.auraView = auraView;
    if (this.boss !== boss || changed || distortion !== this.distortionOptions || !this.distortion) {
      this.distortionOptions = distortion;
      this.distortion = distortion === false ? null : new TouhouEnemyDistortion({
        radius: this.profile.radius, color: this.profile.color, ...distortion });
      this.distortionReady = false;
    }
    if (this.boss !== boss) {
      this.stopCombat();
      this.clearCharges();
      this.entrance?.destroy(); this.entrance = null;
    }
    if (this.boss !== boss || changed) {
      for (const vm of this.aura) vm.destroy();
      this.aura.length = 0; this.auraPending = true;
    }
    this.boss = boss; this.context.boss = boss; return this;
  }
  /** Stage-owned attack-start signal, equivalent to passing ECL519. Repeated
   * calls across nonspell/spell phases retain the same aura and warp clock.
   * Aura108 is constructed in update only, preserving the fog's RNG order. */
  startCombat() {
    this.checkAlive();
    if (!this.boss) throw new Error('Attach a Boss with enter before starting combat');
    this.combatActive = true; return this;
  }
  /** End combat presentation without awarding a capture or starting a death.
   * An explicitly started death keeps its own lifetime; stop is not pause. */
  stopCombat() {
    this.checkAlive();
    this.combatActive = false;
    for (const vm of this.aura) vm.destroy(); this.aura.length = 0;
    this.auraPending = !!this.boss;
    if (this.distortionReady) this.distortion = this.distortionOptions === false ? null : new TouhouEnemyDistortion({
      radius: this.profile.radius, color: this.profile.color, ...this.distortionOptions });
    this.distortionReady = false; return this;
  }
  clearCharges() { for (const charge of this.charges) charge.destroy(); this.charges.length = 0; return this; }
  /** Start once when the stage calls for an appearance. enter/update/phase
   * changes never summon fog implicitly; flyIn permits caller-owned movement. */
  beginEntrance(options = {}) {
    this.checkAlive();
    if (!this.boss) throw new Error('Attach a Boss with enter before beginning its entrance');
    this.stopCombat();
    this.entrance?.destroy();
    if ((options.mode ?? 'blackFog') === 'blackFog') {
      for (const vm of this.aura) vm.destroy();
      this.aura.length = 0; this.auraPending = true;
      this.distortionReady = false;
    }
    const entrance = new TouhouBossEntrance(this.banks.effect, { x: this.boss.x, y: this.boss.y,
      z: this.boss.z ?? 0, follow: this.boss, sound: this.context.sound, ...options });
    this.entrance = entrance;
    // User callbacks may cancel, destroy this presentation, or start another
    // entrance. Establish ownership before invoking them and never overwrite
    // their replacement when this outer beginEntrance returns.
    entrance.dispatchEvents(); return entrance;
  }
  get bossVisible() { return !this.entrance?.isHidden; }
  get bossEffectsVisible() { return this.combatActive && this.boss?.alive !== false && this.bossVisible &&
    (this.entrance?.mode !== 'blackFog' || this.entrance.age > this.entrance.revealFrame); }
  get entranceReady() { return this.entrance?.ready ?? true; }
  beginSpell(options = {}) {
    this.checkAlive();
    const boss = options.boss ?? this.boss;
    if (boss && boss !== this.boss) this.enter(boss);
    this.startCombat();
    return this.spell.begin({ ...options, boss }, this.context);
  }
  /** Reusable attack charge. Coordinates use x -192..192, y 0..448. */
  beginCharge(options = {}) {
    this.checkAlive();
    const charge = new TouhouBossCharge(this.banks.effect, { x: this.boss?.x ?? 0, y: this.boss?.y ?? 128,
      z: this.boss?.z ?? 0, ...options });
    this.charges.push(charge); return charge;
  }
  /** Explicit final Boss defeat only. A spell ending, clearBoss or an ordinary
   * enemy dying never triggers this. The roots survive the Boss body's removal. */
  beginDeath(options = {}) {
    this.checkAlive();
    for (const charge of this.charges) charge.stop();
    const death = new TouhouBossDeath(this.banks.effect, { x: this.boss?.x ?? 0, y: this.boss?.y ?? 128,
      z: this.boss?.z ?? 0, follow: this.boss, sound: this.context.sound, shake: this.context.shake, rng: this.visualRng,
      clock: () => this.frame, ...options });
    this.deaths.push(death); return death;
  }
  get hasDeathEffects() { return this.deaths.some(death => death.alive); }
  get cameraOffset() {
    for (let i = this.deaths.length - 1; i >= 0; i--) if (this.deaths[i].alive && this.deaths[i].cameraShake?.alive) return this.deaths[i].cameraOffset;
    return { x: 0, y: 0 };
  }
  /** Optional display synchronization for applications owning spell rules.
   * It changes no Boss health, bullets, score or phase progression. */
  setSpellState({ bonus, captureEligible, elapsedFrames, records } = {}) {
    if (bonus !== undefined) this.spell.bonus = bonus | 0;
    if (captureEligible !== undefined) this.spell.flags = captureEligible ? this.spell.flags | 2 : this.spell.flags & ~2;
    if (elapsedFrames !== undefined) {
      if (!Number.isInteger(elapsedFrames) || elapsedFrames < 0) throw new RangeError('Spell elapsedFrames must be a nonnegative integer');
      this.spell.age.set(elapsedFrames);
    }
    if (records !== undefined) this.spell.records = records;
    return this;
  }
  update(state = {}) {
    this.checkAlive(); if (state.paused) return this;
    if (state.boss !== undefined && state.boss !== this.boss) {
      if (state.boss) this.enter(state.boss); else this.clearBoss(false);
    }
    if (state.combatActive !== undefined && state.combatActive !== this.combatActive) {
      if (state.combatActive) this.startCombat(); else this.stopCombat();
    }
    if (state.player !== undefined) this.player = this.spell.player = state.player;
    this.entrance?.update();
    if (!this.alive) return this;
    this.context.player = this.player; this.context.boss = this.boss;
    if (state.timerRate !== undefined) this.context.timerRate = state.timerRate;
    if (this.manageSpell) this.spell.update(this.context);
    if (state.spellState) this.setSpellState(state.spellState);
    if (this.manageHud) this.hud.update({ ...state, bosses: (state.bosses ?? (this.boss ? [this.boss] : [])).filter(boss => boss !== this.boss || this.bossVisible),
      player: this.player ?? undefined, spell: this.spell,
      dialogue: state.dialogue || !this.combatActive,
      timerHidden: state.timerHidden || !this.bossVisible || !this.combatActive,
      remainingFrames: state.remainingFrames ?? (this.spell.active ? this.spell.remaining : -1),
      sound: state.sound ?? this.context.sound });
    if (this.distortion && this.boss && this.boss.alive !== false && this.bossEffectsVisible) {
      this.distortion.update(this.boss, state.clockScale ?? 1); this.distortionReady = true;
    }
    if (this.boss?.alive === false) this.stopCombat();
    if (this.boss && this.bossEffectsVisible) {
      if (this.auraPending) {
        // ECL303 uses front registration. Named spawn executes frame zero;
        // existing roots advance below only on later presentation updates.
        this.aura = this.auraScripts.map(script => this.banks.effect.create(script,
          { x: this.boss.x, y: this.boss.y, z: this.boss.z ?? 0, front: true }));
        this.auraPending = false;
      } else for (const vm of this.aura) {
        vm.x = this.boss.x; vm.y = this.boss.y; vm.z = this.boss.z ?? 0; vm.update();
      }
    }
    for (const charge of this.charges) charge.update();
    this.charges = this.charges.filter(charge => charge.alive);
    for (const death of this.deaths) death.update();
    this.deaths = this.deaths.filter(death => death.alive);
    this.frame++; return this;
  }
  /** Queue original ANM priorities together with the player's and enemies' ANM
   * for correct interleaving. A plain DrawList is also accepted for previews. */
  draw(draw, { view = this.view, screenView = this.screenView } = {}) {
    if (!this.alive) return draw;
    this.spell.draw(draw, view, screenView);
    this.drawEntrance(draw, view);
    this.drawAura(draw, this.auraView ?? view);
    this.drawCharge(draw, view);
    this.drawDeath(draw, view);
    this.hud.draw(draw, screenView); return draw;
  }
  /** Place caller-owned Boss artwork in the source body layer. Native ANM
   * actors should keep vm.draw(queue), which already has its registration.
   * st01enm..st06enm body0 selects layer7 (priority18); ECL303/306 prepend
   * the body, while converging-particle149/150 named spawns append. Order0
   * places an external body between registered front (-) and ordinary (+)
   * ANMs, before layer7 black mist and layer11 foreground mist. A callback
   * may submit frozen trails before its live body without moving either to
   * a later callback. Alternative body layers/order remain explicit options. */
  drawBody(draw, render, { view = this.view, layer = 7, order = 0 } = {}) {
    if (!this.alive || !this.boss || this.boss.alive === false || !this.bossVisible) return draw;
    if (typeof draw.enqueue === 'function') draw.enqueue(layer, target => render(target, view), { order });
    else render(draw, view);
    return draw;
  }
  drawAura(draw, view = this.auraView) {
    if (this.alive && this.bossEffectsVisible) for (const vm of this.aura) vm.draw(draw, view.projection ? view : createTouhouBossAuraView(view)); return draw;
  }
  drawEntrance(draw, view = this.view) {
    if (this.alive) this.entrance?.draw(draw, view); return draw;
  }
  drawCharge(draw, view = this.view) {
    if (this.alive) for (const charge of this.charges) charge.draw(draw, view); return draw;
  }
  drawDeath(draw, view = this.view) {
    if (this.alive) for (const death of this.deaths) death.draw(draw, view); return draw;
  }
  /** Draw after the unmodified background and before the normal gameplay ANM.
   * For a 960×720 target use the default scale 1.5. Transparent edge vertices
   * retain the source background; no full-screen sinusoidal shader is involved. */
  drawDistortion(draw, texture, { scale = 1.5, ...options } = {}) {
    if (!this.alive || !this.distortion || !this.distortionReady || this.boss?.alive === false || !this.bossEffectsVisible) return draw;
    draw.blendFactors('srcAlpha', 'oneMinusSrcAlpha', 'add', 'one', 'zero', 'add');
    draw.sampler(texture, 'bilinear', 'clamp', 'clamp');
    this.distortion.draw(draw, texture, { scale, ...options }); draw.blendEnd(); return draw;
  }
  finishSpell({ captured, timeout = false } = {}) {
    this.checkAlive();
    if (captured !== undefined) this.setSpellState({ captureEligible: captured });
    if (timeout) this.spell.flags |= 0x80;
    return this.spell.finish(this.context);
  }
  clearBoss(updateHud = true) {
    this.stopCombat();
    this.clearCharges();
    this.entrance?.destroy(); this.entrance = null;
    for (const vm of this.aura) vm.destroy(); this.aura.length = 0;
    this.auraPending = false;
    this.boss = null; this.context.boss = null; this.distortion = null; this.distortionReady = false;
    if (this.manageHud && updateHud) this.hud.update({ bosses: [], timerHidden: true });
    return this;
  }
  snapshot() {
    return { frame: this.frame, alive: this.alive, combatActive: this.combatActive, profile: this.profileName, spell: this.spell.snapshot(), hud: this.hud.snapshot(),
      distortion: this.distortion ? { columns: this.distortion.mesh.columns, rows: this.distortion.mesh.rows,
        radius: this.distortion.radius, currentRadius: this.distortion.currentRadius, color: this.distortion.color,
        phaseX: this.distortion.phaseX, phaseY: this.distortion.phaseY, ready: this.distortionReady } : null,
      auraScripts: this.aura.filter(vm => vm.alive).map(vm => vm.scriptId),
      charges: this.charges.map(charge => charge.snapshot()),
      deaths: this.deaths.map(death => death.snapshot()),
      entrance: this.entrance?.snapshot() ?? null,
      effectScripts: this.spell.effect?.children.filter(vm => vm.alive).map(vm => vm.scriptId) ?? [],
      openingScripts: this.spell.visuals.filter(vm => vm.alive).map(vm => vm.scriptId) };
  }
  destroy() {
    if (!this.alive) return;
    if (this.manageSpell) this.spell.destroy(); if (this.manageHud) this.hud.destroy();
    for (const vm of this.aura) vm.destroy(); this.aura.length = 0;
    this.auraPending = false; this.combatActive = false;
    for (const charge of this.charges) charge.destroy(); this.charges.length = 0;
    for (const death of this.deaths) death.destroy(); this.deaths.length = 0;
    this.entrance?.destroy(); this.entrance = null;
    this.boss = null; this.context.boss = null; this.distortion = null; this.alive = false;
  }
}
