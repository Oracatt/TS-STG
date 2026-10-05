import { f32, add, mul, TouhouTimer } from './math.js';
import { TOUHOU_OWNER_PRIORITIES } from './render-order.js';

// Recovered card_system/{start,update,finish,timing,encoding,draw}.cpp and
// bomb_system/state.cpp. Boss attacks/portraits are supplied by the JS caller.
const bases = [500000, 1000000, 1500000, 2000000, 1000000];
const idiv = (a, b) => Math.trunc(a / b) | 0;
const iadd = (a, b) => (a + b) | 0;
const isub = (a, b) => (a - b) | 0;
const convertDouble = value => !Number.isFinite(value) || value < -2147483648 || value >= 2147483648 ? -2147483648 : Math.trunc(value) | 0;
export function encodeTouhouSpellTime(seconds, hundredths) {
  const s = iadd(seconds, 66) % 1000, h = iadd(hundredths, 33) % 100;
  return iadd(iadd(Math.imul(s, 100), h), Math.imul(iadd(iadd(seconds, 22), hundredths), 100000));
}
export function invalidTouhouSpellTime(value) {
  return idiv(value, 100000) - 22 !== ((idiv(value, 100) % 1000 + 934) % 1000) + ((value % 100 + 67) % 100);
}
export function quantizeTouhouSpellTime(elapsed) {
  const remainder = elapsed % .0167; elapsed -= remainder;
  if (remainder >= .0167 / 2) elapsed += .0167;
  const whole = Math.floor(elapsed), seconds = Math.min(convertDouble(whole), 999);
  const hundredths = convertDouble((elapsed - whole) * 100);
  return { seconds, hundredths, encoded: encodeTouhouSpellTime(seconds, hundredths) };
}
function interruptTree(vm, label) { if (!vm?.alive) return; vm.interrupt(label); for (const child of vm.children ?? []) interruptTree(child, label); }
function setDuration(vm, duration) { if (!vm) return; if (vm.scriptId === 4 || vm.scriptId === 5) vm.U(0x44c, duration); for (const child of vm.children ?? []) setDuration(child, duration); }
const record = (records, key) => records[key] ??= { name: '', captures: [0, 0], attempts: [0, 0] };
const increment = (entry, field, mode) => { if (entry[field][mode] < 99999) entry[field][mode]++; };

/** Common original spell owner. update never runs or selects a Boss attack script. */
export class TouhouSpell {
  constructor({ player, textBank = null, effectBank = null, font = null, context = {}, records = {},
    fallbackRecords = {}, difficulty = 1, stage = 1, mode = 0, viewIndex = 0, playback = false, presentation = {} } = {}) {
    this.player = player; this.textBank = textBank; this.effectBank = effectBank; this.font = font; this.context = context;
    this.records = records; this.fallbackRecords = fallbackRecords; this.difficulty = difficulty; this.stage = stage;
    this.mode = mode; this.viewIndex = viewIndex; this.playback = playback;
    this.flags = 0; this.age = new TouhouTimer(); this.frames = 0; this.lastFrames = 0;
    this.clockPaused = false; this.generation = 0;
    this.bonus = this.initialBonus = this.duration = 0; this.spellIndex = 0; this.name = '';
    this.position = { x: 0, y: 0, z: 0 }; this.info = []; this.retiredInfo = []; this.effect = null; this.visuals = [];
    this.background = null; this.captureIndex = 0; this.startTime = 0; this.encodedTime = 0; this.result = null;
    this.presentation = { screenView: { x: 0, y: 0, scale: 1, screenScale: 1.5 }, font: 2, y: 37,
      bonusX: 266, failedBonusX: 282, recordX: 360, ...presentation };
  }
  get active() { return !!(this.flags & 1); }
  get captureEligible() { return !!(this.flags & 2); }
  get survival() { return !!(this.flags & 8); }
  get suppressesBombDamage() { return (this.flags & 0x21) === 0x21; }
  get remaining() { return isub(this.duration, this.age.current); }
  begin({ id = 0, name = '', duration = 3600, survival = false, reversed = false, keepStageBackground = true,
    boss = null, background = null, portrait = null } = {}, context = this.context) {
    if (!Number.isInteger(this.difficulty) || this.difficulty < 0 || this.difficulty > 4) throw new RangeError('Original spell difficulty must be 0–4');
    if (this.active) throw new Error('Finish the current spell before beginning another');
    this.generation++; this.clockPaused = false;
    this.age.set(0); this.spellIndex = id; this.name = String(name); this.result = null;
    this.flags = ((this.flags | 3 | 0x200) & ~0x98) >>> 0;
    this.flags = (this.flags & ~0x100) | (reversed ? 0x100 : 0);
    if (survival) this.flags |= 8;
    if (!keepStageBackground) this.flags &= ~0x200;
    const mode = this.mode === 2 ? 1 : 0;
    if (!this.playback) for (const records of [this.records, this.fallbackRecords]) {
      const entry = record(records, id); entry.name = this.name; increment(entry, 'attempts', mode);
    }
    context.hudNumberInterrupt?.(2); this.flags &= ~0x20;
    if (this.player?.bomb?.alive) this.flags |= 0x20;
    this.frames = 1; this.flags &= ~0x40;
    // card_system/start.cpp registers all three at layer32 in this order.
    // Cross-bank registration order controls the name/plate overlap; the name
    // factory may cache bitmap pixels but must create a fresh animation VM.
    const nameBackground = this.textBank?.create(0) ?? null;
    const title = context.createNameAnimation?.(this.name, { script: this.viewIndex + 22, interrupt: 4, color: 0xffffff, shadowColor: 0xff000000 }) ?? null;
    // A following card may start before the previous title's exit completes.
    // Original animations remain registered independently until they self-delete.
    for (const vm of this.info) if (vm?.alive) this.retiredInfo.push(vm);
    this.info = [nameBackground, title, this.textBank?.create(1) ?? null];
    context.sound?.(33, 0);
    this.position = { x: f32(boss?.x ?? 0), y: f32(boss?.y ?? 0), z: f32(boss?.z ?? 0) };
    this.effect = this.effectBank?.create(6, this.position) ?? null; setDuration(this.effect, duration);
    this.duration = duration | 0;
    this.bonus = Math.imul(Math.max(0, Math.min(999, this.stage | 0)), bases[this.difficulty]);
    this.initialBonus = Math.min(this.bonus, 999999999);
    const visual = this.effectBank?.create(13); if (visual) this.visuals.push(visual);
    this.background = background; if (portrait) this.visuals.push(portrait);
    context.onEvent?.('spellStart', { spell: this }); return this;
  }
  /** Same notification as original Bomb start, player hit/miss, and ordinary timeout. */
  fail(reason = 'hit', context = this.context) {
    if (!this.active) return false;
    if (this.age.current >= 60) { this.bonus = 0; this.flags &= ~34; context.onEvent?.('spellFailed', { spell: this, reason }); return true; }
    if (this.player?.bomb?.alive) this.flags |= 32;
    return false;
  }
  notifyBombStart(context = this.context) { return this.fail('bomb', context); }
  notifyPlayerHit(context = this.context) { return this.fail('hit', context); }
  notifyPlayerMiss(context = this.context) { return this.fail('miss', context); }
  scaleDamage(amount) { return this.suppressesBombDamage ? idiv(amount, 30) : amount | 0; }
  advanceClock(context) {
    this.frames = (this.frames + 1) >>> 0;
    if (this.age.current >= 60 && !(this.flags & 0x200)) context.setStageVisible?.(false);
    if (this.age.current >= 300 && !(this.flags & 8)) {
      const numerator = isub(this.initialBonus, idiv(this.initialBonus, 3)), denominator = isub(this.duration, 300);
      if (!denominator || (numerator === -2147483648 && denominator === -1)) throw new RangeError('Original spell bonus integer division trap');
      this.bonus = isub(this.bonus, idiv(numerator, denominator)); this.bonus = isub(this.bonus, this.bonus % 10);
    }
    this.age.tick(context.timerRate ?? 1);
  }
  update(context = this.context) {
    if (this.active) {
      if (!this.clockPaused) this.advanceClock(context);
      if (this.age.current >= 120) {
        const y = this.player?.y ?? 0, reversed = !!(this.flags & 0x100);
        if (this.flags & 4) {
          if ((!reversed && y > 128) || (reversed && y < 320)) { for (const vm of this.info) interruptTree(vm, 2); this.flags &= ~4; }
        } else if ((!reversed && y < 96) || (reversed && y > 352)) { for (const vm of this.info) interruptTree(vm, 3); this.flags |= 4; }
      }
      const boss = context.boss;
      if (boss) for (const coordinate of ['x', 'y', 'z']) this.position[coordinate] = add(this.position[coordinate], mul(add(boss[coordinate] ?? 0, -this.position[coordinate]), .05));
      if (this.effect) { this.effect.x = this.position.x; this.effect.y = this.position.y; this.effect.z = this.position.z; }
      if ((this.flags & 0x20) && !this.player?.bomb?.alive) this.flags &= ~0x20;
    }
    for (const vm of [...this.retiredInfo, ...this.info, this.effect, this.background, ...this.visuals]) if (vm?.alive) vm.update();
    this.retiredInfo = this.retiredInfo.filter(vm => vm.alive);
    this.visuals = this.visuals.filter(vm => vm.alive); return this;
  }
  capture(context = this.context) { return this.finish(context); }
  timeout(context = this.context) {
    if (!this.active) return null;
    if (!this.survival) { this.flags |= 0x80; this.fail('timeout', context); }
    return this.finish(context);
  }
  finish(context = this.context) {
    if (!this.active) return null;
    context.setStageVisible?.(true); for (const vm of this.info) interruptTree(vm, 1);
    this.flags &= ~1; this.background?.destroy(); this.background = null; this.flags &= ~0x20;
    context.hudNumberInterrupt?.(3); this.effect?.destroy(); this.effect = null;
    const captured = this.captureEligible;
    if (!captured) context.hudNotice?.(1, 0);
    else {
      if (context.addScore) context.addScore(this.bonus, this);
      else if (this.player) this.player.score = Math.min(999999999, (this.player.score ?? 0) + Math.trunc((this.bonus >>> 0) / 10));
      context.hudNotice?.(0, this.bonus);
      if (!this.playback) for (const records of [this.records, this.fallbackRecords]) increment(record(records, this.spellIndex), 'captures', this.mode === 2 ? 1 : 0);
      context.sound?.(46, 0);
    }
    if (this.flags & 0x80) context.sound?.(69, 0);
    this.result = { id: this.spellIndex, name: this.name, captured, bonus: captured ? this.bonus : 0,
      frames: this.frames, timeout: !!(this.flags & 0x80) };
    context.onEvent?.('spellFinish', this.result); return this.result;
  }
  /** Supply platform clock seconds explicitly; replay adapter stores/loads the original encoded value. */
  postFrame(nowSeconds, context = this.context) {
    if (!Number.isFinite(nowSeconds)) throw new TypeError('Spell postFrame requires a finite platform clock in seconds');
    if (this.active) { if (!(this.flags & 0x40)) { this.startTime = nowSeconds; this.flags |= 0x40; } return null; }
    if (!(this.flags & 0x40)) return null;
    this.lastFrames = this.frames; this.encodedTime = quantizeTouhouSpellTime(nowSeconds - this.startTime).encoded;
    this.flags &= ~0x40;
    if (this.playback) {
      if (!context.readSpellTime) throw new Error('Playback requires readSpellTime(stage, captureIndex)');
      this.encodedTime = context.readSpellTime(this.stage, this.captureIndex) | 0;
      if (invalidTouhouSpellTime(this.encodedTime)) this.encodedTime = encodeTouhouSpellTime(999, 99);
    } else context.writeSpellTime?.(this.stage, this.captureIndex, this.encodedTime);
    this.captureIndex = (this.captureIndex + 1) >>> 0; return this.encodedTime;
  }
  draw(draw, view = { x: 336, y: 24, scale: 1.5, screenScale: 1 }, screenView = this.presentation.screenView) {
    this.background?.draw(draw, view); this.effect?.draw(draw, view);
    for (const visual of this.visuals) visual.draw(draw, view);
    // dispatch.cpp layer32 selects viewport5; quad submission then adds its
    // center/top origin (viewports.cpp: 224,16 source units). These info ANMs
    // have no preset-offset flag. Layer30 countdown and card_system/draw.cpp
    // numeric text use the full-screen viewport and must not inherit it.
    const infoOffset = screenView.screenOffsets?.[1] ?? { x: 224 * (screenView.screenScale ?? 1.5), y: 16 * (screenView.screenScale ?? 1.5) };
    const infoView = this.presentation.infoView ?? { ...screenView,
      x: (screenView.x ?? 0) + infoOffset.x * (screenView.scale ?? 1),
      y: (screenView.y ?? 0) + infoOffset.y * (screenView.scale ?? 1) };
    for (const vm of [...this.retiredInfo, ...this.info]) vm?.draw(draw, infoView);
    if (!this.active || !this.font || !this.info[2]?.alive) return draw;
    const alpha = this.info[2].alpha, color = ((alpha << 24) | 0xffffff) >>> 0;
    const baseScale = this.font.screenScale ?? 1.5;
    const scale = (screenView.scale ?? 1) * (screenView.screenScale ?? baseScale) / baseScale;
    const write = (text, x) => this.font.draw(draw, text, { x: x * scale + (screenView.x ?? 0) / baseScale,
      y: this.presentation.y * scale + (screenView.y ?? 0) / baseScale, scaleX: scale, scaleY: scale, font: this.presentation.font, alignX: 1, color, drawPriority:TOUHOU_OWNER_PRIORITIES.spellText });
    write(this.captureEligible ? String(this.bonus).padStart(8, ' ') : '$', this.captureEligible ? this.presentation.bonusX : this.presentation.failedBonusX);
    const entry = record(this.records, this.spellIndex), mode = this.mode === 2 ? 1 : 0;
    const captures = entry.captures[mode], attempts = entry.attempts[mode];
    write(captures >= 100 ? 'MASTER' : `${String(captures).padStart(2, '0')}/${attempts >= 100 ? '99+' : String(attempts).padStart(2, '0')}`, this.presentation.recordX);
    return draw;
  }
  destroy() { for (const vm of [...this.retiredInfo, ...this.info, this.effect, this.background, ...this.visuals]) vm?.destroy(); this.retiredInfo.length = 0; this.flags &= ~1; }
  snapshot() { return { flags: this.flags, age: this.age.current, frames: this.frames, bonus: this.bonus,
    initialBonus: this.initialBonus, duration: this.duration, spellIndex: this.spellIndex, captureIndex: this.captureIndex,
    position: { ...this.position }, encodedTime: this.encodedTime, result: this.result }; }
}
