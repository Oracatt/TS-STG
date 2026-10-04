import type {DrawList} from '../index.js';
import type {AnmBank} from './anm.js';
import type {TouhouBitmapFont} from './font.js';
export interface TouhouStageEntry {label:string;disabled?:boolean;score?:number;[key:string]:unknown}
export interface TouhouStageSelectOptions {bank:AnmBank;font:TouhouBitmapFont;entries:TouhouStageEntry[];selection?:number;pageSize?:number;headingScript?:number|false;sound?:(id:number)=>void;onSelect?:(entry:TouhouStageEntry,index:number)=>void;
 /** Starts the source cover at confirmed selection age10; onSelect remains at age40. */
 onTransition?:(entry:TouhouStageEntry,index:number)=>void;
 onCancel?:()=>void;drawLabel?:(draw:DrawList,entry:TouhouStageEntry,options:{x:number;y:number;font:number;color:number;selected:boolean;index:number;alignX:1})=>void;x?:number;y?:number;lineHeight?:number;fontIndex?:number}
export class TouhouStageSelect {constructor(options:TouhouStageSelectOptions);selection:number;phase:number;age:number;active:boolean;move(delta:number):void;update(mask?:number):void;draw(draw:DrawList):DrawList;destroy():void;snapshot():{phase:number;age:number;selection:number;count:number;active:boolean}}
