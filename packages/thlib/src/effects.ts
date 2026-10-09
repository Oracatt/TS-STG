import type { PrimitiveDraw } from './core-types.js';
import type { RNG } from './math.js';
import type { DrawList } from './render.js';
import type { World } from './world.js';
import type { EffectOptions } from './api-types.js';
import { Entity } from './world.js';

const alpha = (color: number, opacity: number) => ((color & 0xffffff00) | Math.round(Math.max(0, Math.min(1, opacity)) * (color & 255))) >>> 0;

/** A simulation-timed effect. Cosmetic randomness uses the world's seeded RNG. */
export class Effect extends Entity {

  declare duration: number;
  declare color: number;
  declare size: number;
  declare growth: number;
  declare text: string;
  declare style: string;

  constructor(options: EffectOptions = {}) {
    super({ group: 'effect', layer: 80, ...options });
    this.duration = options.duration ?? 30;
    this.color = options.color ?? 0x9eeaffff;
    this.size = options.size ?? 12;
    this.growth = options.growth ?? 1.2;
    this.text = options.text ?? '';
    this.style = options.style ?? 'ring';
  }
  update(): void {
    this.x += this.vx; this.y += this.vy;
    if (this.age >= this.duration) this.destroy('expired');
  }
  draw(draw: PrimitiveDraw): void {
    const t = Math.min(1, this.age / this.duration);
    const color = alpha(this.color, 1 - t);
    const r = Math.max(0.1, this.size + this.age * this.growth);
    if (this.style === 'text') draw.text(this.text, this.x, this.y, this.size, color);
    else if (this.style === 'spark') draw.circle(this.x, this.y, Math.max(0.1, r * (1 - t)), color);
    else draw.ring(this.x, this.y, Math.max(0, r - 2), r, color);
  }
}

export const Effects: {
  burst(world: World, x: number, y: number, color?: number, count?: number): void;
  text(world: World, x: number, y: number, text: string | number, color?: number): Effect;
} = {
  burst(world, x, y, color = 0x9eeaffff, count = 12) {
    world.spawn(new Effect({ x, y, color, size: 5, duration: 26, growth: 1.8 }));
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count;
      const speed = 1 + (i % 4) * 0.65;
      world.spawn(new Effect({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color, size: 3, duration: 20 + i % 10, growth: 0, style: 'spark' }));
    }
  },
  text(world, x, y, text, color = 0xffffffff) {
    return world.spawn(new Effect({ x, y, text: String(text), color, style: 'text', size: 16,
      vy: -0.5, duration: 65 }));
  },
};
