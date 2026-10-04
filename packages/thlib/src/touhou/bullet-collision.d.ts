import type {AnmInstance} from './anm.js';
import type {TouhouPlayer,TouhouPlayerContext} from './player.js';
import type {TouhouTimer} from './math.js';
export function touhouCircleCollision(px:number,py:number,playerRadius:number,x:number,y:number,radius:number):0|1|2;
export function touhouBulletInCancelCircle(b:{x:number;y:number;radius:number},x:number,y:number,radius:number):boolean;
export function touhouBulletIntersectsRectangle(b:{x:number;y:number;radius:number;scale?:number},x:number,y:number,width:number,height:number,angle?:number):boolean;
export function touhouBulletInCancelRectangle(b:{x:number;y:number;radius:number;scale?:number},x:number,y:number,width:number,height:number,angle?:number,bounds?:{x:number;y:number;width:number;height:number}):boolean;
export interface TouhouBulletCollisionOptions{radius?:number;x?:number;y?:number;scale?:number;scaleEnabled?:boolean;color?:number;}
export interface TouhouBulletCollisionContext extends TouhouPlayerContext{onGraze?:(bullet:TouhouBulletCollisionState)=>void;}
export interface TouhouBulletCollisionState{
 x:number;y:number;radius:number;scale:number;scaleEnabled:boolean;handle:number;collisionEnabled:boolean;protectedFrames:number;primaryRate:number;activeMask:bigint;
 grazesLeft:number;grazePeriod:number;grazeTimer:TouhouTimer;touchingTimer:TouhouTimer;outsideTimer:TouhouTimer;animation:AnmInstance|null;child:AnmInstance|null;
}
export interface TouhouBulletCollisionUpdateOptions{preview?:boolean;onHit?:(bullet:TouhouBulletCollisionState)=>void;visualRandom?:{signedUnit():number};}
export function updateTouhouBulletCollision(b:TouhouBulletCollisionState,player:Pick<TouhouPlayer,'collisionCircle'|'addGraze'>|null,context?:TouhouBulletCollisionContext,options?:TouhouBulletCollisionUpdateOptions):number;
export class TouhouBulletCollision implements TouhouBulletCollisionState{
 constructor(options?:TouhouBulletCollisionOptions);
 x:number;y:number;radius:number;scale:number;scaleEnabled:boolean;handle:number;collisionEnabled:boolean;protectedFrames:number;primaryRate:number;activeMask:bigint;
 grazesLeft:number;grazePeriod:number;grazeTimer:TouhouTimer;touchingTimer:TouhouTimer;outsideTimer:TouhouTimer;animation:AnmInstance|null;child:AnmInstance|null;
 update(player:Pick<TouhouPlayer,'collisionCircle'|'addGraze'>|null,context?:TouhouBulletCollisionContext,options?:TouhouBulletCollisionUpdateOptions):number;
}
