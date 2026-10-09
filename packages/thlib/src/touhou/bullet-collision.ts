import type {AnmInstance} from './anm.js';
import type {TouhouPlayer,TouhouPlayerContext} from './player.js';
export interface TouhouBulletCollisionOptions{radius?:number;x?:number;y?:number;scale?:number;scaleEnabled?:boolean;color?:number;}
export interface TouhouBulletCollisionContext<T extends TouhouBulletCollisionState= TouhouBulletCollisionState> extends TouhouPlayerContext{onGraze?:(bullet:T)=>void;}
export interface TouhouBulletCollisionState{
 x:number;y:number;radius:number;scale:number;scaleEnabled:boolean;handle:number;collisionEnabled:boolean;protectedFrames:number;primaryRate:number;activeMask:bigint;
 grazesLeft:number;grazePeriod:number;grazeTimer:TouhouTimer;touchingTimer:TouhouTimer;outsideTimer:TouhouTimer;animation:AnmInstance|null;child:AnmInstance|null;
}
export interface TouhouBulletCollisionUpdateOptions<T extends TouhouBulletCollisionState= TouhouBulletCollisionState>{preview?:boolean;onHit?:(bullet:T)=>void;visualRandom?:{signedUnit():number};}
// Source: player_entity/collision.cpp, bullet_system/player_collision.cpp and
// cancellation.cpp. Shared by the original field and externally moved bullets.
import {f32,add,sub,mul,div,rectangleCircle,TouhouTimer} from './math.js';

/** Original circular hit/graze geometry. Tangency is excluded from both.
 * This deliberately uses squared radii added separately, not (a+b)^2. */
export function touhouCircleCollision(px: number,py: number,playerRadius: number,x: number,y: number,radius: number): 0|1|2{
  const dx=sub(px,x),dy=sub(py,y),distance=add(mul(dx,dx),mul(dy,dy));
  if(!(distance>=add(mul(playerRadius,playerRadius),mul(radius,radius))))return 1;
  const total=add(playerRadius,Math.max(40,div(radius,2.5)));
  return !(distance>=add(mul(total,total),mul(radius,radius)))?2:0;
}
export function touhouBulletInCancelCircle(b: {x:number;y:number;radius:number},x: number,y: number,radius: number): boolean{
  const dx=sub(b.x,x),dy=sub(b.y,y),reach=add(div(b.radius,2),radius);
  return add(mul(dx,dx),mul(dy,dy))<=mul(reach,reach);
}
export function touhouBulletIntersectsRectangle(b: {x:number;y:number;radius:number;scale?:number},x: number,y: number,width: number,height: number,angle: number=0): boolean{
  return rectangleCircle(x,y,width,height,angle,b.x,b.y,mul(b.radius,b.scale??1));
}
/** Original rectangular cancellation also rejects bullets outside the playfield.
 * Custom coordinate adapters may supply the equivalent translated viewport. */
export function touhouBulletInCancelRectangle(b: {x:number;y:number;radius:number;scale?:number},x: number,y: number,width: number,height: number,angle: number=0,bounds: {x:number;y:number;width:number;height:number}={x:-192,y:0,width:384,height:448}): boolean{
  return touhouBulletIntersectsRectangle(b,x,y,width,height,angle)&&
    rectangleCircle(add(bounds.x,div(bounds.width,2)),add(bounds.y,div(bounds.height,2)),bounds.width,bounds.height,0,b.x,b.y,mul(b.radius,b.scale??1));
}

/** State and policy only: trajectory, birth delay and retirement remain owned
 * by the caller. Radius comes from the same resolved style as the ANM body.
 * Scaling the hitbox is explicit, just as in the source scale opcode. */
export class TouhouBulletCollision {
  x:number;
  y:number;
  radius:number;
  scale:number;
  scaleEnabled:boolean;
  handle:number;
  collisionEnabled:boolean;
  protectedFrames:number;
  primaryRate:number;
  activeMask:bigint;
  grazesLeft:number;
  grazePeriod:number;
  grazeTimer:TouhouTimer;
  touchingTimer:TouhouTimer;
  outsideTimer:TouhouTimer;
  animation:AnmInstance|null;
  child:AnmInstance|null;

  constructor({radius=0,x=0,y=0,scale=1,scaleEnabled=false,color=0xffd08080}: TouhouBulletCollisionOptions={}){
    Object.assign(this,{x:f32(x),y:f32(y),radius:f32(radius),scale:f32(scale),scaleEnabled,
      handle:color>>>0,collisionEnabled:true,protectedFrames:0,primaryRate:1,activeMask:0n,
      grazesLeft:3,grazePeriod:60,grazeTimer:new TouhouTimer(),touchingTimer:new TouhouTimer(),outsideTimer:new TouhouTimer(),
      animation:null,child:null});
  }
  update(player: Pick<TouhouPlayer,'collisionCircle'|'addGraze'>|null,context: TouhouBulletCollisionContext={},options: TouhouBulletCollisionUpdateOptions={}): number{return updateTouhouBulletCollision(this,player,context,options);}
}

export function updateTouhouBulletCollision<T extends TouhouBulletCollisionState>(b: T,player: Pick<TouhouPlayer,'collisionCircle'|'addGraze'>|null,context: TouhouBulletCollisionContext<T>={}, {preview=false,onHit,visualRandom}: TouhouBulletCollisionUpdateOptions<T>={}): number{
  const animation=b.animation;
  if(animation){animation.flashColor=null;animation.F(0x2c,0);animation.F(0x30,0);animation.F(0x34,0);}
  if(!player||!b.collisionEnabled||!(b.radius>0))return 0;
  b.primaryRate=1;
  const collision=player.collisionCircle(b.x,b.y,b.scaleEnabled?mul(b.radius,b.scale):b.radius,context,preview);
  if(collision===0){b.outsideTimer.tick(context.clockScale??1);if(b.outsideTimer.current>=60&&!b.grazesLeft){b.grazesLeft=3;b.grazeTimer.set(0);}}
  if(collision===1&&b.protectedFrames===0){onHit?.(b);return collision;}
  if(collision!==2){if(b.touchingTimer.current)b.child?.interrupt(3,true);b.touchingTimer.set(0);return collision;}
  if(b.grazesLeft&&b.grazeTimer.current!==b.grazeTimer.previous&&b.grazeTimer.current%b.grazePeriod===0){
    player.addGraze(context,{x:b.x,y:b.y},b.handle);context.onGraze?.(b);b.grazeTimer.set(0);b.grazesLeft--;
  }
  b.grazeTimer.tick(context.clockScale??1);b.touchingTimer.tick(context.clockScale??1);b.outsideTimer.set(0);
  if(!(b.activeMask&0x200000000n)){
    if(b.touchingTimer.current<=1)b.child?.interrupt(2,true);
    const green=Math.max(96,Math.min(255,(208-b.touchingTimer.current*2)|0));
    if(animation)animation.flashColor=(0xffff0080|(green<<8))>>>0;
    if(visualRandom){const y=visualRandom.signedUnit(),x=visualRandom.signedUnit();if(animation){animation.F(0x2c,x);animation.F(0x30,y);}}
  }
  return collision;
}
