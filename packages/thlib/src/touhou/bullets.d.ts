import type { DrawList } from '../index.js';
import type { AnmBank, AnmInstance } from './anm.js';
export type TouhouBulletCommand = number[] | { type:number; floats?:number[]; ints?:number[]; concurrent?:boolean };
export function touhouBulletCommand(type:number, values?:{floats?:number[];ints?:number[];concurrent?:boolean}):number[];
export const SUPPORTED_TOUHOU_BULLET_COMMANDS:readonly number[];
export interface TouhouBullet { id:number;slot:number;state:number;type:number;color:number;x:number;y:number;z:number;vx:number;vy:number;vz:number;angle:number;speed:number;scale:number;scaleEnabled:boolean;radius:number;group:number;protectedFrames:number;frozen:boolean;grazesLeft:number;cancelScript:number;activeMask:bigint;commandIndex:number;animation:AnmInstance; }
export interface TouhouBulletParameters { x?:number;y?:number;type?:number;color?:number;pattern?:number;count?:number;rows?:number;speed?:number;speedStep?:number;angle?:number;angleStep?:number;playerAngle?:number;spawnRadius?:number;commands?:TouhouBulletCommand[];commandIndex?:number;commandSound?:number;shotSound?:number;previewOnly?:boolean;minimumPlayerDistanceSquared?:number; }
export interface TouhouBulletContext { paused?:boolean;freezeBullets?:boolean;clockScale?:number;boundsWidth?:number;boundsHeight?:number;sound?:(id:number,x:number)=>void;selectedEnemy?:()=>{x:number;y:number};onGraze?:(bullet:TouhouBullet)=>void;onCancelEffect?:(bullet:TouhouBullet,animation:AnmInstance)=>void;spawnCancelItem?:(position:{x:number;y:number;z:number},typeOrCount:number,parameters:number|{angle:number;speed:number})=>void; [key:string]:unknown; }
/** Supported lifecycle/motion from the reconstruction; opcodes 13/24/27 require separate ECL ownership. */
export class TouhouBulletField {
  constructor(options:{bank:AnmBank;styles:unknown[];random?:{next():number;signedUnit():number;unit():number};visualRandom?:{signedUnit():number};capacity?:number});
  readonly count:number;bullets:TouhouBullet[];effects:AnmInstance[];age:number;cancelCounter:number;itemCounter:number;
  emit(parameters?:TouhouBulletParameters):TouhouBullet[];
  update(player?:{x:number;y:number;collisionCircle(x:number,y:number,radius:number,context:TouhouBulletContext,preview?:boolean):number;addGraze(context:TouhouBulletContext,position?:{x:number;y:number},color?:number):void}|null,context?:TouhouBulletContext):this;
  cancelCircle(x:number,y:number,radius:number,options?:{dropMode?:number;limit?:number;kind?:number}):number;
  /** ECL615/616 ignore protection, preserving each bullet's cancellation kind. */
  cancelNearbyCircle(x:number,y:number,radius:number,options?:{dropMode?:number}):number;
  cancelRectangle(x:number,y:number,width:number,height:number,angle?:number,options?:{dropMode?:number;kind?:number}):number;
  cancel(bullet:TouhouBullet,dropMode?:number):void;retire(bullet:TouhouBullet):void;
  draw(draw:DrawList,view?:{x:number;y:number;scale:number}):DrawList;snapshot():unknown;
}
