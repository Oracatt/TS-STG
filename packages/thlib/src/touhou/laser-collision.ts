import type {TouhouPlayer,TouhouPlayerContext} from './player.js';
import type {TouhouBulletStyle} from './bullet-patterns.js';
import type {TouhouLaserParameters,TouhouCurveNode} from './lasers.js';
export interface TouhouLaserCollisionSample {position:{x:number;y:number;z?:number};angle:number;speed:number;}
export interface TouhouLaserCollisionSegment {position:{x:number;y:number;z:number};angle:number;length:number;width:number;}
export interface TouhouLaserCollisionState {
  world?:import('./world.js').TouhouWorld;
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
  onHit?:((laser:TouhouLaserCollisionState,segment:TouhouLaserCollisionSegment)=>void)|null;
  onGraze?:((laser:TouhouLaserCollisionState,position:{x:number;y:number;z:number},color:number)=>void)|null;
  /** Forwarded to player collision; does not make source graze state immutable. */
  preview?:boolean;
}
export interface TouhouLaserCollisionResult {hitCount:number;grazed:boolean;grazeAwarded:boolean;flashColor:number|null;}
// Source: laser_system/type{0,1,2}_collision.cpp and collision-segment builders.
// This owner-free path is shared by TouhouLaserField and externally driven beams.
import {f32,add,sub,mul,div,polar,rotate,rectangleCircle,TouhouTimer} from './math.js';

const vector=(x=0,y=0,z=0)=>({x:f32(x),y:f32(y),z:f32(z)});
const plus=(a:{x:number;y:number;z?:number},b:{x:number;y:number;z?:number})=>vector(add(a.x,b.x),add(a.y,b.y),add(a.z??0,b.z??0));
const direction=(angle: number,length: number)=>({...polar(angle,length),z:0});

/** Animation-free collision owner. Position, angle, width, length and samples
 * remain caller-owned; retain this state across frames to preserve graze timing.
 * Width is the full visible beam width, before the original collision trimming.
 * Curved samples run from head to tail and use source-space angle/speed. */
export function createTouhouLaserCollisionState({kind=1,state=2,position={x:0,y:0,z:0},angle=0,width=16,length=160,
  type=0,color=0,flags=0,count,samples=null,style=null,activeMask=0n,
  speed=0,lengthLimit=0,travel=0,protectedFrames=0,time=0,live=kind===2,path=null,parameters={}}: TouhouLaserCollisionOptions={}): TouhouLaserCollisionState {
  if(![0,1,2].includes(kind))throw new RangeError('Original laser collision kind must be 0, 1 or 2');
  if(![position.x,position.y,position.z??0,angle,width,length,speed,lengthLimit,travel,time].every(Number.isFinite)||width<0||length<0)
    throw new RangeError('Laser collision position, angle, width and length must be finite with nonnegative dimensions');
  if(kind===2&&(!Array.isArray(samples)||!Number.isInteger(count??samples.length)||(count??samples.length)<0||(count??samples.length)>samples.length))
    throw new RangeError('Curve collision requires samples and an available integer count');
  return {kind,state,position:vector(position.x,position.y,position.z??0),angle:f32(angle),width:f32(width),length:f32(length),
    p:{...parameters,x:f32(position.x),y:f32(position.y),z:f32(position.z??0),angle:f32(angle),width:f32(width),
      type,color,flags,count:count??samples?.length??parameters.count??0,length:f32(length),lengthLimit:f32(lengthLimit),speed:f32(speed),live},
    samples,style,activeMask,speed:f32(speed),travel:f32(travel),protectedFrames,live,path,time:new TouhouTimer(time),killPending:false,
    grazeTimer:new TouhouTimer(),touching:0,scale1:1,flashColor:null};
}

/** Source collision geometry. In particular type1 is not a generic capsule:
 * its length is95%, its width follows the original piecewise expression, and
 * only grow/sustain states participate. Type2 keeps the source16-unit head
 * exclusion and1.1 segment overlap; scale1 reset matches compute_segments. */
export function getTouhouLaserCollisionSegments(l: TouhouLaserCollisionState): TouhouLaserCollisionSegment[] {
  if(l.kind!==2){if(![2,4].includes(l.state)||!(l.length>16)||(l.kind===0&&!(l.width>3)))return[];
    let width=l.width<32?mul(l.width,.5):sub(l.width,div(add(l.width,16),l.kind===0?2:3));
    if(l.kind===1&&l.p.type===38)width=sub(l.width,l.width<32?2:4);
    const length=l.kind===1?mul(l.length,f32(.95)):l.p.flags&2?l.length:div(mul(l.length,4),5);
    return [{position:plus(l.position,direction(l.angle,div(l.length,2))),angle:l.angle,length,width}];
  }
  const result=[];let distance=0;l.scale1=1;
  for(let i=0;i<l.p.count-1;i++){const s=l.samples![i];let center=plus(s.position,direction(s.angle,mul(s.speed,.5)));distance=add(distance,s.speed);if(distance>=16){center=plus(center,direction(l.angle,div(s.speed,2)));result.push({position:center,angle:s.angle,length:mul(s.speed,f32(1.1)),width:mul(mul(l.width,.5),f32(1.1))});}}
  return result;
}

/** Pure hit-geometry query. Uses the same source-trimmed rectangles without
 * changing the player, graze clock, scale1, or cancellation state. Bomb/clear
 * segmentation is a separate source operation, not this player-hit query. */
export function touhouLaserIntersectsCircle(l: TouhouLaserCollisionState,x: number,y: number,radius: number): boolean {
  return getTouhouLaserCollisionSegments(l.kind===2?{...l}:l).some(s=>
    rectangleCircle(s.position.x,s.position.y,s.length,s.width,s.angle,x,y,radius));
}

/** Run one source collision tick for the entire beam. The player owns hit and
 * graze eligibility; onHit lets its external owner perform source cancellation.
 * Graze is awarded once per eight qualifying ticks, not once per curve sample.
 * Like the source preview path, preview is forwarded to player collision only;
 * callers needing a pure geometry query use getTouhouLaserCollisionSegments. */
export function updateTouhouLaserCollision(l: TouhouLaserCollisionState,player: TouhouLaserCollisionPlayer|null,context: TouhouLaserCollisionContext={}, {onHit=null,onGraze=null,preview=false}: TouhouLaserCollisionCallbacks={}): TouhouLaserCollisionResult {
  const result:TouhouLaserCollisionResult={hitCount:0,grazed:false,grazeAwarded:false,flashColor:null};
  l.flashColor=null;if(!player)return result;
  const segments=getTouhouLaserCollisionSegments(l);if(!segments.length)return result;
  let grazed=false,grazeSegment=null;
  for(const s of segments){const collision=player.collisionRectangle(s.position.x,s.position.y,s.angle,s.width,s.length,context,preview);
    if(collision===1){result.hitCount++;onHit?.(l,s);}
    else if(collision===2&&!grazed){grazed=true;grazeSegment=s;if(l.kind!==2)l.touching++;}
    else l.touching=0;
  }
  if(grazed&&l.grazeTimer.current%8===0){
    const s=grazeSegment!,local=rotate(sub(player.x,s.position.x),sub(player.y,s.position.y),-s.angle);
    const x=Math.max(div(-s.length,2),Math.min(div(s.length,2),local.x));let projected=plus(s.position,rotate(x,0,s.angle));
    if(l.kind===1)projected=vector(div(add(projected.x,player.x),2),div(add(projected.y,player.y),2));
    const color=l.style?.cancelType===6?l.style.colors[l.p.color][4]:0xffd08080;
    player.addGraze(context,projected,color);context.onLaserGraze?.(l);onGraze?.(l,projected,color);
    if(l.kind===2)l.touching++;result.grazeAwarded=true;
  }
  if(l.kind!==2&&grazed&&!(l.activeMask&0x200000000n)){const green=Math.max(96,Math.min(240,208-l.touching*2));l.flashColor=(0xffff0080|(green<<8))>>>0;}
  if(grazed||l.kind===2)l.grazeTimer.tick(context.clockScale??1);
  result.grazed=grazed;result.flashColor=l.flashColor;return result;
}
