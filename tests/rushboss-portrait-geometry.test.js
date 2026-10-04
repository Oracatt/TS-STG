import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SaveStore} from '@ts-stg/thlib';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {createRushPortraitGame} from '../games/rushboss/src/portrait-application.js';
import {sunnyPhases} from '../games/rushboss/src/sunny.js';
import {artiaPhases} from '../games/rushboss/src/artia.js';

const near=(actual,expected,tolerance=1e-4)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const tick=(battle,n)=>{for(let i=0;i<n;i++)battle.update();};
function create(phases,index,difficulty=3){return new RushBattle(phases,{profile:'portrait',boss:phases===sunnyPhases?'sunny':'artia',difficulty,practice:true,spellIndex:index,invincible:true});}
function record(battle,method,filter=()=>true){
  const result=[],original=battle[method];
  battle[method]=function(...args){const entity=original.apply(this,args);if(filter(entity))result.push({...entity,emitted:this.frame});return entity;};
  return result;
}

test('portrait Sunny flames reflect at the actual corner on both axes exactly once',()=>{
  const b=create(sunnyPhases,1);tick(b,75);
  const flame=[...b.world.entities,...b.world.pending].find(entity=>entity.kind==='YanDan');assert.ok(flame);
  Object.assign(flame,{x:193,y:225,vx:80,vy:60});flame.onUpdate(b,flame);
  assert.deepEqual([flame.vx,flame.vy,flame.color,flame.bounced],[-80,-60,3,true]);
  Object.assign(flame,{x:-193,y:-225});flame.onUpdate(b,flame);
  assert.deepEqual([flame.vx,flame.vy],[-80,-60]);b.dispose();
});

test('portrait ice fences keep both 45 degree diagonals, mirror symmetry and full-height coverage',()=>{
  for(const difficulty of [0,3]){
    const b=create(artiaPhases,1,difficulty),samples=record(b,'spawn',e=>e.kind==='ZhenDan'&&e.color===5);
    tick(b,250);const rows=samples.length/120;assert.ok(rows>=5&&rows<=6);
    const batches=Map.groupBy(samples,s=>s.emitted);assert.equal(batches.size,60);
    let prior=null;const all=[...batches.values()];
    for(const batch of all){
      assert.equal(batch.length,rows*2);
      for(let i=0;i<rows;i++){
        near(batch[i].x,-batch[i+rows].x);near(batch[i].y,batch[i+rows].y);
        if(prior){
          near(batch[i].x-prior[i].x,-(batch[i].y-prior[i].y));
          near(batch[i+rows].x-prior[i+rows].x,batch[i+rows].y-prior[i+rows].y);
        }
      }
      prior=batch;
    }
    assert.ok(all[0][0].y>224);assert.ok(all.at(-1)[0].y<-224);
    const visible=samples.filter(s=>Math.abs(s.x)<192&&Math.abs(s.y)<224);
    assert.ok(visible.some(s=>s.x<-180)&&visible.some(s=>s.x>180));
    assert.ok(visible.some(s=>s.y<-210)&&visible.some(s=>s.y>210));b.dispose();
  }
});

test('portrait rain spans the new field symmetrically while retaining source vertical speed',()=>{
  for(const difficulty of [0,1,2,3]){
    const b=create(artiaPhases,3,difficulty),rain=record(b,'spawn',e=>e.kind==='GuangYuL');tick(b,140);
    const xs=rain.map(e=>e.x).sort((a,c)=>a-c);assert.ok(xs.length>=6);
    near(xs[0],-176);near(xs.at(-1),176);
    for(let i=0;i<xs.length;i++){near(xs[i],-xs[xs.length-1-i]);if(i>1)near(xs[i]-xs[i-1],xs[1]-xs[0]);}
    assert.ok(rain.every(e=>e.y===224&&e.vx===0&&e.vy===-300));b.dispose();
  }
});

test('portrait survival grid samples every horizontal and vertical lane inside the new edges',()=>{
  for(const difficulty of [0,3]){
    const b=create(artiaPhases,12,difficulty),beams=record(b,'laser');
    b.state.clock=1214;b.phaseFrame=1214;tick(b,2);
    const horizontal=beams.filter(e=>e.angle===0),vertical=beams.filter(e=>e.angle!==0),count=4+difficulty;
    assert.equal(horizontal.length,count);assert.equal(vertical.length,count);
    for(let i=0;i<count;i++){
      const h=horizontal[i],v=vertical[i];
      assert.ok(h.y>=-224+448*i/count&&h.y<-224+448*(i+1)/count);
      assert.ok(v.x>=-192+384*i/count&&v.x<-192+384*(i+1)/count);
      assert.ok(h.x<-192&&h.x+Math.cos(h.angle)*h.length>192);
      assert.ok(v.y>224&&v.y+Math.sin(v.angle)*v.length<-224);
    }
    b.dispose();
  }
});

test('portrait graphics submits the public laser field once, with one continuous source mesh per curve',{
  skip:!fs.existsSync('packages/thlib/assets/touhou-common/manifest.json')||!fs.existsSync('games/rushboss/assets/portrait/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1',
},()=>{
  let id=0;
  const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>++id,unloadTexture(){},
    createRenderTarget:()=>++id,createTexture:()=>++id,loadMusic:()=>++id};
  const app=createRushPortraitGame(host,{startBoss:'sunny',mode:'stage',character:0,invincible:true,skipDialogue:true,store:new SaveStore(),
    createBattle:(phases,options)=>new RushBattle(phases.map(p=>({...p,init(){},update(){},end(){}})),options)});
  try{
    for(let frame=0;frame<130;frame++)app.update(0);
    const battle=app.battle,straight=battle.laser({x:-60,y:20},.71,0,{length:120,width:5});
    const head=battle.laser({x:-80,y:60},0,0,{curve:true,width:8,vx:480,vy:0});
    for(let i=0;i<8;i++){head.x=-80+i*8;battle.addLaserPart(head);}
    battle.projectiles.updateLasers();
    const field=battle.projectiles.debris,curve=battle.projectiles.lasers.get(head);
    assert.equal(field.lasers.filter(l=>l.driven).length,2);assert.equal(curve.p.count,90);
    assert.equal(curve.samples.filter(sample=>sample.actor).length,8);
    const framesBefore=field.lasers.map(l=>l.animation.time),meshes=[];
    const drawCurve=field.drawCurve.bind(field);field.drawCurve=(l,draw,view)=>{
      const start=draw.commands.length;drawCurve(l,draw,view);
      meshes.push(...draw.commands.slice(start).filter(c=>c[0]==='mesh'));
    };
    const entity=app.graphics.entity.bind(app.graphics);
    app.graphics.entity=(draw,actor,...args)=>{
      assert.notEqual(actor.kind,'laser','portrait does not use Rush beam quads');
      assert.notEqual(actor.visualKind,'laserPart','curve segments only supply the public sample path');
      return entity(draw,actor,...args);
    };
    app.render();app.render();
    assert.equal(meshes.length,2,'exactly one public curve mesh per render');
    for(const mesh of meshes){
      assert.equal(mesh[2].length,180);assert.equal(mesh[3].length,534);
      for(let i=0;i<90;i++){
        const a=mesh[2][i*2],b=mesh[2][i*2+1],sample=curve.samples[i].position;
        near((a[0]+b[0])/2,336+sample.x*1.5);near((a[1]+b[1])/2,24+sample.y*1.5);
        near(Math.hypot(a[0]-b[0],a[1]-b[1]),12);
      }
    }
    assert.deepEqual(field.lasers.map(l=>l.animation.time),framesBefore,'rendering does not advance original laser ANMs');
    const mid={x:straight.x+Math.cos(straight.angle)*60,y:straight.y+Math.sin(straight.angle)*60};
    assert.equal(battle.intersectsBullet(straight,0,mid),true);
  }finally{app.destroy();}
});
