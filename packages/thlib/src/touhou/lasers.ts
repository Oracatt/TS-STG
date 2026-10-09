import type {AnmDrawList as DrawList,AnmView} from './anm.js';
import type {TouhouBulletStyle} from './bullet-patterns.js';
import type {TouhouLaserCollisionPlayer,TouhouLaserCollisionContext} from './laser-collision.js';
type Vector={x:number;y:number;z?:number};
type ResolvedLaserParameters=Required<Omit<TouhouLaserParameters,'world'|'bounds'|'commands'|'commandIndex'|'path'|'autoBounds'>> & Pick<TouhouLaserParameters,'world'|'bounds'|'commandIndex'|'path'|'autoBounds'> & {commands:number[][]};
interface LaserMotion{timer:TouhouTimer;duration?:number;acceleration?:number;velocity?:Vector;angular?:number;angle?:number;speed?:number;count?:number;mode?:number;turns?:number;offset?:number;factor?:number}
export interface TouhouLaserContext extends TouhouLaserCollisionContext {paused?:boolean;freezeBullets?:boolean;selectedEnemy?:()=>Vector;onLaserCancelEffect?:(laser:TouhouLaserCollisionState,animation:AnmInstance)=>void}
export interface TouhouLaserFieldOptions extends TouhouWorldOptions {bank?:AnmBank|null;styles:TouhouBulletStyle[];autoBounds?:boolean;capacity?:number}
import type {AnmBank,AnmInstance,AnmCreateOptions} from './anm.js';
import type {TouhouBulletCommand} from './bullets.js';
import type {TouhouLaserCollisionState,TouhouLaserCollisionSegment} from './laser-collision.js';
import type {TouhouWorld,TouhouWorldOptions,TouhouNormalizedWorldBounds} from './world.js';
export interface TouhouCurveSample {position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};angle:number;speed:number;actor?:unknown;}
export interface TouhouCurveNode {kind:0|1|2;begin:number;end:number;position:{x:number;y:number;z:number};direction?:{x:number;y:number;z:number};angle:number;speed:number;acceleration:number;angularAcceleration:number;}
export interface TouhouLaserParameters extends TouhouWorldOptions {x?:number;y?:number;z?:number;type?:number;color?:number;angle?:number;width?:number;speed?:number;length?:number;initialLength?:number;lengthLimit?:number;radialOffset?:number;growthSpeed?:number;angularVelocity?:number;velocity?:{x:number;y:number;z?:number};delay?:number;grow?:number;sustain?:number;shrink?:number;count?:number;time?:number;live?:boolean;flags?:number;sound?:number;motionSound?:number;commands?:TouhouBulletCommand[];commandIndex?:number;path?:TouhouCurveNode[];autoBounds?:boolean;}
export interface TouhouLaser extends TouhouLaserCollisionState {p:ResolvedLaserParameters;style:ReturnType<typeof touhouStyle>;velocity:{x:number;y:number;z:number};age:TouhouTimer;grace:TouhouTimer;delay:TouhouTimer;commands:Map<number,LaserMotion>;commandIndex:number;commandLoop:number;updated:boolean;scale2:number;pausePath:boolean;id:number;alive:boolean;driven?:boolean;autoBounds?:boolean;collisionEnabled?:boolean;travel:number;speed:number;protectedFrames:number;animation:AnmInstance|null;origin:AnmInstance|null;tip:AnmInstance|null;samples:TouhouCurveSample[]|null;path:TouhouCurveNode[]|null;world:TouhouWorld;bounds:Readonly<TouhouNormalizedWorldBounds>;}
// Source: laser_system/type{0,1,2}_{frame,collision,cancellation}.cpp and type2_path.cpp.
// Common laser entities; no Boss attack scripts or magic-stone mechanics.
import {f32,PI,add,sub,mul,div,sqrt,atan2,polar,wrapAngle,angleDifference,TouhouTimer} from './math.js';
import {touhouStyle} from './bullet-patterns.js';
import {touhouBulletCommand} from './bullets.js';
import {anmSpriteVertices} from './anm-render.js';
import {getTouhouLaserCollisionSegments,updateTouhouLaserCollision} from './laser-collision.js';
import {cancelTouhouLaser,eraseTouhouLaser} from './laser-cancellation.js';
import {resolveTouhouWorld} from './world.js';

const viewDefault={x:336,y:24,scale:1.5};
const vector=(x=0,y=0,z=0)=>({x:f32(x),y:f32(y),z:f32(z)});
const plus=(a:Vector,b:Vector)=>vector(add(a.x,b.x),add(a.y,b.y),add(a.z??0,b.z??0));
const minus=(a:Vector,b:Vector)=>vector(sub(a.x,b.x),sub(a.y,b.y),sub(a.z??0,b.z??0));
const scale=(a:Vector,s:number)=>vector(mul(a.x,s),mul(a.y,s),mul(a.z??0,s));
const direction=(angle: number,length: number)=>({...polar(angle,length),z:0});
const square=(x: number,y: number)=>add(mul(x,x),mul(y,y));
function advanceCurveBounds(l: TouhouLaser,rate: number){
  if(!l.autoBounds)return true;
  if(l.grace.current<=0&&!(l.activeMask&0x100n)){
    for(let i=0;i<l.p.count;i++)if(!l.world.outside(l.samples![i].position,l.width,l.width))return true;
    return false;
  }
  l.grace.add(-1,rate);return true;
}
const sample=(position:{x:number;y:number;z:number},velocity:{x:number;y:number;z:number},angle: number,speed: number)=>({position:{...position},velocity:{...velocity},angle,speed});
const cloneSample=(s: TouhouCurveSample)=>sample(s.position,s.velocity,s.angle,s.speed);
const wordView=new DataView(new ArrayBuffer(4));
const wordFloat=(n: number)=>{wordView.setUint32(0,n,true);return wordView.getFloat32(0,true);};
const sourceBlend:[string,string,string][]=[['srcAlpha','oneMinusSrcAlpha','add'],['srcAlpha','one','add'],['srcAlpha','one','reverseSubtract'],['one','zero','add'],['oneMinusDstColor','oneMinusSrcColor','add'],['dstColor','zero','add'],['srcAlpha','oneMinusSrcColor','add'],['dstAlpha','oneMinusDstAlpha','add'],['srcAlpha','one','min'],['srcAlpha','one','max']];

function configureLaserAnimation(vm: AnmInstance,body: boolean){
  vm.interrupt(2);vm.update();vm.B(0x498,1);vm.B(0x499,1);
  vm.U(0x4a0,(vm.U(0x4a0)&~0x3000000)|0x1000000);
  if(body){vm.U(0x4a8,0);vm.U(0x4ac,2);}
}
/** Original type0/1/2 laser origin: bullet ANM 58..73, interrupt 2, additive
 * rotating quad. Its eight-frame alpha and 1.2/1.5 scale pulse stay in ANM.
 * Embedded laser animations are drawn by their owner at priority 39, not the
 * script's default ANM layer 0. Caller owns update, placement and destruction. */
export function createTouhouLaserOrigin(bank: AnmBank,color: number=0,options: AnmCreateOptions={}): AnmInstance{
  if(!Number.isInteger(color)||color<0||color>=16)throw new RangeError('Original laser origin color must be in 0..15');
  const animation=bank.create(color+0x3a,options);configureLaserAnimation(animation,false);return animation;
}

/** Original piecewise curve sampler, including the backward-sampling quirks. */
export function touhouCurveSample(nodes: TouhouCurveNode[],time: number,previous: Omit<TouhouCurveSample,'velocity'>&{velocity?:TouhouCurveSample['velocity']}={position:vector(),angle:0,speed:0},backwards: boolean=false,fallback: Omit<TouhouCurveSample,'velocity'>&{velocity?:TouhouCurveSample['velocity']}=previous): TouhouCurveSample {
  const c=nodes.find(node=>time>=node.begin&&time<node.end);if(!c)return cloneSample({...fallback,velocity:fallback.velocity??vector()});
  let position,speed,angle;const t=sub(time,c.begin),dir=c.direction??direction(c.angle!,1);
  if(!backwards){
    if(c.kind===0){position=plus(c.position,scale(scale(dir,t),c.speed!));speed=c.speed!;angle=c.angle!;}
    else if(c.kind===1){
      if(!(c.angularAcceleration < -990)){const v=plus(direction(c.angle!,c.speed!),direction(c.angularAcceleration,c.acceleration!));position=plus(c.position,scale(v,t));speed=sqrt(square(v.x,v.y));angle=atan2(v.y,v.x);}
      else{position=plus(c.position,scale(scale(scale(dir,add(mul(t,c.acceleration!),mul(c.speed!,2))),add(t,1)),.5));speed=add(mul(c.acceleration!,t),c.speed!);angle=c.angle!;}
    }else if(c.kind===2){position={...c.position};angle=c.angle!;speed=c.speed!;for(let i=0;i<Math.trunc(t);i++){const v=direction(angle,speed);angle=wrapAngle(add(angle,c.angularAcceleration));speed=add(speed,c.acceleration!);position=plus(position,v);}position=plus(position,scale(direction(angle,speed),sub(t,f32(Math.floor(t)))));}
    else throw new RangeError(`Unsupported original curve path kind ${c.kind}`);
  }else{
    if(c.kind===0){position=minus(previous.position,scale(dir,c.speed!));speed=c.speed!;angle=c.angle!;}
    else if(c.kind===1){
      if(!(c.angularAcceleration < -990)){const v=plus(direction(previous.angle,-previous.speed),direction(c.angularAcceleration,-c.acceleration!));position=plus(previous.position,v);speed=sqrt(square(v.x,v.y));angle=atan2(v.y,v.x);}
      else{position=minus(previous.position,scale(dir,sub(previous.speed,c.acceleration!)));speed=sub(c.speed!,c.acceleration!);angle=previous.angle;}
    }else if(c.kind===2){position=minus(previous.position,scale(direction(previous.angle,previous.speed),sub(time,f32(Math.floor(time)))));speed=sub(previous.speed,c.acceleration!);angle=wrapAngle(sub(previous.angle,c.angularAcceleration));position=minus(position,scale(direction(angle,speed),add(sub(1,time),f32(Math.floor(time)))));}
    else throw new RangeError(`Unsupported original curve path kind ${c.kind}`);
  }
  return sample(position,vector(),angle,speed);
}

export class TouhouLaserField {
  declare destroy?:()=>void;
  drivenCurveOrigins:WeakMap<TouhouLaser,TouhouCurveSample>;
  bank: AnmBank | null;
  styles: TouhouBulletStyle[];
  nextId: number;
  context: TouhouLaserContext;
  player: TouhouLaserCollisionPlayer | null;

  readonly capacity:number;
  lasers:TouhouLaser[];
  effects:AnmInstance[];
  cancelCounter:number;
  world:TouhouWorld;
  bounds:Readonly<TouhouNormalizedWorldBounds>;
  autoBounds:boolean;

  constructor({bank=null,styles,world,bounds,autoBounds=true,capacity=512}: TouhouLaserFieldOptions={} as TouhouLaserFieldOptions){
    if(bank!==null&&!bank?.create||!Array.isArray(styles)||styles.length<50)throw new TypeError('Original style table and optional bullet ANM bank required');
    if(typeof autoBounds!=='boolean')throw new TypeError('Laser autoBounds must be boolean');
    if(!Number.isSafeInteger(capacity)||capacity<1||capacity>0xffffffff)throw new RangeError('Laser capacity must be a positive supported array length');
    this.world=resolveTouhouWorld({world,bounds});this.bounds=this.world.bounds;this.autoBounds=autoBounds;this.capacity=capacity;
    this.bank=bank;this.styles=styles;this.lasers=[];this.effects=[];this.nextId=0x10000;this.cancelCounter=0;this.context={};this.player=null;this.drivenCurveOrigins=new WeakMap();
  }
  get count(): number{return this.lasers.filter(l=>l.alive).length;}
  spawnStraight(parameters: TouhouLaserParameters={}): TouhouLaser|null{return this.spawn(0,parameters);}
  spawnInfinite(parameters: TouhouLaserParameters={}): TouhouLaser|null{return this.spawn(1,parameters);}
  spawnCurve(parameters: TouhouLaserParameters={}): TouhouLaser|null{return this.spawn(2,parameters);}
  /** Adopt caller-supplied trajectories while retaining this field's source
   * collision, graze clock, ANM, cancellation and debris ownership. External
   * movement writes the returned geometry before update; newly split lasers
   * use ordinary source movement and are not driven. Curve autoBounds is
   * opt-in: source grace and whole-buffer bounds then own out-of-view expiry. */
  spawnDriven(kind: 0|1|2,parameters: TouhouLaserParameters & {state?:number;autoBounds?:boolean}={}): TouhouLaser|null{
    if(![0,1,2].includes(kind))throw new RangeError('Original driven laser kind must be 0, 1 or 2');
    const laser=this.spawn(kind,parameters);if(!laser)return null;
    laser.driven=true;laser.autoBounds=kind===2&&parameters.autoBounds===true;laser.state=parameters.state??2;laser.width=laser.p.width;
    if(kind===2)this.drivenCurveOrigins.set(laser,sample(vector(laser.p.x,laser.p.y,laser.p.z),vector(),laser.p.angle,laser.p.speed));
    if(kind===0)laser.length=laser.p.length;return laser;
  }
  /** Adopt newest-first external live-curve history. Missing pre-birth samples
   * stay at the original spawn position with source angle/speed and zero
   * velocity, as in type2 initialize's negative-time branch. The source sample
   * count is a capacity, not the number of externally materialized segments;
   * only source cancellation may shorten it. Sample metadata is preserved. */
  updateDrivenCurve(laser: TouhouLaser,samples: readonly TouhouCurveSample[]): TouhouLaser{
    const origin=this.drivenCurveOrigins.get(laser);
    if(!origin)throw new TypeError('Driven curve history requires a curve spawned by this field');
    if(!Array.isArray(samples))throw new TypeError('Driven curve history must be a newest-first sample array');
    if(!laser.alive||laser.killPending||laser.state===1)return laser;
    const next=new Array(laser.p.count);
    for(let i=0;i<next.length;i++){
      const input=samples[i];
      if(!input){next[i]=cloneSample(origin);continue;}
      const p=input.position,v=input.velocity??vector();
      if(!p||![p.x,p.y,p.z??0,v.x,v.y,v.z??0,input.angle,input.speed].every(value=>typeof value==='number'&&Number.isFinite(f32(value))))
        throw new TypeError('Driven curve samples require finite position, velocity, angle and speed');
      next[i]={...input,position:vector(p.x,p.y,p.z??0),velocity:vector(v.x,v.y,v.z??0),angle:f32(input.angle),speed:f32(input.speed)};
    }
    laser.samples=next;laser.live=true;laser.p.live=true;return laser;
  }
  spawn(kind:0|1|2,parameters:TouhouLaserParameters):TouhouLaser|null{
    if(this.count>=this.capacity)return null;
    const p={x:0,y:0,z:0,type:0,color:0,angle:0,width:16,speed:4,length:160,initialLength:0,lengthLimit:0,radialOffset:0,growthSpeed:8,angularVelocity:0,velocity:vector(),delay:30,grow:20,sustain:120,shrink:20,count:64,time:0,live:false,flags:0,sound:-1,motionSound:-1,...parameters};
    const world=resolveTouhouWorld({world:p.world??this.world,bounds:p.bounds}),autoBounds=p.autoBounds??this.autoBounds;
    if(typeof autoBounds!=='boolean')throw new TypeError('Laser autoBounds must be boolean');
    for(const key of ['x','y','z','angle','width','speed','length','initialLength','lengthLimit','radialOffset','growthSpeed','angularVelocity','time'] as const){if(!Number.isFinite(p[key]))throw new TypeError(`Laser ${key} must be finite`);p[key]=f32(p[key]);}
    if(p.width<0||p.length<0||p.initialLength<0||p.length>8192||p.initialLength>8192)throw new RangeError('Laser width/length outside supported original sample buffer');
    if(kind===2&&(!Number.isInteger(p.count)||p.count<4||p.count>512))throw new RangeError('Curve count must be in 4..512');
    if(kind===2&&p.type===2)throw new Error('Curve type2 requires enemy-owned ANM archive and is outside common laser support');
    const supported=kind===1?[0,7,10,20,33]:kind===0?[0,2,3,4,7,8,10,11,15,16,20,30,33]:[0,2,3,4,7,8,10,11,15,16,20,28,30,31,33];
    p.commands=(p.commands??[]).map(op=>Array.isArray(op)?op.slice():touhouBulletCommand(op.type,op));
    for(const op of p.commands as number[][])if(op.length!==11||!supported.includes(op[8]))throw new Error(`Unsupported original laser type${kind} command ${op[8]}`);
    const style=touhouStyle(this.styles,p.type,p.color),position=plus(vector(p.x,p.y,p.z),direction(p.angle,p.radialOffset));
    const l:TouhouLaser={id:++this.nextId,kind,p:p as ResolvedLaserParameters,style,alive:true,state:kind===1?3:2,position,angle:p.angle,width:kind===1?2:p.width,speed:p.speed,
      length:kind===0?p.initialLength:p.length,travel:kind===0&&p.initialLength>p.length?f32(.01):0,velocity:direction(p.angle,p.speed),
      age:new TouhouTimer(),time:new TouhouTimer(p.time),grazeTimer:new TouhouTimer(),touching:0,flashColor:null,grace:new TouhouTimer(30),delay:new TouhouTimer(3),
      activeMask:0n,commands:new Map(),commandIndex:p.commandIndex??0,commandLoop:0,protectedFrames:0,updated:false,killPending:false,
      animation:null,origin:null,tip:null,scale1:1,scale2:1,path:null,samples:null,live:p.live,pausePath:false,world,bounds:world.bounds,autoBounds};
    const script=kind===2?(p.type===1?0x147:p.type+0x91):style.script;
    if(this.bank){l.animation=this.bank.create(script,{spriteRemap:kind===2&&p.type!==1?()=>p.color+0x20c:id=>style.remapSprite(id)});
    this.configureAnimation(l.animation,true);l.origin=createTouhouLaserOrigin(this.bank,p.color);
    if(kind===0){l.tip=this.bank.create(p.color+(p.type<18||p.type===38?0x5d:0x55));if(p.type<18||p.type===38)l.tip.B(0x499,1);l.tip.U(0x4a0,(l.tip.U(0x4a0)&~0x3000000)|0x1000000);}}
    if(kind===2){
      p.x=position.x;p.y=position.y;p.z=position.z;p.radialOffset=0;
      l.path=p.path?p.path.map((n: TouhouCurveNode)=>({...n,position:{...n.position},direction:n.direction??direction(n.angle,1)})):[{kind:0,begin:0,end:999999,position:{...position},direction:direction(p.angle,1),angle:wrapAngle(p.angle),speed:p.speed,acceleration:0,angularAcceleration:0}];
      if(p.path)l.commandIndex=99;l.samples=Array.from({length:p.count},()=>sample(position,vector(),p.angle,p.speed));l.samples![0].velocity={...l.velocity};this.samplePath(l);
    }
    this.lasers.unshift(l);if(p.sound>=0)this.context.sound?.(p.sound,0);return l;
  }
  configureAnimation(vm: AnmInstance,body: boolean){configureLaserAnimation(vm,body);}
  retire(l: TouhouLaser): void{if(!l.alive)return;l.alive=false;l.animation?.destroy();l.origin?.destroy();l.tip?.destroy();}
  setPosition(l: TouhouLaser,x: number,y: number,z: number=0): void{l.position=vector(x,y,z);if(l.kind===1){l.p.x=l.position.x;l.p.y=l.position.y;l.p.z=l.position.z;}}
  command(l: TouhouLaser,flag: number,data:Omit<LaserMotion,'timer'> & {timer?:TouhouTimer}){l.activeMask|=BigInt(flag);l.commands.set(flag,{timer:new TouhouTimer(),...data});}
  clearCommand(l: TouhouLaser,flag: number){l.activeMask&=~BigInt(flag);l.commands.delete(flag);return 1;}
  playerAngle(l: TouhouLaser){if(!this.player)return div(PI,2);const d=minus(this.player,l.position);return !d.x&&!d.y?div(PI,2):atan2(d.y,d.x);}
  executeCommands(l: TouhouLaser){
    for(let budget=0;budget<4096;budget++){
      if(l.commandIndex>=l.p.commands.length||(l.kind!==0&&l.commandIndex>23))return;
      const op=l.p.commands[l.commandIndex],type=op[8];if(!type||(!op[9]&&l.activeMask)||(l.kind===2&&(l.activeMask&(1n<<BigInt(type)))))return;
      const f=(i: number)=>wordFloat(op[i]),i=(n: number)=>op[n]|0;
      if(type===2||type===3){
        if(l.kind===2){
          const initialize=(node:Omit<TouhouCurveNode,'position'|'angle'|'speed'|'direction'>,prior:TouhouCurveNode):TouhouCurveNode=>{const s=touhouCurveSample([{...prior,end:Infinity}],prior.end);return Object.assign(node,{position:{...s.position},angle:s.angle,speed:s.speed,direction:direction(s.angle,1)});};
          let tail=l.path!.at(-1)!;tail.end=f32(i(5));const node=initialize({begin:tail.end,end:i(4)<0?999999:add(f32(i(5)),f32(i(4))),kind:type===2?1:2,acceleration:f(0),angularAcceleration:f(1)},tail);l.path!.push(node);
          if(i(4)>=0)l.path!.push(initialize({begin:node.end,end:999999,kind:0,acceleration:0,angularAcceleration:0},node));
        }else if(type===2){let a=f(1);if(a<=-999990)a=l.angle;else if(a>=999990&&a<1999990)a=add(this.playerAngle(l),f(2));else if(a>=2999990)throw new Error('Random/enemy-relative laser angle requires explicit source RNG ownership');const v=direction(a,f(0));this.command(l,4,{acceleration:f(0),velocity:v,duration:i(4)});}
        else this.command(l,8,{acceleration:f(0),angular:f(1),duration:i(4)}); // Type0's angular callback is literally zero-return.
        if(l.commandIndex&&l.p.motionSound>=0)this.context.sound?.(l.p.motionSound,0);
      }else if(type===4)this.command(l,16,{angle:f(0),speed:f(1)>-999?f(1):l.speed,duration:i(4),count:i(5),mode:i(6),turns:0});
      else if(type===7)l.protectedFrames=op[4];
      else if(type===8){if(l.kind===0)l.delay.set(i(4));else this.command(l,0x100,{timer:new TouhouTimer(i(4))});}
      else if(type===10)l.state=3;
      else if(type===11)this.context.sound?.(i(4),l.position.x);
      else if(type===15)l.id=op[4];
      else if(type===16){if(l.kind===2||i(5)<1){l.commandIndex=op[4];continue;}if(!l.commandLoop){l.commandLoop=op[5];l.commandIndex=op[4];continue;}if(l.commandLoop!==1){l.commandLoop--;l.commandIndex=op[4];continue;}l.commandLoop=0;}
      else if(type===20)l.animation?.B(0x499,op[4]?1:0);
      else if(type===28)l.pausePath=!!(op[4]&1);
      else if(type===30&&i(4)>0)this.command(l,0x40000000,{timer:new TouhouTimer(i(4))});
      else if(type===31){l.live=true;this.command(l,0x80000000,{speed:f(0),offset:f(1),factor:f(2),duration:i(4)});}
      else if(type===33)l.activeMask=(l.activeMask&~0x200000000n)|(BigInt(op[4]&1)<<33n);
      l.commandIndex++;
    }throw new Error('Original laser instruction budget exhausted');
  }
  motion(l: TouhouLaser,rate: number){
    for(let repeat=0;repeat<4096;repeat++){
      this.executeCommands(l);if(!l.activeMask)break;let completed=0;
      for(const flag of [4,16,0x80000000,0x100,0x40000000]){
        const c=l.commands.get(flag);if(!c)continue;
        if(flag===4){if(c.timer.current>=c.duration!){completed+=this.clearCommand(l,flag);continue;}l.speed=add(l.speed,mul(rate,c.acceleration!));l.velocity=plus(l.velocity,scale(c.velocity!,rate));if(Math.abs(l.velocity.x)>f32(.0001)||Math.abs(l.velocity.y)>f32(.0001))l.angle=atan2(l.velocity.y,l.velocity.x);c.timer.tick(rate);}
        else if(flag===16&&c.mode! ===0){let speed;if(c.timer.current>=c.duration!){if(l.p.motionSound>=0)this.context.sound?.(l.p.motionSound,0);c.turns!++;l.angle=add(l.angle,c.angle!);l.speed=speed=c.speed!;c.timer.set(0);if(c.turns!>=c.count!){l.velocity=direction(l.angle,speed);completed+=this.clearCommand(l,flag);continue;}}else speed=sub(l.speed,div(mul(c.timer.value,l.speed),f32(c.duration!)));l.velocity=direction(l.angle,speed);c.timer.tick(rate);}
        else if(flag===0x80000000){if(c.timer.current>=c.duration!){completed+=this.clearCommand(l,flag);continue;}l.position={...l.samples![0].position};const v=direction(wrapAngle(add(c.offset!,this.playerAngle(l))),c.speed!);l.velocity=plus(l.velocity,scale(minus(v,l.velocity),c.factor!));l.velocity.z=0;l.speed=sqrt(square(l.velocity.x,l.velocity.y));l.angle=atan2(l.velocity.y,l.velocity.x);c.timer.tick(rate);}
        else if(flag===0x100){c.timer.add(-1,rate);if(c.timer.current<=0)completed+=this.clearCommand(l,flag);}
        else if(flag===0x40000000){if(c.timer.current<=0)completed+=this.clearCommand(l,flag);else c.timer.add(-1,rate);}
      }
      if(l.protectedFrames)l.protectedFrames--;if(!completed)break;if(repeat===4095)throw new Error('Original laser motion retry budget exhausted');
    }
  }
  samplePath(l: TouhouLaser){let backwards=false;for(let i=0;i<l.p.count;i++){const t=sub(l.time.value,f32(i));if(t<0)l.samples![i]=sample(vector(l.p.x,l.p.y,l.p.z),vector(),l.p.angle,l.p.speed);else{const previous=i?l.samples![i-1]:l.samples![i];l.samples![i]=touhouCurveSample(l.path!,t,previous,backwards,l.samples![i]);backwards=true;}}}
  advance(l: TouhouLaser,rate: number){
    this.motion(l,rate);
    if(l.kind===0){const step=mul(mul(mul(rate,l.speed),l.scale1),l.scale2);if(l.p.length>l.length)l.length=Math.min(add(l.length,step),l.p.length);else{l.travel=add(l.travel,step);l.position=plus(l.position,scale(scale(scale(l.velocity,rate),l.scale1),l.scale2));if(l.p.lengthLimit>0&&add(l.travel,l.length)>l.p.lengthLimit){l.length=l.p.length=sub(l.p.lengthLimit,l.travel);if(l.length<=0)return false;}}
      if(l.grace.current<=0&&l.delay.current<=0){if(l.autoBounds&&l.world.outside(l.position,l.width,l.width)&&l.world.outside(plus(l.position,direction(l.angle,l.length)),l.width,l.width))return false;}else{if(l.grace.current>0)l.grace.add(-1,rate);if(l.delay.current>0)l.delay.add(-1,rate);}
    }else if(l.kind===1){
      if(l.p.lengthLimit>l.length)l.length=Math.min(add(l.length,mul(rate,l.p.growthSpeed)),l.p.lengthLimit);
      l.angle=wrapAngle(add(l.angle,mul(rate,l.p.angularVelocity)));l.position=vector(l.p.x,l.p.y,l.p.z);
      if(l.p.flags&1){const enemy=this.context.selectedEnemy?.();if(enemy)l.position=vector(enemy.x,enemy.y,enemy.z??0);}
      l.position=plus(l.position,scale(l.p.velocity,rate));if(l.p.radialOffset)l.position=plus(l.position,direction(l.angle,l.p.radialOffset));
      if(l.state===3){if(l.age.current>=l.p.delay){l.age.set(0);l.state=4;}}
      else if(l.state===4){if(l.age.current<l.p.grow)l.width=div(mul(l.age.value,l.p.width),f32(l.p.grow));else{l.age.set(0);l.state=2;l.width=l.p.width;}}
      if(l.state===2&&l.age.current>=l.p.sustain){l.age.set(0);l.state=5;}
      if(l.state===5){if(l.age.current>=l.p.shrink)return false;l.width=sub(l.p.width,div(mul(l.age.value,l.p.width),f32(l.p.shrink)));}
    }else{
      if(l.live){for(let i=l.p.count-1;i>0;i--)l.samples![i]=cloneSample(l.samples![i-1]);const head=l.samples![0];head.speed=l.speed;head.velocity={...l.velocity};head.position=plus(head.position,l.velocity);head.angle=l.angle;}
      else if(!l.pausePath)this.samplePath(l);
      if(!advanceCurveBounds(l,rate))return false;
    }return true;
  }
  segments(l: TouhouLaser): TouhouLaserCollisionSegment[]{return getTouhouLaserCollisionSegments(l);}
  collision(l: TouhouLaser,preview: boolean=false): void{
    if(l.animation)l.animation.flashColor=null;
    const result=updateTouhouLaserCollision(l,this.player,this.context,{preview,
      onHit:()=>this.cancelOne(l,{x:this.player!.x,y:this.player!.y},32,32,0,false,true)});
    if(l.animation)l.animation.flashColor=result.flashColor;
  }
  update(player: TouhouLaserCollisionPlayer | null=null,context: TouhouLaserContext={}): this{
    this.player=player;this.context=context;if(context.paused||context.freezeBullets)return this;
    const rate=f32(context.clockScale??1),priorEffects=this.effects.slice();
    for(const l of this.lasers.slice()){
      if(!l.alive)continue;if(l.killPending||l.state===1){this.retire(l);continue;}
      if(l.driven?l.kind===2&&l.autoBounds&&!advanceCurveBounds(l,rate):!this.advance(l,rate)){this.retire(l);continue;}
      if(l.collisionEnabled!==false)this.collision(l);
      else{l.flashColor=null;if(l.animation)l.animation.flashColor=null;}
      if(l.animation&&l.kind!==2){const sprite=this.bank!.data.sprites[l.animation.spriteIndex];l.animation.scaleX=div(l.width,sprite?.width??l.animation.width);l.animation.scaleY=div(l.length,sprite?.height??l.animation.height);l.animation.flag(4,4);}
      l.animation?.update();if(l.kind===2||l.travel===0)l.origin?.update();l.tip?.update();
      if(l.kind===0)l.time.tick(rate);else if(l.kind===2)l.time.add(mul(l.scale1,l.scale2),rate);
      l.age.tick(rate);l.updated=true;
    }
    for(const effect of priorEffects)effect.update();this.effects=this.effects.filter(e=>e.alive);this.lasers=this.lasers.filter(l=>l.alive);this.bank?.collect?.();return this;
  }
  effect(l: TouhouLaserCollisionState,p: {x:number;y:number;z?:number},circle: boolean=false): void{if(!this.bank)return;const type=l.p.type;let script;if(l.kind===2||type<18||type===34||type===38)script=l.p.color*2+0xd4;else if(type<(circle?32:31)||l.kind===1&&type<32)script=l.p.color*2+0x104;else if(type<34)script=l.p.color*2+0x11c;else return;const vm=this.bank.create(script,{x:p.x,y:p.y,z:p.z??0});this.effects.push(vm);this.context.onLaserCancelEffect?.(l,vm);}
  cancelOne(l: TouhouLaser,center:Vector,width:number,height:number,angle: number,circle:boolean,check:boolean){
    return cancelTouhouLaser(l,center,width,height,angle,circle,{check,world:l.world,clockScale:this.context.clockScale??1,
      onEffect:(laser,p,isCircle)=>this.effect(laser,p,isCircle),onCancel:count=>{this.cancelCounter+=count;},
      onSpawnStraight:p=>this.spawnStraight({...p,world:l.world,bounds:undefined,autoBounds:l.p.autoBounds??this.autoBounds}),onSpawnCurve:p=>this.spawnCurve({...p,world:l.world,bounds:undefined,autoBounds:l.p.autoBounds??this.autoBounds})});
  }
  cancelCircle(x: number,y: number,radius: number,{check=true}: {check?:boolean}={}): number{let count=0;for(const l of this.lasers.slice())if(l.alive&&l.state!==1)count+=this.cancelOne(l,vector(x,y),radius,0,0,true,check);return count;}
  cancelRectangle(x: number,y: number,width: number,height: number,angle: number=0,{check=true}: {check?:boolean}={}): number{let count=0;for(const l of this.lasers.slice())if(l.alive&&l.state!==1&&l.updated)count+=this.cancelOne(l,vector(x,y),width,height,angle,false,check);return count;}
  erase(l: TouhouLaser,options: {check?:boolean}={}): number{return eraseTouhouLaser(l,{world:l.world??this.world,...options,onEffect:(laser,p,circle)=>this.effect(laser,p,circle)});}
  drawCurve(l: TouhouLaser,draw:DrawList,view:AnmView){
    if(!this.bank)return draw;
    if(l.p.count<2){const p=l.samples![0]?.position??l.position;l.origin!.F(0x2c,p.x);l.origin!.F(0x30,p.y);l.origin!.draw(draw,view);return draw;}
    const vm=l.animation!,uv=anmSpriteVertices(vm,{x:0,y:0,scale:1}),vertices:[number,number,number,number,number][]=[],indices:number[]=[];let u=0;const halfPi=div(PI,2);
    for(let i=0;i<l.p.count;i++){const s=l.samples![i];for(let side=0;side<2;side++){let a=wrapAngle(side?sub(s.angle,halfPi):add(halfPi,s.angle));if(i){const prior=wrapAngle(side?sub(l.samples![i-1].angle,halfPi):add(halfPi,l.samples![i-1].angle));a=wrapAngle(add(a,wrapAngle(div(wrapAngle(angleDifference(prior,a)),2))));}const p=plus(s.position,direction(a,mul(l.p.width,.5)));vertices.push([add(view.x??0,mul(p.x,view.scale??1)),add(view.y??0,mul(p.y,view.scale??1)),u,uv[side*2][3],0xffffffff]);}if(i)indices.push((i-1)*2,(i-1)*2+1,i*2,(i-1)*2+1,i*2+1,i*2);u=add(div(1,f32(l.p.count-1)),u);}
    const texture=this.bank.textureFor(vm.spriteIndex),blend=sourceBlend[vm.B(0x499)];if(!blend)throw new Error('Unsupported curve blend');draw.sampler(texture,'bilinear','wrap','wrap').blendFactors(...blend).mesh(texture,vertices,indices).blendEnd();
    if(l.time.current<=l.p.count){const p=l.samples![l.p.count-1].position;l.origin!.F(0x2c,p.x);l.origin!.F(0x30,p.y);l.origin!.draw(draw,view);}
  }
  draw(draw: DrawList,view: {x:number;y:number;scale:number}=viewDefault,{effects=true}={}): DrawList{if(!this.bank)return draw;if(draw.enqueuePriority){draw.enqueuePriority(39,target=>this.draw(target,view,{effects:false}));for(const effect of this.effects)effect.draw(draw,view);return draw;}for(const l of this.lasers){if(!l.alive||l.state===1)continue;if(l.kind===2){this.drawCurve(l,draw,view);continue;}const vm=l.animation!;vm.F(0x2c,l.position.x);vm.F(0x30,l.position.y);vm.F(0x34,l.position.z);vm.rotation=wrapAngle(add(l.angle,div(PI,2)));vm.flag(2,2);vm.draw(draw,view);
      if(l.tip){const p=plus(l.position,direction(l.angle,l.length));l.tip.F(0x2c,p.x);l.tip.F(0x30,p.y);l.tip.draw(draw,view);}if(!l.travel){l.origin!.F(0x2c,l.position.x);l.origin!.F(0x30,l.position.y);l.origin!.draw(draw,view);}}
    if(effects)for(const effect of this.effects)effect.draw(draw,view);return draw;
  }
  snapshot(): unknown{return {count:this.count,cancelCounter:this.cancelCounter,lasers:this.lasers.map(l=>({id:l.id,kind:l.kind,state:l.state,x:l.position.x,y:l.position.y,angle:l.angle,width:l.width,length:l.length,speed:l.speed,age:l.age.current,time:l.time.value,samples:l.samples?.map(s=>({x:s.position.x,y:s.position.y,angle:s.angle,speed:s.speed}))}))};}
}
