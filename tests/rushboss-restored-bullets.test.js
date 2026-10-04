import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,touhouStyle} from '@ts-stg/thlib/touhou';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {RUSH_TOUHOU_BULLET_TYPES} from '../games/rushboss/src/bullet-visuals.js';
import {BULLET_STYLES} from '../games/rushboss/src/bullet-styles.js';
const optional={skip:!existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'};
const phase={key:'animation-fixture',hp:1000,time:1000};
function resources(){return createTouhouResources({readText:f=>readFileSync(f,'utf8'),loadTexture:()=>1});}
test('twenty Rush shapes map to full shared animation styles, with the two unavailable source fallbacks explicit',()=>{
  assert.equal(Object.keys(RUSH_TOUHOU_BULLET_TYPES).length,20);
  for(const kind of Object.keys(BULLET_STYLES))assert.equal(RUSH_TOUHOU_BULLET_TYPES[kind]===undefined,['XinDan','YanDan'].includes(kind));
  assert.equal(RUSH_TOUHOU_BULLET_TYPES.JunDan,2);assert.equal(RUSH_TOUHOU_BULLET_TYPES.LianDan,9);
});
test('all common bullet palettes remain visible after the fifteen-frame spawn delay and use actual animation scripts',optional,()=>{
  const shared=resources(),battle=new RushBattle([phase],{resources:shared,invincible:true}),objects=[];
  for(const [kind,type]of Object.entries(RUSH_TOUHOU_BULLET_TYPES))for(let color=0;color<BULLET_STYLES[kind].colors;color++)
    objects.push(battle.spawn(kind,{x:0,y:0},{x:60,y:0},color));
  for(let f=0;f<18;f++)battle.update();
  for(const b of objects){
    const visual=battle.bulletVisuals.visuals.get(b),color=b.kind==='DaYu'?[1,3,5,6][b.color]:b.color;
    assert.equal(visual.animation.scriptId,shared.styles[visual.type].script);
    assert.equal(visual.animation.spriteIndex,touhouStyle(shared.styles,visual.type,color).remapSprite(0),`${b.kind}/${b.color}`);
    assert.ok(visual.animation.visible&&visual.animation.alive,`${b.kind}/${b.color} must leave fog visible`);
    const draw=new DrawList();assert.equal(battle.bulletVisuals.drawBullet(draw,b,{x:480,y:360,scale:1.5}),true);
    assert.ok(draw.commands.some(c=>c[0]==='quad'||c[0]==='statefulQuad'),`${b.kind}/${b.color} lacks a real ANM quad`);
  }
  const b=objects.find(b=>b.kind==='XiaoYu'&&b.color===0),visual=battle.bulletVisuals.visuals.get(b);b.color=3;battle.update();
  assert.equal(visual.animation.spriteIndex,touhouStyle(shared.styles,4,3).remapSprite(0));
  b.kill('cancel');battle.update();assert.ok(visual.ending);assert.ok(battle.bulletVisuals.effects.length>0);
  battle.bulletVisuals.dispose();battle.playerAdapter.dispose();shared.dispose();
});
test('shared ANM tint multiplies RGB in the drawing ABI and preserves animation alpha',optional,()=>{
  const shared=resources(),battle=new RushBattle([phase],{resources:shared,invincible:true});
  const b=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:0,alpha:.5,tint:[1,.5,0]});battle.update();
  const vm=battle.bulletVisuals.visuals.get(b).animation;vm.color=0xffffffff;
  const draw=new DrawList();battle.bulletVisuals.drawBullet(draw,b,{x:0,y:0,scale:1});
  const quad=draw.commands.find(c=>c[0]==='quad'||c[0]==='statefulQuad');assert.ok(quad);
  assert.deepEqual(quad.slice(12,16),[0xff7f007f,0xff7f007f,0xff7f007f,0xff7f007f]);assert.equal(vm.color,0xffffffff);
  battle.bulletVisuals.dispose();battle.playerAdapter.dispose();shared.dispose();
});
test('battle restart allocates independent ANM VMs while retaining shared immutable data and textures',optional,()=>{
  const shared=resources(),first=new RushBattle([phase],{resources:shared});first.update();
  const old=first.sharedPlayer.animation;first.bulletVisuals.dispose();first.playerAdapter.dispose();
  const second=new RushBattle([phase],{resources:shared});assert.notEqual(first.sharedPlayer.bank,second.sharedPlayer.bank);
  assert.equal(first.sharedPlayer.bank.data,second.sharedPlayer.bank.data);assert.equal(second.sharedPlayer.sht,first.sharedPlayer.sht);
  assert.equal(old.alive,false);second.update();assert.equal(second.sharedPlayer.animation.alive,true);
  second.playerAdapter.dispose();shared.dispose();
});
