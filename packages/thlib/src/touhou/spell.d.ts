import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPlayer,TouhouPlayerContext,TouhouView} from './player.js';
import type {TouhouTimer} from './math.js';
export function encodeTouhouSpellTime(seconds:number,hundredths:number):number;
export function invalidTouhouSpellTime(value:number):boolean;
export function quantizeTouhouSpellTime(elapsed:number):{seconds:number;hundredths:number;encoded:number};
export interface TouhouSpellRecord{name:string;captures:[number,number];attempts:[number,number];}
export interface TouhouSpellResult{id:number;name:string;captured:boolean;bonus:number;frames:number;timeout:boolean;}
export interface TouhouSpellContext extends TouhouPlayerContext{boss?:{x:number;y:number;z?:number};hudNumberInterrupt?:(label:number)=>void;hudNotice?:(type:number,value:number)=>void;setStageVisible?:(visible:boolean)=>void;addScore?:(nominalAmount:number,spell:TouhouSpell)=>void;
  /** Create a fresh animation for each call, preserving the source plate/title registration order. Bitmap pixels may be cached; do not return an already registered VM. */
  createNameAnimation?:(name:string,options:{script:number;interrupt:number;color:number;shadowColor:number})=>AnmInstance|null;readSpellTime?:(stage:number,index:number)=>number;writeSpellTime?:(stage:number,index:number,encoded:number)=>void;}
export interface TouhouSpellPresentation{screenView?:TouhouView;infoView?:TouhouView;font?:number;y?:number;bonusX?:number;failedBonusX?:number;recordX?:number;}
export class TouhouSpell{constructor(options?:{player?:TouhouPlayer;textBank?:AnmBank|null;effectBank?:AnmBank|null;font?:{draw(draw:DrawList,text:string,options:Record<string,unknown>):unknown}|null;context?:TouhouSpellContext;records?:Record<number,TouhouSpellRecord>;fallbackRecords?:Record<number,TouhouSpellRecord>;difficulty?:number;stage?:number;mode?:number;viewIndex?:number;playback?:boolean;presentation?:TouhouSpellPresentation});
  player:TouhouPlayer;flags:number;age:TouhouTimer;frames:number;lastFrames:number;bonus:number;initialBonus:number;duration:number;spellIndex:number;captureIndex:number;encodedTime:number;name:string;records:Record<number,TouhouSpellRecord>;position:{x:number;y:number;z:number};result:TouhouSpellResult|null;
  readonly active:boolean;readonly captureEligible:boolean;readonly survival:boolean;readonly suppressesBombDamage:boolean;readonly remaining:number;
  /** Pause simulation age/bonus without freezing presentation or settling the card. Reset by begin(). */
  clockPaused:boolean;readonly generation:number;
  begin(options?:{id?:number;name?:string;duration?:number;survival?:boolean;reversed?:boolean;keepStageBackground?:boolean;boss?:{x:number;y:number;z?:number}|null;background?:AnmInstance|null;portrait?:AnmInstance|null},context?:TouhouSpellContext):this;
  update(context?:TouhouSpellContext):this;draw(draw:DrawList,view?:TouhouView,screenView?:TouhouView):DrawList;fail(reason?:string,context?:TouhouSpellContext):boolean;
  notifyBombStart(context?:TouhouSpellContext):boolean;notifyPlayerHit(context?:TouhouSpellContext):boolean;notifyPlayerMiss(context?:TouhouSpellContext):boolean;
  scaleDamage(amount:number):number;capture(context?:TouhouSpellContext):TouhouSpellResult|null;timeout(context?:TouhouSpellContext):TouhouSpellResult|null;finish(context?:TouhouSpellContext):TouhouSpellResult|null;postFrame(nowSeconds:number,context?:TouhouSpellContext):number|null;destroy():void;snapshot():Record<string,unknown>;
}
