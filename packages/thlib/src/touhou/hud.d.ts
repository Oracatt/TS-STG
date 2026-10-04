import type { AnmBank } from './anm.js';
import type { TouhouSpell } from './spell.js';
import type { DrawList } from '../index.js';
import type { TouhouBitmapFont } from './font.js';
export interface TouhouHudState {lives?:number;bombs?:number;lifeFragments?:number;bombFragments?:number;power?:number;score?:number|bigint;highScore?:number|bigint;continues?:number;highScoreDigit?:number;}
export class TouhouHud {
 constructor(options:{bank:AnmBank;textBank?:AnmBank|null;font:TouhouBitmapFont;character?:number;difficulty?:number;lives?:number;bombs?:number;maximumLives?:number;maximumBombs?:number});
 /** Result and stock messages use independent original animation slots. Capture values are displayed points. */
 notice(type:number,value?:number,options?:{spell?:TouhouSpell|null}):boolean;
 readonly activeNotice:boolean;
 snapshot():{activeNotice:boolean;notices:Array<Record<string,unknown>>;scoreDigits:Array<Record<string,unknown>>;time:Record<string,unknown>|null};
 setLives(full:number,fragments?:number):void;setBombs(full:number,fragments?:number):void;
 update(state?:TouhouHudState):void;draw(draw:DrawList,state?:TouhouHudState,options?:{hideNumbers?:boolean}):DrawList;destroy():void;
}
