import type { AnmBank,AnmInstance,AnmView } from './anm.js';
import type { TouhouSpell } from './spell.js';
import type { DrawList } from '../index.js';
import type { TouhouBitmapFont } from './font.js';
import type {TouhouPlayerRules} from './player-rules.js';
export {TOUHOU_HUD_LABEL_SCRIPTS} from './hud-label-data.js';
export interface TouhouHudState {lives?:number;bombs?:number;lifeFragments?:number;bombFragments?:number;power?:number;score?:number|bigint;highScore?:number|bigint;continues?:number;highScoreDigit?:number;pointValue?:number;graze?:number;replay?:boolean;}
export type TouhouHudRow='highScore'|'score'|'lives'|'bombs'|'power'|'pointValue'|'graze'|'replay';
export interface TouhouHudRowPosition{x:number;y:number;
 /** Maximum leftward advance of right-aligned bitmap numbers in 640x480 units. Overlong groups shrink uniformly; null disables fitting. */
 numberWidth?:number|null;
}
export type TouhouHudLayout=Readonly<Record<TouhouHudRow,Readonly<TouhouHudRowPosition>>>;
export type TouhouHudPaletteKey='highScore'|'score'|'stock'|'power'|'pointValue'|'graze';
export interface TouhouHudNumberColors{color:number;shadowColor:number|null;}
export type TouhouHudPalette=Readonly<Record<TouhouHudPaletteKey,Readonly<TouhouHudNumberColors>>>;
export const TOUHOU_HUD_LAYOUT:TouhouHudLayout;
export const TOUHOU_HUD_PALETTE:TouhouHudPalette;
export interface TouhouHudSkinContext{readonly view:Readonly<AnmView>;readonly state:TouhouHudState;readonly hud:TouhouHud;readonly layout:TouhouHudLayout;}
export interface TouhouHudSkin{
 /** Replaces only the original frame children; receives a plain DrawList in the library's background slot, before all status labels and numbers. */
 drawFrame?:(draw:DrawList,context:TouhouHudSkinContext)=>void;
 /** Drawn after the frame, before all status labels and numbers. Artwork, fitting and placement belong to the caller. */
 drawBranding?:(draw:DrawList,context:TouhouHudSkinContext)=>void;
}
export interface TouhouHudOptions{bank:AnmBank;textBank?:AnmBank|null;font:TouhouBitmapFont;character?:number|string;difficulty?:number|string;lives?:number;bombs?:number;maximumLives?:number;maximumBombs?:number;rules?:Partial<TouhouPlayerRules>;maxPower?:number;powerPerLevel?:number;lifeFragmentThreshold?:number;bombFragmentThreshold?:number;
 /** Character artwork is opt-in: 101/102 select the original Reimu/Marisa labels. Difficulty defaults to the original known-ID label; null omits either label. */
 characterScript?:number|null;difficultyScript?:number|null;
 skin?:TouhouHudSkin|null;
 /** Row origins in 640x480 screen units. Coordinates translate its label, underline, numbers and stock icons together. numberWidth only fits right-aligned numeric groups. */
 layout?:Partial<Record<TouhouHudRow,Partial<TouhouHudRowPosition>>>;
 /** RGB components use ARGB notation; alpha continues to follow the original stock animation. Null shadowColor disables the numeric shadow. */
 palette?:Partial<Record<TouhouHudPaletteKey,Partial<TouhouHudNumberColors>>>;
 /** Default visibility of Replay drawn with the original ASCII bitmap glyphs; state.replay overrides it. */
 replay?:boolean;
}
export class TouhouHud {
 constructor(options:TouhouHudOptions);maximumLives:number;maximumBombs:number;maxPower:number;powerPerLevel:number;lifeFragmentThreshold:number;bombFragmentThreshold:number;
 readonly roots:AnmInstance[];readonly lifeIcons:AnmInstance[];readonly bombIcons:AnmInstance[];
 readonly labels:Readonly<Record<'pointValue'|'graze',AnmInstance>>;
 readonly layout:TouhouHudLayout;readonly palette:TouhouHudPalette;skin:TouhouHudSkin|null;replay:boolean;
 /** Result and stock messages use independent original animation slots. Capture values are displayed points. */
 notice(type:number,value?:number,options?:{spell?:TouhouSpell|null}):boolean;
 readonly activeNotice:boolean;
 snapshot():{activeNotice:boolean;notices:Array<Record<string,unknown>>;scoreDigits:Array<Record<string,unknown>>;time:Record<string,unknown>|null};
 setLives(full:number,fragments?:number):void;setBombs(full:number,fragments?:number):void;
 update(state?:TouhouHudState):void;draw(draw:DrawList,state?:TouhouHudState,options?:{hideNumbers?:boolean}):DrawList;destroy():void;
}
