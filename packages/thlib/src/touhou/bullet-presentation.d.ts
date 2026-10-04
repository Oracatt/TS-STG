import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance,AnmCreateOptions,AnmView} from './anm.js';
import type {touhouStyle} from './bullet-patterns.js';
export type TouhouResolvedBulletStyle=ReturnType<typeof touhouStyle>;
export const TouhouBulletBirth:Readonly<{INSTANT:null;FAST:0;NORMAL:1;SLOW:2}>;
export function configureTouhouBulletBirth(animation:AnmInstance,kind?:number|null):AnmInstance;
export function createTouhouBulletAnimation(bank:AnmBank,style:TouhouResolvedBulletStyle,position?:{x?:number;y?:number;z?:number},options?:AnmCreateOptions):AnmInstance;
export interface TouhouBulletFinishOptions {velocity?:{x?:number;y?:number;z?:number};clockScale?:number;cancelKind?:number;frozen?:boolean;}
export function createTouhouBulletCancelAnimation(bank:AnmBank,script:number,options?:TouhouBulletFinishOptions&{x?:number;y?:number;z?:number;drifting?:boolean}):AnmInstance|null;
export function drawTouhouBulletBody(draw:DrawList,animation:AnmInstance,view?:AnmView,drawGroup?:number):DrawList;
/** Visual lifecycle only. External collision/activation state is never changed. */
export class TouhouBulletPresentation {
  constructor(options:{bank:AnmBank;style:TouhouResolvedBulletStyle;x?:number;y?:number;z?:number;birthKind?:number|null});
  bank:AnmBank;style:TouhouResolvedBulletStyle;animation:AnmInstance;child:AnmInstance|null;
  x:number;y:number;z:number;birthKind:number|null;ending:boolean;phase:string;readonly alive:boolean;readonly ready:boolean;
  setStyle(style:TouhouResolvedBulletStyle):this;setPosition(position?:{x?:number;y?:number;z?:number}):this;update(position?:{x?:number;y?:number;z?:number}):this;
  finish(reason?:'retire'|'cancel'|'hit',options?:TouhouBulletFinishOptions):AnmInstance|null;
  draw(draw:DrawList,view?:AnmView,options?:{scale?:number;rotation?:number;alpha?:number;tint?:number[]|null}):DrawList;
  snapshot():{phase:string;birthKind:number|null;ready:boolean;alive:boolean;script:number;sprite:number;alpha:number;scaleX:number;scaleY:number};
  destroy():void;
}
