import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '@ts-stg/thlib';
import {RushBattle} from '../games/rushboss/src/runtime.js';
import {RushGraphics} from '../games/rushboss/src/graphics.js';
import {createRushAssets} from '../games/rushboss/src/assets.js';
import {hostFixture} from './fixtures/rushboss-host.js';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRushGame} from '../games/rushboss/src/game.js';
import {assertRenderScopes} from './fixtures/render-scopes.js';
const phase={key:'render-order',spell:false,hp:100,time:1000};

test('real runtime maple actors render between highlight and ordinary bullets regardless of creation order or actor layer',()=>{
  const {host,resources}=hostFixture(),assets=createRushAssets(host),graphics=new RushGraphics(host,assets),battle=new RushBattle([phase],{resources,invincible:true});
  const ordinary=battle.spawn('MiDan',{x:0,y:0},{x:0,y:0},0,{delay:0,noCheck:true});
  const maple=battle.effect('maple',battle.boss,{blast:true});
  const glow=battle.spawn('GuangYuS',{x:0,y:0},{x:0,y:0},0,{delay:0});
  const fog=battle.effect('laserFog',{x:0,y:0});
  battle.update(0);battle.update(0);assert.equal(maple.layer,5,'Actual actor layer is the same as ordinary bullets');
  graphics.entity=(target,b)=>target.push(['ordered-entity',b===ordinary?'ordinary':b===maple?'maple':b===glow?'highlight':b===fog?'fog':'unknown']);
  const draw=new DrawList();graphics.draw(draw,battle);
  assert.deepEqual(draw.commands.filter(c=>c[0]==='ordered-entity').map(c=>c[1]),['highlight','maple','ordinary','fog']);
  // noCheck controls contact only, never visibility or stage ordering.
  assert.equal(ordinary.noCheck,true);assert.ok(draw.commands.some(c=>c[0]==='ordered-entity'&&c[1]==='ordinary'));
  battle.presentation.dispose();battle.bulletVisuals.dispose();battle.playerAdapter.dispose();graphics.dispose();assets.dispose();
});

test('Sunny spell-opening pose selects original anims[5] region',()=>{
  const {host}=hostFixture(),assets=createRushAssets(host),graphics=new RushGraphics(host,assets),draw=new DrawList();
  graphics.animatedBoss(draw,{x:0,y:100,animationIndex:5,vx:0},{bossKey:'sunny',frame:1});
  assert.deepEqual(draw.commands[0].slice(2,6),[192,192,96,96]);graphics.dispose();assets.dispose();
});

test('Artia floating offset is scaled by its original 74-pixel body height',()=>{
  const {host}=hostFixture(),assets=createRushAssets(host),graphics=new RushGraphics(host,assets),draw=new DrawList();
  graphics.animatedBoss(draw,{x:0,y:100,vx:0},{bossKey:'artia',frame:15});
  assert.equal(draw.commands[0][7],205.32983779907227);graphics.dispose();assets.dispose();
});

test('actual restored ANM/player afterimages and source effects produce valid native scopes',{skip:!existsSync(new URL('../packages/thlib/assets/touhou-common/manifest.json',import.meta.url))},()=>{
  const root=resolve(import.meta.dirname,'..');let quads=0,sawPlayerShadow=false,sawFog=false;
  for(const [boss,phaseIndex,frames]of [['monstone',7,120],['artia',11,180],['artia',12,160]]){
    const {host}=hostFixture();host.readText=file=>readFileSync(resolve(root,file),'utf8');
    const game=createRushGame(host,{startBoss:boss,phaseIndex,difficulty:3,practice:true,invincible:true});
    for(let frame=1;frame<=frames;frame++){
      game.update(0);const commands=game.render();assertRenderScopes(commands,`${boss}/${phaseIndex} frame ${frame}`);
      quads+=commands.filter(c=>c[0]==='statefulQuad').length;
      sawPlayerShadow||=game.battle.world.entities.some(b=>b.visualKind==='afterimage'&&b.source==='player');
      sawFog||=game.battle.world.entities.some(b=>b.visualKind==='freezingFog'&&b.group==='actor');
    }
    game.disposeBattle();game.graphics.dispose();game.assets.dispose();game.touhouResources.dispose();
  }
  assert.ok(quads>100,'The actual restored animation bank must submit its own stateful quads');
  assert.equal(sawPlayerShadow,true,'Exercise the real source player-shadow path that triggered nested scopes');
  assert.equal(sawFog,true,'Exercise FreezingFog created as an actor instead of an effect group');
});
