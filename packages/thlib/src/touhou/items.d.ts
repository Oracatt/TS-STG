import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouPlayer,TouhouPlayerContext,TouhouView} from './player.js';
import type {TouhouTimer,TouhouRNG} from './math.js';
export const TouhouItemType:Readonly<{POWER:1;POINT:2;LARGE_POWER:3;LIFE_FRAGMENT:4;LIFE:5;BOMB_FRAGMENT:6;BOMB:7;FULL_POWER:8;COUNTED_POINT:15;
  /** @deprecated Source15 counts toward an ordinary POINT; it is not a small automatically collected cancellation reward. Use COUNTED_POINT. */
  CANCEL_POINT:15}>;
export type TouhouItemName='power'|'point'|'largePower'|'lifeFragment'|'life'|'bombFragment'|'bomb'|'fullPower'|'countedPoint'|'cancelPoint';
export interface TouhouItemOptions{type?:number|TouhouItemName;x?:number;y?:number;angle?:number;speed?:number;delay?:number;color?:number;extra?:number;sound?:number;state?:number;}
export interface TouhouEnemyDropOptions{
  /** Items are emitted in source type order, independently of object insertion order. */
  counts?:Partial<Record<number|TouhouItemName,number>>;
  /** ECL510's single item at the enemy's center, before the scattered counts. Zero omits it. */
  centerType?:number|TouhouItemName;
  /** ECL508 ellipse radii. Ordinary enemy default32; source BossItem selects64. */
  radius?:number|{x:number;y:number};
}
export interface TouhouBossDropOptions extends TouhouEnemyDropOptions{
  /** An ordinary timeout suppresses BossItem rewards; successful survival expiry does not. */
  timedOut?:boolean;survival?:boolean;
  /** Original session mode2 is spell practice and suppresses all BossItem rewards. Default0. */
  mode?:number;
}
export interface TouhouItem{id:number;type:number;state:number;x:number;y:number;vx:number;vy:number;attractionSpeed:number;delay:number;sound:number;extra:number;timer:TouhouTimer;drawState:number;animation:AnmInstance|null;secondaryAnimation:AnmInstance|null;}
export interface TouhouItemContext extends TouhouPlayerContext{bossCollecting?:boolean;hudNotice?:(type:number,value:number)=>void;addScore?:(nominalAmount:number,item:TouhouItem)=>void;floatingScore?:(entry:{x:number;y:number;amount:number;color:number;item:TouhouItem})=>void;}
export class TouhouItems{constructor(options:{player:TouhouPlayer;bank?:AnmBank|null;effectBank?:AnmBank|null;rng?:TouhouRNG|null;difficulty?:number;context?:TouhouItemContext});player:TouhouPlayer;items:TouhouItem[];speedScale:number;spawnCounter:number;pointCounter:number;cancelPointIncrement:number;difficulty:number;attract:boolean;attractionCenter:{x:number;y:number};processed:number;
  spawn(options?:TouhouItemOptions,context?:TouhouItemContext):TouhouItem|null;spawnMany(position:{x:number;y:number},count:number,type:number,context?:TouhouItemContext):TouhouItem[];
  /** Original ECL507–510 enemy reward scatter, with caller-authored counts and source movement/collection. */
  spawnEnemyDrops(position:{x:number;y:number},options?:TouhouEnemyDropOptions,context?:TouhouItemContext):TouhouItem[];
  /** Source BossItem eligibility and radius64 default; suppressed rewards consume no RNG. */
  spawnBossDrops(position:{x:number;y:number},options?:TouhouBossDropOptions,context?:TouhouItemContext):TouhouItem[];
  update(context?:TouhouItemContext):this;draw(draw:DrawList,view?:TouhouView):void;collect(item:TouhouItem,context?:TouhouItemContext):number;
  retire(item:TouhouItem):void;addBombs(amount:number,context?:TouhouItemContext):void;addBombFragments(amount:number,context?:TouhouItemContext):void;extendLife(context?:TouhouItemContext):void;addLifeFragments(amount:number,context?:TouhouItemContext):void;snapshot():Record<string,unknown>;
}
