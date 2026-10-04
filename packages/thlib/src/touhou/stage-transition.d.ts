import type { DrawList } from '../index.js';
export const TOUHOU_STAGE_TRANSITION_PRESET: Readonly<{ coverFrames: 30; revealFrames: 30; drawPriority: 10 }>;
export interface TouhouStageTransitionOptions {
  coverFrames?: number; revealFrames?: number;
  /** Reset transient entities, preserve player/session data and start the next track. */
  onCovered?: ((transition: TouhouStageTransition) => void) | null;
  onComplete?: ((transition: TouhouStageTransition) => void) | null;
}
/** Background-only fade, distinct from the title's four-panel scene transition. */
export class TouhouStageTransition {
  constructor(options?: TouhouStageTransitionOptions);
  phase: 'cover' | 'reveal' | 'done'; age: number; frame: number; alive: boolean; covered: boolean; completed: boolean;
  readonly alpha: number; coverFrames: number; revealFrames: number;
  onCovered: TouhouStageTransitionOptions['onCovered']; onComplete: TouhouStageTransitionOptions['onComplete'];
  update(): this; draw(draw: DrawList, rectangle?: { x: number; y: number; width: number; height: number }): DrawList;
  destroy(): void;
  snapshot(): { phase: 'cover' | 'reveal' | 'done'; age: number; frame: number; alpha: number; alive: boolean;
    covered: boolean; completed: boolean; coverFrames: number; revealFrames: number };
}
