import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance,AnmCreateOptions} from './anm.js';
import type {TouhouBulletCommand} from './bullets.js';
import type {TouhouLaserCollisionState,TouhouLaserCollisionSegment} from './laser-collision.js';
/** Original laser origin ANM 58..73. Owner draws it at priority 39. */
export function createTouhouLaserOrigin(bank:AnmBank,color?:number,options?:AnmCreateOptions):AnmInstance;
export interface TouhouCurveSample {position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};angle:number;speed:number;actor?:unknown;}
export interface TouhouCurveNode {kind:0|1|2;begin:number;end:number;position:{x:number;y:number;z:number};direction?:{x:number;y:number;z:number};angle:number;speed:number;acceleration:number;angularAcceleration:number;}
export function touhouCurveSample(nodes:TouhouCurveNode[],time:number,previous?:TouhouCurveSample,backwards?:boolean,fallback?:TouhouCurveSample):TouhouCurveSample;
export interface TouhouLaserParameters {x?:number;y?:number;z?:number;type?:number;color?:number;angle?:number;width?:number;speed?:number;length?:number;initialLength?:number;lengthLimit?:number;radialOffset?:number;growthSpeed?:number;angularVelocity?:number;velocity?:{x:number;y:number;z?:number};delay?:number;grow?:number;sustain?:number;shrink?:number;count?:number;time?:number;live?:boolean;flags?:number;sound?:number;motionSound?:number;commands?:TouhouBulletCommand[];commandIndex?:number;path?:TouhouCurveNode[];}
export interface TouhouLaser extends TouhouLaserCollisionState {id:number;alive:boolean;driven?:boolean;autoBounds?:boolean;collisionEnabled?:boolean;travel:number;speed:number;protectedFrames:number;animation:AnmInstance|null;origin:AnmInstance|null;tip:AnmInstance|null;samples:TouhouCurveSample[]|null;path:TouhouCurveNode[]|null;}
export class TouhouLaserField {
 /** With bank:null, identical movement/collision/cancellation run without animations or drawing. */
 constructor(options:{bank?:AnmBank|null;styles:unknown[]});readonly count:number;lasers:TouhouLaser[];effects:AnmInstance[];cancelCounter:number;
 spawnStraight(parameters?:TouhouLaserParameters):TouhouLaser|null;spawnInfinite(parameters?:TouhouLaserParameters):TouhouLaser|null;spawnCurve(parameters?:TouhouLaserParameters):TouhouLaser|null;
 /** Caller updates geometry; source field retains collisions, ANM, cancellation and detached debris.
  * Curve-only autoBounds defaults to false. When true, source grace and the complete history
  * control expiry; an out-of-bounds head alone never retires a still-visible tail. */
 spawnDriven(kind:0|1|2,parameters?:TouhouLaserParameters & {state?:number;autoBounds?:boolean}):TouhouLaser|null;
 /** Adopt newest-first live history, retaining sample actor references. Missing history uses
  * the birth position/angle/speed and zero velocity. Preserves the original sample capacity
  * and any source cancellation reduction; it never grows a severed tail back. */
 updateDrivenCurve(laser:TouhouLaser,samples:readonly TouhouCurveSample[]):TouhouLaser;
 setPosition(laser:TouhouLaser,x:number,y:number,z?:number):void;retire(laser:TouhouLaser):void;
 update(player?:unknown,context?:Record<string,unknown>):this;draw(draw:DrawList,view?:{x:number;y:number;scale:number}):DrawList;
 segments(laser:TouhouLaser):TouhouLaserCollisionSegment[];collision(laser:TouhouLaser,preview?:boolean):void;
 /** Spawn the original common cancellation ANM for externally owned laser state. */
 effect(laser:TouhouLaserCollisionState,position:{x:number;y:number;z?:number},circle?:boolean):void;
 cancelCircle(x:number,y:number,radius:number,options?:{check?:boolean}):number;
 cancelRectangle(x:number,y:number,width:number,height:number,angle?:number,options?:{check?:boolean}):number;
 erase(laser:TouhouLaser,options?:{check?:boolean}):number;snapshot():unknown;
}
