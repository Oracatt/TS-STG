import type {AnmDrawList as DrawList} from './anm.js';

export interface TouhouStageTransitionOptions {
  coverFrames?: number; revealFrames?: number;
  /** Reset transient entities, preserve player/session data and start the next track. */
  onCovered?: ((transition: TouhouStageTransition) => void) | null;
  onComplete?: ((transition: TouhouStageTransition) => void) | null;
}

import { mul, div, sub, trunc32 } from './math.js';

/** Gameplay activation keeps the outgoing background while a mode2 black
 * overlay rises for30 frames. At coverage the next stage activates; mode3
 * reveals its background for30 frames. Both draw at scheduler priority10. */
export const TOUHOU_STAGE_TRANSITION_PRESET: Readonly<{ coverFrames: 30; revealFrames: 30; drawPriority: 10 }> = Object.freeze({ coverFrames: 30, revealFrames: 30, drawPriority: 10 });
const viewport = Object.freeze({ x: 0, y: 0, width: 960, height: 720 });

export class TouhouStageTransition {
  declare phase: 'cover' | 'reveal' | 'done';
  declare age: number;
  declare frame: number;
  declare alive: boolean;
  declare covered: boolean;
  declare completed: boolean;
  declare coverFrames: number;
  declare revealFrames: number;
  declare onCovered: TouhouStageTransitionOptions['onCovered'];
  declare onComplete: TouhouStageTransitionOptions['onComplete'];

  constructor({ coverFrames = 30, revealFrames = 30, onCovered = null, onComplete = null }: TouhouStageTransitionOptions = {} as TouhouStageTransitionOptions) {
    if (![coverFrames, revealFrames].every(value => Number.isSafeInteger(value) && value > 0))
      throw new RangeError('Stage transition durations must be positive integer frames');
    for (const value of [onCovered, onComplete]) if (value !== null && typeof value !== 'function')
      throw new TypeError('Stage transition callbacks must be functions or null');
    Object.assign(this, { coverFrames, revealFrames, onCovered, onComplete });
    this.phase = 'cover'; this.age = 0; this.frame = 0; this.alive = true; this.covered = false; this.completed = false;
  }
  get alpha(): number {
    if (!this.alive) return 0;
    return this.phase === 'cover' ? Math.min(255, trunc32(div(mul(this.age, 255), this.coverFrames))) :
      Math.max(0, trunc32(sub(255, div(mul(this.age, 255), this.revealFrames))));
  }
  update(): this {
    if (!this.alive) return this;
    this.age++; this.frame++;
    if (this.phase === 'cover' && this.age >= this.coverFrames) {
      this.phase = 'reveal'; this.age = 0; this.covered = true;
      this.onCovered?.(this);
    } else if (this.phase === 'reveal' && this.age >= this.revealFrames) {
      this.phase = 'done'; this.alive = false; this.completed = true;
      this.onComplete?.(this);
    }
    return this;
  }
  /** Draw through TouhouRenderQueue before player/enemy/HUD owners. A direct
   * DrawList caller must place this inside its background pass, not last. */
  draw(draw: DrawList, rectangle: { x: number; y: number; width: number; height: number } = viewport): DrawList {
    if (!this.alive) return draw;
    if (draw.enqueuePriority) { draw.enqueuePriority(TOUHOU_STAGE_TRANSITION_PRESET.drawPriority, (target) => this.draw(target, rectangle)); return draw; }
    draw.alphaTest(0).blendFactors('srcAlpha', 'oneMinusSrcAlpha', 'add', 'one', 'zero', 'add');
    draw.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height, this.alpha).blendEnd();
    return draw;
  }
  destroy(): void { this.alive = false; }
  snapshot(): { phase: 'cover' | 'reveal' | 'done'; age: number; frame: number; alpha: number; alive: boolean;
    covered: boolean; completed: boolean; coverFrames: number; revealFrames: number } {
    return { phase: this.phase, frame: this.frame, age: this.age, alpha: this.alpha, alive: this.alive,
      covered: this.covered, completed: this.completed, coverFrames: this.coverFrames, revealFrames: this.revealFrames };
  }
}
