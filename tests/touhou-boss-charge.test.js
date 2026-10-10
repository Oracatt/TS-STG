import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank,TouhouBossCharge,TouhouBossPresentation,TOUHOU_BOSS_CHARGE_PRESETS,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {DrawList} from '@ts-stg/thlib';
import {assertRenderScopes} from './fixtures/render-scopes.js';

const read=root=>JSON.parse(fs.readFileSync(new URL(`${root}/anm/effect.json`,import.meta.url),'utf8'));
const hasReference=fs.existsSync(new URL('../games/demo/assets/anm/effect.json',import.meta.url)); // private local reference assets, absent in a clean checkout
const source=hasReference?read('../games/demo/assets'):null,common=read('../packages/thlib/assets/touhou-common');
const makeBank=data=>new AnmBank(data,{loadTexture:()=>17});
const view={x:336,y:24,scale:1.5,screenScale:1};
function capture(charge){
  const queue=new TouhouRenderQueue(),draw=new DrawList();charge.draw(queue,view);
  const priorities=queue.entries.map(entry=>entry.priority);queue.flush(draw);assertRenderScopes(draw.commands);
  return{commands:draw.commands,priorities,roots:charge.roots.map(vm=>vm.snapshot())};
}
const projectCenter=command=>{const m=command[4];return{x:(m[12]/m[15]+1)*480,y:(1-m[13]/m[15])*360};};

test('all attack-charge presets retain source circle and inward/outward particle instructions',{skip:!hasReference},()=>{
  for(const {chargeScript,releaseScript}of Object.values(TOUHOU_BOSS_CHARGE_PRESETS)){
    for(const script of [chargeScript,chargeScript-1,releaseScript,releaseScript-1,62,77])
      assert.deepEqual(common.scripts[script].instructions,source.scripts[script].instructions,`source effect:${script}`);
    assert.equal(common.scripts[chargeScript].instructions.find(i=>i.opcode===500).args[0],chargeScript-1);
    assert.equal(common.scripts[chargeScript].instructions.filter(i=>i.opcode===500)[1].args[0],62);
    assert.equal(common.scripts[releaseScript].instructions.filter(i=>i.opcode===500)[1].args[0],77);
    assert.ok(!common.scripts[chargeScript].instructions.some(i=>i.opcode===508),'Entry Point callback must not replace attack charge');
  }
});

test('public attack charge exactly submits independently scheduled source ECL307 cohorts at early/middle/release/exit frames',{skip:!hasReference},()=>{
  for(const color of Object.keys(TOUHOU_BOSS_CHARGE_PRESETS)){
    const actualBank=makeBank(common),expectedBank=makeBank(source),preset=TOUHOU_BOSS_CHARGE_PRESETS[color];
    const actual=new TouhouBossCharge(actualBank,{x:40,y:128,color,releaseColor:color});
    const expected={roots:[expectedBank.create(preset.chargeScript,{x:40,y:128,front:true})],draw(draw,v){for(const vm of this.roots)vm.draw(draw,v);}};
    for(let frame=1;frame<=160;frame++){
      // st01bs/st02bs Boss1: ECL307 birth, wait60, ECL307 release.
      if(frame===60)expected.roots.push(expectedBank.create(preset.releaseScript,{x:40,y:128,front:true}));
      expectedBank.update();expected.roots=expected.roots.filter(vm=>vm.alive);actual.update();
      if(![1,10,20,40,60,61,80,100,140,160].includes(frame))continue;
      assert.deepEqual(capture(actual),capture(expected),`${color} source draw frame${frame}`);
    }
    assert.equal(actual.alive,false);assert.equal(actual.roots.length,0);actual.destroy();actualBank.dispose();expectedBank.dispose();
  }
});

test('actual inward cohort shrinks around the Boss and projected particles reach it; release expands outward',()=>{
  const bank=makeBank(common),charge=new TouhouBossCharge(bank,{x:40,y:128});
  let firstParticle,startDistance,firstCircleRadius;
  const center={x:396,y:216};
  for(let frame=1;frame<=85;frame++){
    charge.update();const rendered=capture(charge);
    assert.ok(rendered.priorities.every(priority=>priority===49),'Source layer20 runs after warp/bullets, before Boss labels');
    if(frame===1){
      const ring=rendered.commands.find(c=>c[0]==='mesh'&&c[1]===0);assert.ok(ring);
      firstCircleRadius=Math.max(...ring[2].map(v=>Math.hypot(v[0]-center.x,v[1]-center.y)));
      assert.ok(firstCircleRadius>300,'Real shrinking circular gradient initially spans the playfield');
      assert.ok(ring[2].some(v=>(v[4]&255)>0),'Source ring alpha must be visibly nonzero');
      firstParticle=charge.roots[0].children.find(vm=>vm.scriptId===62);
      const mesh=rendered.commands.find(c=>c[0]==='mesh3d');assert.ok(mesh);
      const p=projectCenter(mesh);startDistance=Math.hypot(p.x-center.x,p.y-center.y);
      assert.ok(mesh[2].some(v=>(v[5]&255)>0),'Real particle alpha must be visibly nonzero');
    }
    if(frame===20){
      const ring=rendered.commands.find(c=>c[0]==='mesh'&&c[1]===0);assert.ok(ring);
      const radius=Math.max(...ring[2].map(v=>Math.hypot(v[0]-center.x,v[1]-center.y)));
      assert.ok(radius<firstCircleRadius*.6,'Original circle converges instead of growing like an entrance aura');
    }
    if(frame===39){
      const queue=new TouhouRenderQueue(),draw=new DrawList();firstParticle.draw(queue,view);queue.flush(draw);
      const mesh=draw.commands.find(c=>c[0]==='mesh3d');assert.ok(mesh);const p=projectCenter(mesh);
      assert.ok(Math.hypot(p.x-center.x,p.y-center.y)<startDistance*.01,'Source type8 particle reaches Boss center before fading');
    }
    if(frame===70){
      const release=charge.roots.find(vm=>vm.scriptId===89);assert.ok(release);
      assert.ok(release.children.some(vm=>vm.scriptId===77&&vm.alpha>0),'Release has distinct original outward particles');
    }
  }
  charge.destroy();bank.dispose();
});

test('spawn positions are fixed; later births sample follow once and stop leaves existing source particles alive',()=>{
  const bank=makeBank(common),follow={x:10,y:120},charge=new TouhouBossCharge(bank,{follow,repeatCount:2,releaseFrame:70});
  const first=charge.roots[0];follow.x=50;follow.y=180;
  for(let frame=0;frame<24;frame++)charge.update();
  assert.deepEqual([first.x,first.y],[10,120]);assert.deepEqual(charge.roots.map(vm=>[vm.x,vm.y]),[[10,120],[50,180]]);
  const particles=charge.roots.flatMap(vm=>vm.children);charge.stop();charge.update();assert.ok(particles.some(vm=>vm.alive));
  for(let frame=0;frame<160;frame++)charge.update();assert.equal(charge.alive,false);assert.equal(charge.released,false);
  assert.ok(particles.every(vm=>!vm.alive));charge.destroy();charge.destroy();bank.dispose();
});

test('Boss presentation owns reusable charges, pauses their clock, and keeps entry aura/rings independent',()=>{
  const readBank=name=>new AnmBank(JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url))),{loadTexture:()=>17});
  const banks={effect:readBank('effect'),front:readBank('front'),ascii_960:readBank('ascii_960')};
  const owner=new TouhouBossPresentation({banks}),boss={x:12,y:128,alive:true,hp:1000,maximumHp:1000};owner.enter(boss);
  const charge=owner.beginCharge();owner.update();assert.equal(charge.age,1);assert.deepEqual(owner.aura,[]);
  owner.startCombat();owner.setEffects({aura:true,distortion:true});owner.update();assert.deepEqual(owner.aura.map(vm=>vm.scriptId),[99,108]);
  const before=JSON.stringify(charge.snapshot());owner.update({paused:true});assert.equal(JSON.stringify(charge.snapshot()),before);
  owner.clearBoss();assert.equal(charge.alive,false,'Removing the Boss cancels attack preparation instead of leaking it into another encounter');
  owner.destroy();assert.equal(charge.alive,false);assert.equal(banks.effect.instances.filter(vm=>vm.alive).length,0);
  for(const bank of Object.values(banks))bank.dispose();
});

test('invalid Boss charge color, position and timeline fail before allocating source roots',()=>{
  const bank=makeBank(common);
  for(const options of [{color:'pink'},{color:'constructor'},{releaseColor:'toString'},{x:NaN},{repeatCount:0},{repeatInterval:0},{repeatCount:4,releaseFrame:60}])
    assert.throws(()=>new TouhouBossCharge(bank,options));
  assert.equal(bank.instances.length,0);bank.dispose();
});
