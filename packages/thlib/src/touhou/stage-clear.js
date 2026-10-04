import { Keys, Input } from '../input.js';

/** stage_clear/update.cpp: accept an edge after120 frames, auto-close at300,
 * fade music for2 seconds, and hand off the stage10 frames after dismissal. */
export const TOUHOU_STAGE_CLEAR_PRESET = Object.freeze({
  panelScript: 111, minFrames: 120, autoFrames: 300, exitFrames: 10, musicFadeSeconds: 2,
});
const defaultView = Object.freeze({ x: 336, y: 24, scale: 1, screenScale: 1.5 });
const number = value => typeof value === 'number' && Number.isFinite(value);
function callback(value, name) {
  if (value !== null && typeof value !== 'function') throw new TypeError(`${name} must be a function or null`);
}

/** Common stage-clear presentation. Stage-specific score formulae and summary
 * rows are injected; TH20's magic-stone scoring does not belong in this owner. */
export class TouhouStageClear {
  constructor({ bank = null, font = null, bonus = 0, rows = [],
    minFrames = 120, autoFrames = 300, exitFrames = 10, initialMask = 0,
    onAward = null, onDismiss = null, onComplete = null, drawSummary = null } = {}) {
    if (![minFrames, autoFrames, exitFrames].every(value => Number.isSafeInteger(value) && value >= 0) || autoFrames < minFrames)
      throw new RangeError('Stage-clear timing requires ordered nonnegative integer frames');
    if (!Number.isSafeInteger(bonus) || bonus < 0) throw new RangeError('Stage-clear bonus must be nonnegative integer points');
    if (bank !== null && typeof bank?.create !== 'function') throw new TypeError('Stage-clear bank must create source ANM instances');
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.label !== 'string' || !(typeof row.value === 'string' || number(row.value))))
      throw new TypeError('Stage-clear rows require labels and finite numeric or string values');
    for (const [name, value] of Object.entries({ onAward, onDismiss, onComplete, drawSummary })) callback(value, name);
    Object.assign(this, { bank, font, bonus, minFrames, autoFrames, exitFrames, onAward, onDismiss, onComplete, drawSummary });
    this.rows = rows.map(row => ({ ...row })); this.age = 0; this.exitAge = 0;
    this.phase = 'display'; this.alive = true; this.completed = false;
    this.buttons = new Input().update(initialMask);
    this.panel = bank?.create(TOUHOU_STAGE_CLEAR_PRESET.panelScript) ?? null;
    this.onAward?.(this.bonus, this);
  }
  update(mask = 0) {
    if (!this.alive) return this;
    this.buttons.update(mask);
    if (this.phase === 'display') {
      this.age++; this.panel?.update();
      if (this.age >= this.autoFrames || (this.age >= this.minFrames && this.buttons.pressed(Keys.SHOOT | Keys.CONFIRM))) this.dismiss();
    } else if (this.phase === 'exit') {
      this.exitAge++;
      if (this.exitAge >= this.exitFrames) this.finish();
    }
    return this;
  }
  /** Explicit application dismissal. update() implements the original input gate. */
  dismiss() {
    if (!this.alive || this.phase !== 'display') return this;
    this.phase = 'exit'; this.exitAge = 0; this.panel?.destroy();
    this.onDismiss?.(this);
    if (this.alive && this.exitFrames === 0) this.finish();
    return this;
  }
  finish() {
    if (!this.alive) return this;
    this.panel?.destroy(); this.phase = 'done'; this.alive = false; this.completed = true;
    this.onComplete?.(this); return this;
  }
  draw(draw, view = defaultView) {
    if (!this.alive || this.phase !== 'display') return draw;
    this.panel?.draw(draw, view);
    if (this.drawSummary) this.drawSummary(draw, this, view);
    else if (this.font) {
      const alpha = this.panel?.alpha ?? 255, color = ((alpha << 24) | 0xffffff) >>> 0;
      for (let i = 0; i < this.rows.length; i++) {
        const row = this.rows[i];
        this.font.draw(draw, `${row.label}  ${row.value}`, { font: 0, x: 224, y: 230 + i * 20, alignX: 0, color, drawPriority: 86 });
      }
      const value = String(this.bonus).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      this.font.draw(draw, `Clear Bonus  ${value}`, { font: 0, x: 224, y: 320, alignX: 0, color, drawPriority: 86 });
    }
    return draw;
  }
  destroy() { this.panel?.destroy(); this.alive = false; }
  snapshot() {
    return { phase: this.phase, age: this.age, exitAge: this.exitAge, alive: this.alive, completed: this.completed,
      bonus: this.bonus, minFrames: this.minFrames, autoFrames: this.autoFrames, exitFrames: this.exitFrames };
  }
}
