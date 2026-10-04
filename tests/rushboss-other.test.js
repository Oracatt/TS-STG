import test from 'node:test';
import assert from 'node:assert/strict';
import { sunnyPhases } from '../games/rushboss/src/sunny.js';
import { monstonePhases } from '../games/rushboss/src/monstone.js';

// Instrument the script boundary, leaving fog/physics to separate runtime tests.
function context(difficulty=0) {
  const c={difficulty,state:{},boss:{x:0,y:100,moving:false},player:{x:0,y:-200},bullets:[],actors:[],lasers:[],moves:[],effects:[],sounds:[],
    random:(min,max)=>(min+max)/2,randomInt:(min,max)=>Math.floor((min+max)/2),
    vec:(angle,length)=>({x:Math.cos(angle)*length,y:Math.sin(angle)*length}),angle:(a,b)=>Math.atan2(b.y-a.y,b.x-a.x),
    moveBoss(p,speed,min){this.moves.push({p:{...p},speed,min});this.boss.x=p.x;this.boss.y=p.y;},
    effect(kind,p,opts){this.effects.push({kind,p:{...p},opts});return{kill(){}};},sound(key){this.sounds.push(key);},clear(){},
    spawn(kind,p,v,color=0,opts={}){const b={x:p.x,y:p.y,vx:v.x,vy:v.y,fx:0,fy:0,color,kind,frame:0,delay:15,alive:true,...opts,kill(){this.alive=false;}};opts.setup?.(this,b);this.bullets.push(b);return b;},
    actor(opts){const a={x:0,y:0,frame:0,alive:true,...opts,kill(){this.alive=false;}};this.actors.push(a);return a;},
    laser(p,angle,color,opts){const b={x:p.x,y:p.y,angle,color,frame:0,alive:true,...opts,kill(){this.alive=false;}};this.lasers.push(b);return b;},
    ring(kind,n,p,speed,angle=0,offset=0,color=0,opts={}){return Array.from({length:n},(_,i)=>{const a=angle+i*Math.PI*2/n,o=this.vec(a,offset);return this.spawn(kind,{x:p.x+o.x,y:p.y+o.y},this.vec(a,speed),color,opts);});},
    fan(kind,n,p,speed,angle,delta=0,offset=0,color=0,opts={}){return Array.from({length:n},(_,i)=>{const a=angle-(n-1)*delta/2+i*delta,o=this.vec(a,offset);return this.spawn(kind,{x:p.x+o.x,y:p.y+o.y},this.vec(a,speed),color,opts);});}
  };return c;
}
function phaseAt(phase,frame,difficulty=0){const c=context(difficulty);phase.init(c);for(let i=1;i<=frame;i++)phase.update(c,i);return c;}
function updateActor(c,a,to){while(a.alive&&a.frame<to){a.frame++;a.update(c,a);}}
function bulletAt(c,b,frame){b.frame=frame;b.onUpdate?.(c,b);}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-4,`${actual} != ${expected}`);

test('sixteen phases use original-game HP and retain Rush seconds, card IDs, bonuses and survival flag',()=>{
  assert.deepEqual(sunnyPhases.map(p=>[p.hp,p.time,p.cardId,p.bonus,p.survival]),[
    [20000,40,-1,0,false],[3000,40,1,2500000,false],[20000,42,-1,0,false],[3200,41,2,3200000,false],
    [19800,40,-1,0,false],[3400,46,3,3500000,false],[3400,60,4,4000000,false]]);
  assert.deepEqual(monstonePhases.map(p=>[p.hp,p.time,p.cardId,p.bonus,p.survival]),[
    [20000,36,-1,0,false],[2800,40,5,3200000,false],[20000,39,-1,0,false],[2800,44,6,3200000,false],
    [20300,45,-1,0,false],[2500,48,7,3600000,false],[20300,44,-1,0,false],[3200,40,8,4000000,true],[4300,55,9,4500000,false]]);
  assert.deepEqual([...sunnyPhases,...monstonePhases].filter(p=>p.final).map(p=>p.key),['SunnyMilk_SC_7','Monstone_SC_9']);
});

test('Sunny first nonspell emits every shooter frame including the final frame, then retains source reset',()=>{
  for(const [d,count,frames] of [[0,6,18],[3,12,24]]){
    const c=phaseAt(sunnyPhases[0],75,d);assert.equal(c.actors.length,1);updateActor(c,c.actors[0],frames+1);
    assert.equal(c.bullets.length,count*frames);assert.equal(c.actors[0].frame,frames);assert.equal(c.actors[0].alive,false);
    near(Math.hypot(c.bullets[0].vx,c.bullets[0].vy),(.7+.1*d)*41);
  }
  const c=phaseAt(sunnyPhases[0],140);assert.equal(c.state.tick,0);assert.equal(c.state.moveStep,1);
});

test('Sunny fire spirit retains 65-frame shooter cadence and one reflection including corners',()=>{
  const c=phaseAt(sunnyPhases[1],25);updateActor(c,c.actors[0],64);assert.equal(c.bullets.length,0);
  updateActor(c,c.actors[0],65);assert.equal(c.bullets.length,7*8+5);
  const b=c.bullets.find(b=>b.kind==='YanDan');b.x=-321;b.y=241;b.vx=-10;b.vy=12;bulletAt(c,b,1);
  assert.deepEqual([b.vx,b.vy,b.color,b.bounced],[10,-12,3,true]);b.x=321;bulletAt(c,b,2);assert.equal(b.vx,10);
});

test('Sunny second nonspell has 30 needle rings, a ten-frame gap, and 30 flame frames',()=>{
  const c=phaseAt(sunnyPhases[2],75);updateActor(c,c.actors[0],190);
  assert.equal(c.bullets.filter(b=>b.kind==='ZhenDan').length,30*8);
  assert.equal(c.bullets.filter(b=>b.kind==='YanDan').length,30);
  assert.equal(c.actors[0].alive,false);
});

test('Sunny triangle moves on movement completion, and its orb uses a carried frame counter',()=>{
  const c=phaseAt(sunnyPhases[3],100,2);assert.deepEqual(c.moves.at(-1),{p:{x:100,y:-20},speed:120,min:120});
  const b=c.bullets.find(b=>b.kind==='GuangYuL');assert.equal(b.localFrame,-260);
  const before=c.bullets.length;b.localFrame=59;bulletAt(c,b,1);
  assert.equal(c.bullets.length-before,6);assert.equal(b.alive,false);
  sunnyPhases[3].update(c,101);sunnyPhases[3].update(c,102);sunnyPhases[3].update(c,103);
  assert.equal(c.state.tick,1000);assert.equal(c.state.position,4);
});

test('Sunny third nonspell preserves paired needle turns and simultaneous 24-frame flame rings',()=>{
  const c=phaseAt(sunnyPhases[4],75,3);updateActor(c,c.actors[0],144);
  const needles=c.bullets.filter(b=>b.kind==='ZhenDan');assert.equal(needles.length,18*4*2);
  const b=needles[0];near(b.angle,-Math.PI/6);near(b.dangle,Math.PI/6);
  bulletAt(c,b,60);near(Math.hypot(b.vx,b.vy),200);near(Math.hypot(b.fx,b.fy),300);assert.equal(b.drag,1);
  assert.equal(c.bullets.filter(b=>b.kind==='YanDan').length,6*24);
});

test('Sunny aurora keeps accelerated curve heads and wall-triggered reverse streams',()=>{
  const c=phaseAt(sunnyPhases[5],75,3);assert.equal(c.lasers.length,10);assert.equal(c.bullets.length,10);
  assert.equal(c.lasers[0].curve,60);assert.equal(c.lasers[0].delay,15);near(Math.hypot(c.lasers[0].fx,c.lasers[0].fy),100);
  const b=c.bullets[0];b.x=321;bulletAt(c,b,1);assert.equal(b.alive,false);assert.equal(c.actors.at(-1).angle,Math.PI);
  updateActor(c,c.actors.at(-1),40);assert.equal(c.bullets.length,10+39);
});

test('Sunny final laser creates walls at frame 40 and exact active width window',()=>{
  const c=phaseAt(sunnyPhases[6],200);assert.equal(c.actors.length,2);assert.equal(c.lasers.length,1);
  const b=c.lasers[0];assert.equal(b.delay,0);assert.equal(b.fogFrames,120);
  for(let frame=1;frame<=60;frame++)bulletAt(c,b,frame);
  assert.equal(c.actors.length,4);assert.equal(b.width,32);assert.equal(b.checking,true);
  for(let frame=61;frame<=140;frame++)bulletAt(c,b,frame);
  assert.equal(b.width,2);assert.equal(b.checking,false);assert.equal(b.alive,false);
  const wall=c.actors[2];updateActor(c,wall,1);assert.equal(c.bullets.length,20);
});

test('Monstone first nonspell uses two or four shooters and frame-45 rice turns',()=>{
  for(const[d,n,cadence]of[[0,2,3],[1,2,2],[2,4,3],[3,4,2]]){
    const c=phaseAt(monstonePhases[0],75,d);assert.equal(c.actors.length,n);
    for(const a of c.actors)updateActor(c,a,cadence);assert.equal(c.bullets.length,n);
    const b=c.bullets[0];bulletAt(c,b,45);near(Math.hypot(b.vx,b.vy),70+10*d);near(Math.atan2(b.vy,b.vx),-.5);
  }
});

test('Monstone fragments retain two successive 60-frame split generations',()=>{
  const c=phaseAt(monstonePhases[1],75);assert.equal(c.bullets.length,6);
  for(const b of [...c.bullets])bulletAt(c,b,60);
  const small=c.bullets.filter(b=>b.kind==='XiaoYu');assert.equal(small.length,36);
  for(const b of small)bulletAt(c,b,60);
  assert.equal(c.bullets.filter(b=>b.kind==='DianDan').length,216);
  assert.equal(c.bullets.filter(b=>b.alive).length,216);
});

test('Monstone second nonspell starts two orbit shooters and slows middle orbs on 22+d',()=>{
  const c=phaseAt(monstonePhases[2],100,3);assert.equal(c.actors.length,2);assert.equal(c.bullets.length,24);
  const b=c.bullets[0];bulletAt(c,b,24);near(Math.hypot(b.vx,b.vy),500);bulletAt(c,b,25);near(Math.hypot(b.vx,b.vy),75);
  updateActor(c,c.actors[0],3);assert.equal(c.bullets.filter(b=>b.kind==='MiDan').length,2);
});

test('Monstone strength shooters preserve force quarter-turn and delayed stationary bullets',()=>{
  const c=phaseAt(monstonePhases[3],100);assert.equal(c.actors.length,6);
  const a=c.actors[0];updateActor(c,a,6);near(Math.hypot(a.fx,a.fy),300);
  assert.equal(c.bullets.length,1);const b=c.bullets[0];assert.equal(b.vx,0);assert.equal(b.vy,0);
  bulletAt(c,b,60);near(Math.hypot(b.fx,b.fy),50);assert.equal(b.drag,.4);
});

test('Monstone third nonspell preserves doubled zero-offset ring and quarter-period speed profile',()=>{
  const c=phaseAt(monstonePhases[4],75);updateActor(c,c.actors[0],81);
  assert.equal(c.bullets.filter(b=>b.color===13).length,3*8*8);
  const profile=c.bullets.filter(b=>b.color===6);assert.equal(profile.length,24);
  near(Math.hypot(profile[0].vx,profile[0].vy),.7*97.5);near(Math.hypot(profile[3].vx,profile[3].vy),.7*60);
});

test('Monstone break sky begins with three accelerated orbs and keeps four rock launches',()=>{
  const c=phaseAt(monstonePhases[5],80,2);assert.equal(c.bullets.length,3);assert.deepEqual(c.bullets.map(b=>b.vx),[-150,-30,90]);
  assert.ok(c.bullets.every(b=>b.fy===150));const b=c.bullets[0];b.y=241;bulletAt(c,b,1);
  assert.equal(c.actors.length,1);updateActor(c,c.actors[0],78);assert.equal(c.bullets.filter(b=>b.kind==='XiaoYu').length,39);
  const c2=phaseAt(monstonePhases[5],400);const shooter=c2.actors.at(-1);updateActor(c2,shooter,41);
  const stones=c2.bullets.filter(b=>b.onUpdate?.name==='rockBurst');
  assert.equal(stones.length,5);
  const rock=stones.at(-1),old=c2.bullets.length;bulletAt(c2,rock,90);assert.equal(c2.bullets.length-old,12);
});

test('Monstone fourth nonspell preserves paired six-rings and frame-60 force changes',()=>{
  const c=phaseAt(monstonePhases[6],75,3);updateActor(c,c.actors[0],4);assert.equal(c.bullets.length,12);
  const b=c.bullets[0];bulletAt(c,b,59);near(Math.hypot(b.vx,b.vy),475);bulletAt(c,b,60);
  near(Math.hypot(b.vx,b.vy),62);near(Math.hypot(b.fx,b.fy),62);assert.equal(b.color,6);
});

test('Monstone survival ghosts retain four independent emitters and radius growth clocks',()=>{
  const c=phaseAt(monstonePhases[7],75,0);assert.equal(c.bullets.length,4);assert.equal(c.effects.filter(e=>e.kind==='shadow').length,2);
  for(const b of [...c.bullets])bulletAt(c,b,120);
  bulletAt(c,c.bullets[2],126);
  assert.equal(c.bullets.filter(b=>b.kind==='MiDan').length,7);assert.equal(c.bullets.filter(b=>b.kind==='XiaoYu').length,1);
  const ghost=c.bullets[0];bulletAt(c,ghost,900);assert.equal(ghost.targetLength,150);bulletAt(c,ghost,1800);assert.equal(ghost.targetLength,200);
  assert.ok(c.bullets.filter(b=>b.kind!=='Monstone').every(b=>b.shadowInterval===2&&b.shadowAlpha===.5));
});

test('Monstone final dash retains source speed endpoints, impact counts and inclusive rain endframe',()=>{
  const c=phaseAt(monstonePhases[8],75,3),a=c.actors[0];updateActor(c,a,175);
  assert.equal(c.bullets.length,144);assert.deepEqual(c.moves.at(-1),{p:{x:0,y:-220},speed:700,min:1400});
  assert.equal(c.effects.at(-1).kind,'shake');updateActor(c,a,300);
  assert.equal(c.bullets.filter(b=>b.kind==='XiaoYu'&&b.cleanOnHit===false).length,21*4);
  assert.equal(a.alive,false);
});
