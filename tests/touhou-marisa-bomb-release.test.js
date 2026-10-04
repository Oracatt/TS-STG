import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Keys } from '@ts-stg/thlib';
import { AnmBank, TouhouMarisaBomb, TouhouPlayer, TouhouTimer, getTouhouPlayerData } from '@ts-stg/thlib/touhou';

const data=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/pl01.json',import.meta.url)));
const makeBank=()=>new AnmBank(data,{loadTexture:()=>1});

test('Marisa frame300 recursively interrupts actual source beam children into their ten-frame shrink/fade',()=>{
  const bank=makeBank(),player={x:0,y:400,motionX:0,invulnerability:new TouhouTimer(),bank};
  const bomb=new TouhouMarisaBomb(player);
  for(let frame=0;frame<300;frame++)bomb.update();
  const beams=bomb.beam.children.filter(child=>child.scriptId>=52&&child.scriptId<=56);
  assert.equal(beams.length,5);
  const before=beams.map(child=>({alpha:child.alpha,width:child.scaleY}));
  const wave=bomb.beam.children.find(child=>child.scriptId===57&&child.alive),start=wave.worldPosition();
  bomb.update(); // Source timer == 300: interrupt51 and all children, interrupt65.
  assert.equal(player.bombBlocksShots,false);assert.equal(bomb.alive,true);
  assert.equal(player.movementScale,.5,'source still writes .5 on the interrupt frame');
  for(let frame=0;frame<5;frame++)bomb.update();
  beams.forEach((child,index)=>{
    assert.ok(child.alive);assert.ok(child.alpha<before[index].alpha,`ANM${child.scriptId} must fade, not remain opaque`);
    assert.ok(child.scaleY<before[index].width,`ANM${child.scriptId} must shrink, not remain full width`);
  });
  assert.notEqual(wave.worldPosition().y,start.y,'ANM57 wave continues its own outgoing movement');
  for(let frame=0;frame<5;frame++)bomb.update();
  assert.ok(beams.every(child=>!child.alive),'52–56 finish ten frames after event1, before the invisible root dies');
  assert.equal(bomb.beam.alive,true);assert.equal(bomb.aura.alive,true);
  for(let frame=0;frame<10;frame++)bomb.update();
  assert.equal(bomb.aura.alive,false,'ANM65 has a separate twenty-frame exit');
  for(let frame=0;frame<21;frame++)bomb.update();
  assert.equal(bomb.alive,false);assert.equal(bomb.beam.alive,false);
  bomb.destroy();bank.dispose();
});

test('public player releases shot/movement gates while the frozen beam origin finishes its source exit, then cleans all children',()=>{
  const bank=makeBank(),player=new TouhouPlayer({character:1,sht:getTouhouPlayerData(1),bank}),context={enemyReady:true};
  assert.equal(player.triggerBomb(context),true);const bomb=player.bomb;
  for(let frame=0;frame<301;frame++)player.update(0,context);
  const origin={x:bomb.x,y:bomb.y},angle=bomb.beam.rotation;
  assert.equal(player.bombBlocksShots,false);
  for(let frame=0;frame<11;frame++)player.update(Keys.RIGHT|Keys.SHOOT,context);
  assert.ok(player.x>origin.x);assert.equal(player.movementScale,1);
  assert.deepEqual({x:bomb.x,y:bomb.y},origin);assert.equal(bomb.beam.rotation,angle);
  assert.ok(bomb.beam.children.every(child=>child.scriptId===57),'frozen origin never leaves opaque beam stripes behind');
  for(let frame=0;frame<40;frame++)player.update(0,context);
  assert.equal(player.bomb,null);assert.equal(bomb.alive,false);
  assert.ok(bank.instances.filter(vm=>vm.scriptId>=51&&vm.scriptId<=65).every(vm=>!vm.alive));
  bank.dispose();
});
