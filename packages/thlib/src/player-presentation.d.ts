import type { World, DrawList } from './core.js';
import type { Player } from './index.js';
import type { SpriteAtlas, SpritePackSprite } from './sprite-atlas.js';

export interface PlayerBodyView { x: number; y: number; scale: number; alpha: number; }
export interface PlayerView {
  scale?: number; offsetX?: number; offsetY?: number; alpha?: number;
  body?: (draw: DrawList, player: Player, view: PlayerBodyView) => void;
  groups?: ReadonlyArray<'playerShot' | 'item' | 'player' | 'bomb' | 'effect' | 'focus'> | ReadonlySet<string>;
}
/** Caller retains atlas ownership. View applies positive scale and translation in Y-down coordinates. */
export class PlayerPresentation {
  constructor(atlas: SpriteAtlas);
  atlas: SpriteAtlas; sprites: Map<string, Readonly<SpritePackSprite>>; usedSprites: Set<string>;
  snapshot(): { usedSprites: string[] };
  drawShots(draw: DrawList, world: World, view?: PlayerView): DrawList;
  /** Options and body only; call drawFocus after enemy bullets. */
  drawPlayer(draw: DrawList, player: Player, view?: PlayerView): DrawList;
  drawFocus(draw: DrawList, player: Player, view?: PlayerView): DrawList;
  drawBombs(draw: DrawList, world: World, view?: PlayerView): DrawList;
  drawEffects(draw: DrawList, world: World, view?: PlayerView): DrawList;
  drawItems(draw: DrawList, world: World, view?: PlayerView): DrawList;
  drawWorld(draw: DrawList, world: World, view?: PlayerView): DrawList;
}
