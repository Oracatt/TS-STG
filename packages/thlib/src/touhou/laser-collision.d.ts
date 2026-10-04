import type {TouhouTimer} from './math.js';
import type {TouhouPlayer,TouhouPlayerContext} from './player.js';
import type {TouhouBulletStyle} from './bullet-patterns.js';
import type {TouhouLaserParameters,TouhouCurveNode} from './lasers.js';

export interface TouhouLaserCollisionSample {position:{x:number;y:number;z?:number};angle:number;speed:number;}
export interface TouhouLaserCollisionSegment {position:{x:number;y:number;z:number};angle:number;length:number;width:number;}
/** Original collision state, independent of ANM/rendering and movement ownership. */
export interface TouhouLaserCollisionState {
  kind:0|1|2;state:number;position:{x:number;y:number;z:number};angle:number;width:number;length:number;
  p:TouhouLaserParameters & {type:number;color:number;flags:number;count:number;length:number;lengthLimit:number};samples:TouhouLaserCollisionSample[]|null;
  style:Pick<TouhouBulletStyle,'cancelType'|'colors'>|null;activeMask:bigint;
  grazeTimer:TouhouTimer;touching:number;scale1:number;flashColor:number|null;
  speed:number;travel:number;protectedFrames:number;time:TouhouTimer;live:boolean;path:TouhouCurveNode[]|null;killPending:boolean;
}
export interface TouhouLaserCollisionOptions {
  kind?:0|1|2;state?:number;position?:{x:number;y:number;z?:number};angle?:number;
  /** Full rendered width before the source collision profile reduces it. */
  width?:number;length?:number;type?:number;color?:number;flags?:number;count?:number;
  samples?:TouhouLaserCollisionSample[]|null;style?:Pick<TouhouBulletStyle,'cancelType'|'colors'>|null;activeMask?:bigint;
  speed?:number;lengthLimit?:number;travel?:number;protectedFrames?:number;time?:number;
  /** Externally supplied sample histories default to live=true, preserving source live-curve cancellation. */
  live?:boolean;path?:TouhouCurveNode[]|null;parameters?:TouhouLaserParameters;
}
export type TouhouLaserCollisionPlayer=Pick<TouhouPlayer,'x'|'y'|'collisionRectangle'|'addGraze'>;
export interface TouhouLaserCollisionContext extends TouhouPlayerContext {
  onLaserGraze?:(laser:TouhouLaserCollisionState)=>void;
}
export interface TouhouLaserCollisionCallbacks {
  onHit?:(laser:TouhouLaserCollisionState,segment:TouhouLaserCollisionSegment)=>void;
  onGraze?:(laser:TouhouLaserCollisionState,position:{x:number;y:number;z:number},color:number)=>void;
  /** Forwarded to player collision; does not make source graze state immutable. */
  preview?:boolean;
}
export interface TouhouLaserCollisionResult {hitCount:number;grazed:boolean;grazeAwarded:boolean;flashColor:number|null;}
export function createTouhouLaserCollisionState(options?:TouhouLaserCollisionOptions):TouhouLaserCollisionState;
/** Type2 retains compute_segments' scale1 reset; use the query below when immutability is required. */
export function getTouhouLaserCollisionSegments(laser:TouhouLaserCollisionState):TouhouLaserCollisionSegment[];
/** Pure source-trimmed hit-geometry query; not a laser cancellation operation. */
export function touhouLaserIntersectsCircle(laser:TouhouLaserCollisionState,x:number,y:number,radius:number):boolean;
/** Advance one whole beam's collision/graze state, without movement or ANM dependencies. */
export function updateTouhouLaserCollision(laser:TouhouLaserCollisionState,player:TouhouLaserCollisionPlayer|null,
  context?:TouhouLaserCollisionContext,callbacks?:TouhouLaserCollisionCallbacks):TouhouLaserCollisionResult;
