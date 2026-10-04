import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPauseCapture} from './pause-capture.js';
export interface TouhouPausePage {done?:boolean;update?(mask:number):void;draw?(draw:DrawList):void}
export interface TouhouPauseOptions {
 bank:AnmBank;sound?:(id:number)=>void;onResume?:()=>void;onExit?:()=>void;onRestart?:()=>void;
 onReplay?:(context:{pause:TouhouPause;close:()=>void})=>TouhouPausePage|void;
 onOptions?:TouhouPauseOptions['onReplay'];onManual?:TouhouPauseOptions['onReplay'];
 restart?:boolean;continues?:number;initialMask?:number;drawBackground?:(draw:DrawList,pause:TouhouPause)=>void;capture?:TouhouPauseCapture;
}
export class TouhouPause {
 constructor(options:TouhouPauseOptions);
 active:boolean;phase:number;age:number;selection:number;count:number;panelVisible:boolean;excluded:Set<number>;panel:AnmInstance;
 update(mask?:number,options?:{retryPressed?:boolean;exitPressed?:boolean}):void;
 draw(draw:DrawList):DrawList;destroy():void;resume():void;restoreMenu():void;
 snapshot():{active:boolean;phase:number;age:number;selection:number;count:number;excluded:number[];panelVisible:boolean};
}
