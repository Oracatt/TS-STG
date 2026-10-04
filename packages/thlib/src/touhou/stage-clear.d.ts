import type { DrawList, Input } from '../index.js';
import type { AnmBank, AnmInstance, AnmView } from './anm.js';
import type { TouhouBitmapFont } from './font.js';
export const TOUHOU_STAGE_CLEAR_PRESET: Readonly<{
  panelScript: 111; minFrames: 120; autoFrames: 300; exitFrames: 10; musicFadeSeconds: 2;
}>;
export interface TouhouStageClearOptions {
  /** Omit the bank for deterministic headless stage flow. */
  bank?: AnmBank | null; font?: TouhouBitmapFont | null;
  /** Displayed points supplied by the game, without a game-specific formula. */
  bonus?: number; rows?: Array<{ label: string; value: string | number }>;
  minFrames?: number; autoFrames?: number; exitFrames?: number; initialMask?: number;
  onAward?: ((bonus: number, owner: TouhouStageClear) => void) | null;
  /** Begin the source2-second BGM fade here. No track is owned by thlib. */
  onDismiss?: ((owner: TouhouStageClear) => void) | null;
  /** Hide the player, preserve persistent state and begin the background transition. */
  onComplete?: ((owner: TouhouStageClear) => void) | null;
  drawSummary?: ((draw: DrawList, owner: TouhouStageClear, view: AnmView) => void) | null;
}
export class TouhouStageClear {
  constructor(options?: TouhouStageClearOptions);
  bank: AnmBank | null; font: TouhouBitmapFont | null; panel: AnmInstance | null; buttons: Input;
  bonus: number; rows: Array<{ label: string; value: string | number }>;
  age: number; exitAge: number; phase: 'display' | 'exit' | 'done'; alive: boolean; completed: boolean;
  minFrames: number; autoFrames: number; exitFrames: number;
  onAward: TouhouStageClearOptions['onAward']; onDismiss: TouhouStageClearOptions['onDismiss'];
  onComplete: TouhouStageClearOptions['onComplete']; drawSummary: TouhouStageClearOptions['drawSummary'];
  update(mask?: number): this; dismiss(): this; finish(): this;
  draw(draw: DrawList, view?: AnmView): DrawList; destroy(): void;
  snapshot(): { phase: 'display' | 'exit' | 'done'; age: number; exitAge: number; alive: boolean; completed: boolean;
    bonus: number; minFrames: number; autoFrames: number; exitFrames: number };
}
