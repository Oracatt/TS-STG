import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,createTouhouLaserOrigin,TouhouLaserField,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {artiaPhases} from '../games/rushboss/src/artia.js';

const available=existsSync('packages/thlib/assets/touhou-common/manifest.json');
function resources(){let handle=1;return createTouhouResources({readText:file=>readFileSync(file,'utf8'),loadTexture:()=>handle++,createRenderTarget:()=>handle++,unloadTexture(){}});}
function sourceOrigin(bank,color){
  // Frozen pre-extraction source initialization from laser_system/type1.cpp:33.
  const vm=bank.create(color+0x3a);vm.interrupt(2);vm.update();
  vm.B(0x498,1);vm.B(0x499,1);vm.U(0x4a0,(vm.U(0x4a0)&~0x3000000)|0x1000000);return vm;
}
const bytes=vm=>new Uint8Array(vm.memory.buffer);

test('all sixteen public laser origins preserve source memory and draw commands for 120 frames',{skip:!available},()=>{
  const res=resources(),bank=res.createBank('bullet');
  const field=new TouhouLaserField({bank,styles:res.styles}),view={x:336,y:24,scale:1.5,screenScale:1};
  for(let color=0;color<16;color++){
    const expected=sourceOrigin(bank,color),actual=createTouhouLaserOrigin(bank,color),laser=field.spawnInfinite({color});
    for(let frame=0;frame<120;frame++){
      assert.deepEqual(bytes(actual),bytes(expected),`source memory ${color}/${frame}`);
      assert.deepEqual(bytes(laser.origin),bytes(expected),`field memory ${color}/${frame}`);
      assert.equal(actual.scale2X,1);assert.equal(actual.scale2Y,1);
      const a=new DrawList(),b=new DrawList(),c=new DrawList();actual.draw(a,view);expected.draw(b,view);laser.origin.draw(c,view);
      assert.deepEqual(a.commands,b.commands);assert.deepEqual(c.commands,b.commands);
      actual.update();expected.update();laser.origin.update();
    }
    actual.destroy();expected.destroy();field.retire(laser);
  }
  assert.throws(()=>createTouhouLaserOrigin(bank,16),RangeError);bank.dispose();res.dispose();
});

test('every portrait pulse laser owns one public source origin, without creating Boss charge particle copies',{skip:!available},()=>{
  const res=resources(),battle=new RushBattle(artiaPhases,{boss:'artia',profile:'portrait',practice:true,spellIndex:12,difficulty:3,invincible:true,resources:res});
  const presentation=battle.presentation,bank=presentation.banks.effect,create=bank.create.bind(bank),created=new Map();
  assert.equal(presentation.shared.charges.length,1,'The phase owns one attack-preparation timeline');
  assert.deepEqual(presentation.shared.charges[0].roots.map(vm=>vm.scriptId),[76],'Rush violet selects the nearest original white charge preset');
  bank.create=(id,options)=>{created.set(id,(created.get(id)??0)+1);return create(id,options);};
  for(let frame=0;frame<200;frame++)battle.update();
  assert.equal(presentation.laserOrigins?.length??0,0,'the shared Boss owner must not duplicate public laser origins');
  const field=battle.projectiles.debris,lasers=field.lasers.filter(l=>l.driven);
  const heads=[...new Set(battle.world.entities.concat(battle.world.pending).filter(b=>b.alive)
    .flatMap(b=>b.kind==='laser'?[b]:b.laserHead?[b.laserHead]:[]))];
  assert.equal(lasers.length,heads.length);assert.equal(new Set(lasers.map(l=>l.origin)).size,heads.length);
  assert.ok(heads.length>=24);
  for(const [actor,laser]of battle.projectiles.lasers)assert.equal(laser.origin.scriptId,58+((actor.color%16)+16)%16);
  assert.equal(created.get(62),30,'The source attack-preparation root emits thirty converging particles');
  assert.equal(created.get(77),30,'Its one release root emits thirty outward particles');
  assert.equal(created.get(91),1,'Only the attack timeline creates the release, not each laser origin');
  assert.equal([...created].filter(([id])=>[64,66,68,70,72,74,76,149,150].includes(id)).length,0,
    'The twenty-four origins create neither more attack charges nor entry Point151 particle cohorts');
  const [follow,laser]=[...battle.projectiles.lasers].find(([actor])=>actor.alive&&!actor.curve);const origin=laser.origin;
  follow.x=42;follow.y=-80;battle.projectiles.updateLasers();
  const queue=new TouhouRenderQueue(),draw=new DrawList();battle.projectiles.draw(queue,battle.playerView);
  assert.ok(queue.entries.some(entry=>entry.priority===39),'embedded source origin VMs share the original field priority39');
  queue.flush(draw);assert.deepEqual([origin.F(0x2c),origin.F(0x30)],[42,304]);
  assert.equal(origin.layer,0,'Do not rewrite the source ANM layer to work around ownership');
  follow.kill();battle.projectiles.updateLasers();assert.equal(origin.alive,false);
  assert.equal(field.lasers.filter(l=>l.driven).length,heads.length-1);
  const banks=Object.values(presentation.banks);battle.dispose();assert.ok(banks.every(b=>b.disposed&&b.instances.length===0));res.dispose();
});
