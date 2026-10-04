import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AnmBank,TouhouPlayer,getTouhouPlayerData} from '@ts-stg/thlib/touhou';

const data=JSON.parse(fs.readFileSync(new URL('../packages/thlib/assets/touhou-common/anm/pl00.json',import.meta.url)));
const tick=(player,count,context={})=>{for(let frame=0;frame<count;frame++)player.update(0,context);};
function fixture(){
  const bank=new AnmBank(data,{loadTexture:()=>1}),player=new TouhouPlayer({sht:getTouhouPlayerData(0),bank});
  player.triggerBomb();return{bank,player,bomb:player.bomb};
}
const cores=orb=>orb.animation.children.filter(vm=>[49,51,53].includes(vm.scriptId));
const fragments=orb=>orb.animation.children.filter(vm=>[50,52,54].includes(vm.scriptId));

test('Reimu forced retirement interrupts the six visible core children and retains the source burst instead of an opaque frozen orb',()=>{
  const {bank,player,bomb}=fixture();
  try{
    tick(player,240);assert.equal(bomb.orbs.length,16);assert.ok(bomb.orbs.every(orb=>orb.active));
    const children=bomb.orbs.flatMap(cores);assert.equal(children.length,96);
    player.update(0);assert.ok(bomb.orbs.every(orb=>!orb.active));
    assert.ok(children.every(vm=>!vm.alive),'ANM44 consumes the complete event1 tree in the same frame as Bomb33 retirement');
    for(const orb of bomb.orbs){
      assert.equal(fragments(orb).length,6);assert.ok(orb.animation.children.some(vm=>vm.scriptId===48));
    }
    const pieces=fragments(bomb.orbs[0]),first=pieces.map(vm=>({alpha:vm.alpha,scale:vm.scaleX,x:vm.worldPosition().x,y:vm.worldPosition().y}));
    tick(player,10);pieces.forEach((vm,index)=>{
      assert.ok(vm.alpha<first[index].alpha);assert.ok(vm.scaleX<first[index].scale);
      assert.notDeepEqual([vm.worldPosition().x,vm.worldPosition().y],[first[index].x,first[index].y]);
    });
    tick(player,40);assert.ok(pieces.every(vm=>!vm.alive),'source burst fragments finish after50 frames');
    assert.ok(bomb.orbs.every(orb=>orb.animation.alive),'invisible source root has a longer60-frame lifetime');
    tick(player,11);assert.equal(player.bomb,null);assert.equal(bomb.alive,false);
    assert.ok(bank.instances.filter(vm=>vm.scriptId>=46&&vm.scriptId<=61).every(vm=>!vm.alive));
  }finally{bomb.destroy();bank.dispose();}
});

test('Reimu damage-threshold retirement uses the same recursive exit without stopping other live orbs',()=>{
  const {bank,player,bomb}=fixture(),sounds=[],events=[],cancels=[];
  const context={sound:(...args)=>sounds.push(args),onEvent:(...args)=>events.push(args),cancelCircle:(...args)=>cancels.push(args)};
  try{
    tick(player,60,context);const orb=bomb.orbs[0],children=cores(orb);orb.totalDamage=300;
    player.update(0,context);assert.equal(orb.active,false);
    assert.ok(children.every(vm=>!vm.alive),'damage retirement also reaches ANM44 in this frame');
    assert.equal(sounds.filter(([id])=>id===27).length,2,'source threshold path requests27 twice');
    assert.equal(cancels.filter(args=>args[3]?.reason==='reimu-orb-retire').length,1);
    assert.ok(events.some(([type,value])=>type==='screenEffect'&&value.type===1));
    const position=[orb.x,orb.y];player.update(0,context);
    assert.ok(children.every(vm=>!vm.alive));assert.equal(fragments(orb).length,6);
    tick(player,10,context);assert.deepEqual([orb.x,orb.y],position,'burst remains at the retired orb position');
    assert.equal(bomb.orbs.filter(value=>value.active).length,15);assert.equal(player.bomb,bomb);
  }finally{bomb.destroy();bank.dispose();}
});

test('Reimu frame240 re-interrupts a living retired root without repeating its damage, sound or cancellation',()=>{
  const {bank,player,bomb}=fixture(),sounds=[],cancels=[];
  const context={sound:(...args)=>sounds.push(args),cancelCircle:(...args)=>cancels.push(args)};
  try{
    tick(player,220,context);const orb=bomb.orbs[0];orb.totalDamage=300;
    player.update(0,context);const oldPieces=fragments(orb),position=[orb.x,orb.y];
    assert.equal(oldPieces.length,6);tick(player,19,context);
    const soundCount=sounds.length,cancelCount=cancels.filter(args=>args[3]?.reason==='reimu-orb-retire').length;
    player.update(0,context);
    assert.equal(orb.animation.time,1);assert.equal(fragments(orb).length,12,'still living root emits another source burst');
    assert.ok(oldPieces.every(vm=>vm.alive),'old fragments have no event1 label and continue their existing fade');
    assert.equal(sounds.length-soundCount,15,'only the other fifteen active orbs repeat gameplay retirement');
    assert.equal(cancels.filter(args=>args[3]?.reason==='reimu-orb-retire').length-cancelCount,15);
    assert.equal(player.damageRegions.length,15,'retired orb must not create another explosion damage region');
    tick(player,40,context);assert.ok(oldPieces.every(vm=>!vm.alive));
    assert.ok(orb.animation.alive,'240 resets the still living root lifetime');
    assert.deepEqual([orb.x,orb.y],position);
    tick(player,21,context);assert.equal(player.bomb,null);
  }finally{bomb.destroy();bank.dispose();}
});

test('Reimu retires every core early and the player owner deletes the aura when the last root finishes',()=>{
  const {bank,player,bomb}=fixture();
  try{
    tick(player,60);const firstRoot=bomb.orbs[0].animation;
    for(const orb of bomb.orbs)orb.totalDamage=300;
    player.update(0);assert.ok(bomb.orbs.every(orb=>!orb.active));
    tick(player,60);assert.equal(firstRoot.alive,false);assert.equal(player.bomb,bomb);
    player.update(0);assert.equal(player.bomb,null);assert.equal(bomb.aura.alive,false);
    tick(player,120);assert.equal(firstRoot.alive,false,'frame240 must not resurrect a deleted orb');
  }finally{bomb.destroy();bank.dispose();}
});
