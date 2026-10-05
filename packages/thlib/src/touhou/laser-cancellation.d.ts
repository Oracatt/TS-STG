import type {TouhouLaserCollisionState} from './laser-collision.js';
import type {TouhouLaserParameters} from './lasers.js';
import type {TouhouWorldOptions} from './world.js';

export interface TouhouLaserCancellationCallbacks extends TouhouWorldOptions {
  check?:boolean;clockScale?:number;
  onEffect?:(laser:TouhouLaserCollisionState,position:{x:number;y:number;z?:number},circle:boolean)=>void;
  onCancel?:(count:number,laser:TouhouLaserCollisionState)=>void;
  onSpawnStraight?:(parameters:TouhouLaserParameters)=>unknown;
  onSpawnCurve?:(parameters:TouhouLaserParameters)=>unknown;
}
/** Source16-unit/sample masks and actual retained-owner mutations/split parameters.
 * Circle uses width as radius; rectangle uses width/height at angle radians.
 * Consume split callbacks with a TouhouLaserField to own the source debris. */
export function cancelTouhouLaser(laser:TouhouLaserCollisionState,center:{x:number;y:number;z?:number},width:number,height:number,
  angle?:number,circle?:boolean,callbacks?:TouhouLaserCancellationCallbacks):number;
/** Erase with source effect spacing and state1, without third-party clear flags. */
export function eraseTouhouLaser(laser:TouhouLaserCollisionState,callbacks?:Pick<TouhouLaserCancellationCallbacks,'check'|'onEffect'|'world'|'bounds'>):number;
