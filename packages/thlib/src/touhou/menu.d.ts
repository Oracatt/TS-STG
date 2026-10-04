import type { AnmBank,AnmInstance } from './anm.js';
import { RepeatingInput } from '../index.js';
import type { DrawList } from '../index.js';
import type { TouhouBitmapFont } from './font.js';
export interface TouhouMenuBackground {textureId:number|null;update():void;drawCapture?(draw:DrawList):void;draw(draw:DrawList):void;destroy?():void;}
export class TouhouButtons extends RepeatingInput {constructor();repeat8:number;repeat12:number;count8:Uint32Array;count12:Uint32Array;}
export const TOUHOU_MAIN_LABELS:readonly string[];
export function touhouMenuStyle(index:number,selected:number,options?:{excluded?:boolean;flash?:number;jitter?:number}):{color:number;shadowColor:number;offset:number};
export interface TouhouStartSelection {character:number;difficulty:number;mode:string;}
export class TouhouTitleMenu {
 constructor(options:{bank:AnmBank;decorationBank?:AnmBank;font:TouhouBitmapFont;background?:TouhouMenuBackground;labels?:readonly string[];excluded?:number[];difficulty?:number;character?:number;onSelect?:(index:number,menu:TouhouTitleMenu)=>void;onStart?:(selection:TouhouStartSelection)=>void;sound?:(id:number)=>void;scripts?:Record<number,number|false>;childScripts?:Record<number,number>;startModes?:Record<number,string>;quitIndex?:number;layout?:{font?:number;x?:number;y?:number;lineHeight?:number};disposeBanks?:boolean;disposeBackground?:boolean});
 state:string;phase:number;age:number;selection:number;difficulty:number;character:number;finished:boolean;buttons:TouhouButtons;
 update(mask:number):void;draw(draw:DrawList):DrawList;destroy():void;snapshot():{state:string;phase:number;age:number;selection:number;difficulty:number;character:number};
}
