import { PI, add, mul, polar, wrapAngle, TouhouTimer, TouhouRNG } from './math.js';
import { argbToRgba } from './distortion.js';
import { TOUHOU_OWNER_PRIORITIES } from './render-order.js';

/** The original effect type4: ShortLine<20>, using visual random stream1. */
export class TouhouShortLine {
  constructor({ x = 0, y = 0, color = 0xff000000, rng = new TouhouRNG(1) } = {}) {
    this.x = x; this.y = y; this.rng = rng; this.positions = Array.from({ length: 20 }, () => ({ x: 0, y: 0 }));
    this.angle = mul(rng.signed(), PI); this.age = new TouhouTimer(1); this.alive = true;
    this.colors = Array.from({ length: 20 }, (_, i) => i < 10 ? color >>> 0 : ((color & 0xffffff) | ((255 - (i - 10) * 24) << 24)) >>> 0);
  }
  update(timerRate = 1) {
    if (!this.alive) return;
    if (this.age.current >= 20) { this.alive = false; return; }
    if (this.age.current !== this.age.previous) {
      const current = this.age.current; if (current < 0) throw new RangeError('Original short-line negative sample index');
      for (let i = 0; i < current; i++) { const alpha = this.colors[i] >>> 24; this.colors[i] = ((this.colors[i] & 0xffffff) | (Math.max(0, alpha - 16) << 24)) >>> 0; }
      const length = add(mul(this.rng.unit(), 8), 1), step = polar(this.angle, length);
      this.positions[current] = { x: add(step.x, this.positions[current - 1].x), y: add(step.y, this.positions[current - 1].y) };
      this.angle = wrapAngle(add(this.angle, mul(this.rng.signed(), PI)));
    }
    this.age.tick(timerRate);
  }
  draw(draw, view = { x: 336, y: 24, scale: 1.5 }) {
    if (!this.alive || this.age.current <= 1) return;
    const scale = view.scale ?? 1;
    draw.lineStrip(this.positions.slice(0, Math.min(20, this.age.current)).map((p, i) =>
      [add(view.x ?? 0, mul(add(this.x, p.x), scale)), add(view.y ?? 0, mul(add(this.y, p.y), scale)), argbToRgba(this.colors[i])]));
  }
}

/** EffectInf delayed request order; update after bullet collisions (original priority41). */
export class TouhouGrazeEffects {
  constructor({ rng = new TouhouRNG(1) } = {}) { this.rng = rng; this.pending = []; this.lines = []; }
  enqueue(effect) { this.pending.push({ ...effect }); }
  update(context = {}) {
    for (const request of this.pending) {
      if (request.delay < 1) { this.lines.push(new TouhouShortLine({ ...request, rng: this.rng })); request.done = true; }
      else request.delay--;
    }
    this.pending = this.pending.filter(request => !request.done);
    for (const line of this.lines) line.update(context.timerRate ?? 1);
    this.lines = this.lines.filter(line => line.alive);
  }
  draw(draw, view) {
    if(draw.enqueuePriority){draw.enqueuePriority(TOUHOU_OWNER_PRIORITIES.graze,target=>this.draw(target,view));return;}
    for(const line of this.lines)line.draw(draw,view);
  }
  clear() { this.pending.length = this.lines.length = 0; }
}
