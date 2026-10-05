import type {TouhouBulletParameters} from './bullets.js';
import type {TouhouLaserParameters} from './lasers.js';
import type {TouhouBossChargeColor,TouhouBossChargeOptions} from './boss-presentation.js';
import type {TouhouRandom} from './bullet-patterns.js';

export interface TouhouSpellCardEventBase {id:string;frame:number;enabled?:boolean;}
export interface TouhouSpellCardPosition {x:number;y:number;origin:'boss'|'world';}
export interface TouhouSpellCardBullet extends TouhouSpellCardEventBase,TouhouSpellCardPosition {
  type:'bullet';duration:number;interval:number;bulletType:number;color:number;pattern:number;
  count:number;rows:number;speed:number;speedStep:number;angle:number;angleStep:number;rotation:number;
}
export interface TouhouSpellCardLaser extends TouhouSpellCardEventBase,TouhouSpellCardPosition {
  type:'laser';duration:number;interval:number;kind:'straight'|'infinite';color:number;angle:number;rotation:number;
  speed:number;width:number;length:number;delay:number;grow:number;sustain:number;shrink:number;
}
export interface TouhouSpellCardMove extends TouhouSpellCardEventBase {
  type:'move';duration:number;x:number;y:number;easing:'linear'|'smooth';
}
export interface TouhouSpellCardCharge extends TouhouSpellCardEventBase,TouhouSpellCardPosition {
  type:'charge';color:TouhouBossChargeColor;releaseColor:TouhouBossChargeColor;releaseFrame:number;release:boolean;
  sound?:number|null;releaseSound?:number|null;
}
export interface TouhouSpellCardSound extends TouhouSpellCardEventBase {type:'sound';sound:number;}
export interface TouhouSpellCardClear extends TouhouSpellCardEventBase {type:'clear';}
export type TouhouSpellCardEvent=TouhouSpellCardBullet|TouhouSpellCardLaser|TouhouSpellCardMove|TouhouSpellCardCharge|TouhouSpellCardSound|TouhouSpellCardClear;
export interface TouhouSpellCardDocument {
  format:'ts-stg-spellcard';version:1;id:string;name:string;duration:number;hp:number;seed:number;
  boss:{x:number;y:number};events:TouhouSpellCardEvent[];
}
export interface TouhouSpellCardContext {
  boss:{x:number;y:number};player?:{x:number;y:number};
  bullets?:{emit(parameters:TouhouBulletParameters,options?:{random?:Pick<TouhouRandom,'unit'|'signedUnit'>}):unknown};
  lasers?:{spawnStraight(parameters:TouhouLaserParameters):unknown;spawnInfinite(parameters:TouhouLaserParameters):unknown};
  presentation?:{beginCharge(options:TouhouBossChargeOptions):{stop():unknown}};
  sound?:(id:number,x:number)=>void;clear?:()=>void;
  onComplete?:(timeline:TouhouSpellCardTimeline)=>void;
  /** Before each emission/move step/charge start or release/sound/clear action,
   * in document array order. Calling timeline.stop() cancels that action too. */
  onEvent?:(event:TouhouSpellCardEvent,frame:number)=>void;
}
/** Returns fresh, editable defaults; no resources or playback are created. */
export function createTouhouSpellCard():TouhouSpellCardDocument;
/** Strict whitelist validation, including event bounds/budgets. Returns an
 * independent normalized data object; failures identify their document path. */
export function validateTouhouSpellCard(document:unknown):TouhouSpellCardDocument;
export function parseTouhouSpellCard(jsonText:string):TouhouSpellCardDocument;
export function serializeTouhouSpellCard(document:unknown):string;
export class TouhouSpellCardTimeline {
  /** Does not teleport the existing Boss. Use document.boss when creating an
   * initial preview actor; authored move events start from its actual position. */
  constructor(document:unknown,context:TouhouSpellCardContext);
  readonly document:TouhouSpellCardDocument;readonly frame:number;readonly alive:boolean;readonly completed:boolean;
  /** First call executes frame 0, then increments frame. Natural completion
   * leaves due charge releases/animation tails to the presentation owner. */
  update():this;
  /** Cancels this timeline's future work and charge emitters only. */
  stop():void;
  snapshot():{frame:number;alive:boolean;completed:boolean;documentId:string};
}
