import test from 'node:test';
import assert from 'node:assert/strict';
import { artiaPhases } from '../games/rushboss/src/artia.js';

function context(difficulty=0){return{difficulty,state:{},boss:{x:0,y:100},player:{x:0,y:-200,moveSpeed:270,slowMoveSpeed:120},bullets:[],actors:[],lasers:[],effects:[],sounds:[],
  random:(min,max)=>(min+max)/2,randomInt:(min,max)=>Math.floor((min+max)/2),
  vec:(angle,length)=>({x:Math.cos(angle)*length,y:Math.sin(angle)*length}),angle:(a,b)=>Math.atan2(b.y-a.y,b.x-a.x),
  moveBoss(p){this.boss.x=p.x;this.boss.y=p.y;},sound(key){this.sounds.push(key);},clear(){},
  actor(opts){const a={x:0,y:0,frame:0,alive:true,...opts,kill(){this.alive=false;}};this.actors.push(a);return a;},
  effect(kind,pos,opts){const e={kind,pos:{...pos},opts,kill(){}};this.effects.push(e);return e;},
  spawn(kind,pos,v,color,opts={}){const b={x:pos.x,y:pos.y,vx:v.x,vy:v.y,fx:0,fy:0,color,kind,frame:0,alive:true,...opts,kill(){this.alive=false;}};this.bullets.push(b);return b;},
  laser(pos,angle,color,opts){const b={x:pos.x,y:pos.y,angle,color,frame:0,alive:true,...opts,kill(){this.alive=false;}};this.lasers.push(b);return b;}};}
function at(number,to,difficulty=0){const p=artiaPhases[number-1],c=context(difficulty);p.init(c);for(let i=1;i<=to;i++)p.update(c,i);return c;}
function actorTo(c,a,to){while(a.alive&&a.frame<to){a.frame++;a.update(c,a);}}
function bulletFrame(c,b,frame){b.frame=frame;b.onUpdate?.(c,b);}
const near=(value,expected,tolerance=1e-3)=>assert.ok(Math.abs(value-expected)<tolerance,`${value} != ${expected}`);

test('Artia ice seal keeps the source 14 by 24 initial rings and both 60-frame fence writers',()=>{
  const c=at(2,190,3);assert.equal(c.bullets.length,14*24);assert.equal(c.actors.length,2);
  near(Math.hypot(c.bullets[0].vx,c.bullets[0].vy),Math.sqrt(4000));
  near(Math.hypot(c.bullets[0].fx,c.bullets[0].fy),150);bulletFrame(c,c.bullets[0],90);
  near(Math.hypot(c.bullets[0].fx,c.bullets[0].fy),75);
  for(const a of c.actors)actorTo(c,a,60);
  const fence=c.bullets.slice(14*24);assert.equal(fence.length,2*60*6);
  near(fence[0].x,-810+500/60+1120/7);assert.equal(fence[0].cleanOnHit,false);assert.equal(fence[0].cleanOnBomb,false);
  bulletFrame(c,fence[0],300);assert.equal(fence[0].drag,.2);near(Math.hypot(fence[0].fx,fence[0].fy),50);
  const volleys=at(2,370,3).bullets.filter(b=>b.kind==='ZhaDan');assert.equal(volleys.length,3*7*40);
  near(Math.hypot(volleys[0].fx,volleys[0].fy),120);assert.equal(volleys[0].outOfRangeTolerance,80);
});

test('Artia flowing stars preserve 120-frame shooters, opposite turns and the straight-laser width window',()=>{
  const c=at(6,230,3);assert.equal(c.actors.length,2);assert.equal(c.lasers.filter(b=>b.curve).length,48);
  for(const a of c.actors)actorTo(c,a,120);
  const large=c.bullets.filter(b=>b.kind==='XingDanL');assert.equal(large.length,120);
  const a=large[0];bulletFrame(c,a,30);near(Math.hypot(a.fx,a.fy),220);bulletFrame(c,a,120);
  assert.deepEqual([a.fx,a.fy,a.drag],[0,0,0]);
  const straight=c.lasers.find(b=>!b.curve);for(let frame=1;frame<=80;frame++)bulletFrame(c,straight,frame);
  assert.equal(straight.width,32);assert.equal(straight.checking,true);
  for(let frame=81;frame<=160;frame++)bulletFrame(c,straight,frame);
  assert.equal(straight.width,2);assert.equal(straight.alive,false);
});

test('Artia prism has three expanding triangles with eighteen beams and two curves per ray controller',()=>{
  const c=at(8,135,3);assert.equal(c.actors.length,3);assert.equal(c.bullets.length,9);assert.equal(c.lasers.length,18);
  for(const a of c.actors)actorTo(c,a,120);
  assert.ok(c.lasers.every(b=>b.width===20));near(c.lasers[0].length,Math.sqrt(3)*60);
  const c2=at(8,560,3),rays=c2.actors.slice(-12);for(const a of rays)actorTo(c2,a,30);
  const curves=c2.lasers.filter(b=>b.curve);assert.equal(curves.length,24);assert.ok(curves.every(b=>b.width===8&&b.delay===15));
  for(const b of curves)bulletFrame(c2,b,1);near(Math.hypot(curves[0].vx,curves[0].vy),350);
  const c3=at(8,860);assert.equal(c3.state.clock,180);
});

test('Artia ancient frost retains six fog batches, inherited needle counters and four paired corner rings',()=>{
  const c=at(12,155,3);assert.equal(c.state.fogs.length,36);near(Math.hypot(c.state.fogs[24].vx,c.state.fogs[24].vy),84);
  const spoke=c.actors.find(a=>a.visualKind!=='freezingFog');actorTo(c,spoke,25);
  const rays=c.bullets.filter(b=>b.kind==='ZhenDan');assert.equal(rays.length,24*48);
  const first=rays[0];bulletFrame(c,first,33);assert.equal(first.fx,0);bulletFrame(c,first,34);near(Math.hypot(first.fx,first.fy),180);
  const last=rays.at(-1);bulletFrame(c,last,11);near(Math.hypot(last.fx,last.fy),180);
  const c2=at(12,660,3);assert.equal(c2.state.fogs.length,72);
  assert.equal(c2.bullets.filter(b=>b.color===4).length,3*2*48);
  assert.equal(c2.bullets.filter(b=>b.color===6).length,4*2*24);
  const orbit=c2.actors.at(-1);actorTo(c2,orbit,120);assert.equal(c2.bullets.filter(b=>b.kind==='HuanYu').length,40*6);
  // Source timers and frozen player speeds are restored when leaving this card.
  const fog=c.state.fogs[0];fog.x=0;fog.y=-200;actorTo(c,fog,128);near(c.player.moveSpeed,150);
  artiaPhases[11].end(c);assert.equal(c.player.moveSpeed,270);assert.equal(c.player.slowMoveSpeed,120);
});

test('Artia final card retains radial force170, inclusive grid frame601 and integer first fire frame13',()=>{
  const c=at(13,150,3);assert.equal(c.lasers.filter(b=>b.curve).length,72);assert.equal(c.lasers.filter(b=>!b.curve).length,24);
  const curve=c.lasers.find(b=>b.curve);bulletFrame(c,curve,1);near(Math.hypot(curve.fx,curve.fy),170);
  const grid=at(13,1215,3),writers=grid.actors.slice(-2),before=grid.lasers.length;
  for(const a of writers)actorTo(grid,a,601);assert.equal(grid.lasers.length-before,2*11*7);
  const final=at(13,1965,3),writer=final.actors.at(-1);actorTo(final,writer,12);assert.equal(final.bullets.length,0);
  actorTo(final,writer,13);assert.equal(final.bullets.length,15);near(Math.hypot(final.bullets[0].vx,final.bullets[0].vy),120);
  actorTo(final,writer,30);const child=final.actors.at(-1),prior=final.bullets.length;actorTo(final,child,8);
  assert.equal(final.bullets.length-prior,8*12);assert.equal(child.alive,false);assert.equal(artiaPhases[12].survival,true);
});
