import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { DrawList,Keys } from '@ts-stg/thlib';
import { TouhouPlayer,TouhouShot,TouhouReimuBomb,TouhouMarisaBomb,createTouhouResources,getTouhouPlayerData,touhouStyle,TouhouLaserField,touhouBulletIntersectsRectangle } from '@ts-stg/thlib/touhou';
import { Th20Player } from '../games/touhou20/src/player.js';
import { RushBattle } from '../games/rushboss/src/runtime.js';

// Original spell health stores HP*7 in a signed 32-bit field.
const phase={key:'fixture',number:1,hp:1e7,time:1000,spell:true,cardId:1,bonus:100000};
const step=(battle,frames,mask=0)=>{for(let i=0;i<frames;i++)battle.update(mask);};
const fixture=(character=0,resources)=>{
  const battle=new RushBattle([phase],{character,invincible:true,resources});
  battle.boss.x=0;battle.boss.y=100;battle.phaseFrame=18000;return battle;
};
test('Rush maps the restored player coordinates and complete original baseline data',()=>{
  const battle=fixture(),player=battle.sharedPlayer;
  assert.equal(TouhouPlayer,Th20Player);
  assert.equal(player.constructor,TouhouPlayer);assert.equal(player.sht,getTouhouPlayerData(0));
  assert.equal(player.power,400);assert.equal(player.sht.patterns.length,15);
  assert.equal(battle.player.y,-player.y);battle.player.y=-130;assert.equal(player.fixedY,130*128);
  battle.player.moveSpeed=180;assert.equal(player.speeds[0],3*128);
  battle.player.slowMoveSpeed=90;assert.equal(player.speeds[1],1.5*128);
  step(battle,1,Keys.RIGHT|Keys.UP);assert.ok(battle.player.x>0);assert.ok(battle.player.y>-130);
  assert.equal(battle.player.life,player.lives);battle.player.bombs=1;assert.equal(player.bombs,1);
  step(battle,200,Keys.RIGHT|Keys.DOWN);assert.equal(player.x,312);assert.equal(player.y,232);
});
test('both restored SHT weapons create original shared shots and hit the Rush Boss',()=>{
  for(const character of [0,1]){
    const battle=fixture(character),hp=battle.boss.hp;step(battle,80,Keys.SHOOT);
    assert.ok(battle.shots.length);assert.ok(battle.shots.every(shot=>shot.constructor===TouhouShot));
    assert.equal(battle.sharedPlayer.sht,getTouhouPlayerData(character));
    assert.ok(battle.boss.hp<hp,`character ${character}`);assert.ok(battle.statistics.shotDamage>0);
    assert.equal(battle.sharedPlayer.options.filter(o=>o.active).length,4);
    const kinds=new Set(battle.shots.map(s=>s.pattern));assert.ok([...kinds].some(p=>p>=5));
  }
});
test('the complete Reimu Bomb produces both eight-orb waves and original launch timers',()=>{
  const battle=fixture(),p=battle.player;
  step(battle,61);assert.ok(battle.playerAdapter.spell.age.current>=60,'leave the public spell capture grace before bombing');
  const target=battle.spawn('XiaoYu',{x:p.x+20,y:p.y},{},0,{delay:0});step(battle,1);step(battle,1,Keys.BOMB);
  const bomb=battle.sharedPlayer.bomb;assert.equal(bomb.constructor,TouhouReimuBomb);
  assert.equal(bomb.orbs.length,8);assert.equal(bomb.timer.current,1);assert.equal(battle.statistics.bombs,1);
  assert.equal(battle.player.bombs,2);assert.equal(battle.captureFailed,true);
  step(battle,40);assert.equal(bomb.orbs.length,16);assert.equal(target.alive,false);
  assert.deepEqual(bomb.orbs.slice(0,8).map(o=>o.ordinal),[0,1,2,3,4,5,6,7]);
  step(battle,55);assert.equal(bomb.orbs[0].mode,0);assert.equal(bomb.orbs[1].mode,2);
  step(battle,170);assert.equal(bomb.alive,false);assert.equal(battle.bombRemaining,0);
});
test('Marisa uses the restored Bomb, shot blocking and three damage rectangles',()=>{
  const battle=fixture(1),damage=[];battle.playerAdapter.context.damageEnemy=(_enemy,amount,source)=>damage.push({amount,source});
  step(battle,1,Keys.BOMB);const bomb=battle.sharedPlayer.bomb;
  assert.equal(bomb.constructor,TouhouMarisaBomb);assert.equal(battle.sharedPlayer.bombBlocksShots,true);
  step(battle,3);
  assert.ok(damage.some(d=>d.source.shape==='rectangle'&&d.source.width===512&&d.amount===50));
  step(battle,40,Keys.SHOOT);assert.equal(battle.shots.length,0);
  assert.equal(battle.sharedPlayer.movementScale,.5);step(battle,260);
  assert.equal(battle.sharedPlayer.bombBlocksShots,false);assert.equal(bomb.alive,false);
});
test('Bomb cancellation delegates source sample splitting and also cancels startup bullets without Rush flags',()=>{
  const battle=new RushBattle([phase],{character:1,profile:'portrait',invincible:true});
  const adapter=battle.playerAdapter;
  const crossed=battle.laser({x:-64,y:0},0,0,{length:128,width:8,cleanOnBomb:false});
  const outside=battle.laser({x:100,y:0},0,0,{length:64,width:8,cleanOnBomb:false});
  const fog=battle.spawn('XiaoYu',{x:0,y:0},{},0,{delay:15,cleanOnBomb:false});
  battle.projectiles.updateLasers();
  const reference=new TouhouLaserField({styles:battle.touhouResources.styles});
  const original=reference.spawnDriven(1,{x:-64,y:224,length:128,width:16,angle:0,type:0,color:0,state:2});
  const expected=reference.cancelOne(original,{x:0,y:224},32,32,0,false,true);
  const count=adapter.cancelRectangle(0,224,32,32,0,{reward:true});
  assert.equal(count,expected+1,'public source sampled segments plus one ordinary circle');
  assert.equal(fog.alive,false);assert.equal(outside.alive,true);
  const actual=battle.projectiles.lasers.get(crossed);
  assert.equal(actual.length,original.length);assert.deepEqual(actual.position,original.position);
  const shape=l=>[l.kind,l.position.x,l.position.y,l.length,l.width,l.speed];
  assert.deepEqual(battle.projectiles.debris.lasers.filter(l=>!l.driven).map(shape),reference.lasers.filter(l=>!l.driven).map(shape));
  assert.ok(battle.projectiles.debris.lasers.some(l=>!l.driven&&l.speed===8),'uncancelled tail becomes source speed8 debris');
  assert.equal(adapter.items.spawnCounter,0,'source stone cancellation rewards are excluded, never replaced by ordinary POINT items');
  battle.dispose();
});
test('Marisa cancellation uses a rotated rectangle without extending capsule end caps',()=>{
  for(const a of [0,Math.PI/2,.73]){
    const battle=fixture(),w=40,h=12;
    // Original rectangle-circle: full dimensions40x12, source orb radius4.
    // Use points on both sides of the side/corner boundaries, away from f32
    // inverse-rotation rounding at an exact tangent.
    for(const [dx,dy,contact]of [[0,0,true],[23.875,0,true],[24.125,0,false],
      [0,9.875,true],[0,10.125,false],[22,8,true],[24,10,false]]){
      const x=Math.cos(a)*dx-Math.sin(a)*dy,y=Math.sin(a)*dx+Math.cos(a)*dy;
      const b=battle.spawn('XiaoYu',{x,y:-y},{},0,{delay:0});b.birthNotified=true;
      const expected=touhouBulletIntersectsRectangle(battle.projectiles.circle(b),0,0,w,h,a);
      assert.equal(expected,contact,`source rectangle edge ${dx}/${dy}`);
      battle.playerAdapter.cancelRectangle(0,0,w,h,a,{reward:false});assert.equal(!b.alive,expected,`angle ${a}, local ${dx}/${dy}`);
      b.kill();
    }
    battle.dispose();
  }
});
test('graze lines receive the shared ARGB palette rather than the source palette index',()=>{
  const battle=fixture(),b=battle.spawn('XiaoYu',{x:50,y:0},{},1,{delay:0});
  battle.playerAdapter.addGraze(b);const color=touhouStyle(battle.touhouResources.styles,4,1).colors[1][4];
  assert.equal(battle.playerAdapter.grazeEffects.pending[0].color,(color|0xff000000)>>>0);
  assert.equal(battle.playerAdapter.grazeEffects.pending[0].color,0xffff0000);assert.equal(battle.graze,1);
});
test('the original auto-collection line uses the same translation as player respawn coordinates',()=>{
  const battle=fixture(),player=battle.sharedPlayer;assert.equal(player.collectLine,-72);
  assert.equal(400-player.respawnY,128-player.collectLine);
  player.setPosition(0,-71);assert.equal(battle.playerAdapter.items.forcedCollect(battle.playerAdapter.context),false);
  player.setPosition(0,-73);assert.equal(battle.playerAdapter.items.forcedCollect(battle.playerAdapter.context),true);
});
test('hit, deathbomb rescue and the complete death/respawn sequence use restored source states',()=>{
  const battle=new RushBattle([phase]),player=battle.sharedPlayer;player.invulnerability.set(0);
  assert.equal(battle.miss(),true);assert.equal(player.state,4);assert.equal(battle.player.deathbomb,8);
  step(battle,1,Keys.BOMB);assert.equal(player.state,1);assert.equal(player.lives,2);assert.equal(battle.statistics.bombs,1);
  player.bomb.destroy();player.bomb=null;player.invulnerability.set(0);battle.miss();step(battle,8);
  assert.equal(player.state,4);assert.equal(player.lives,2);step(battle,1);
  assert.equal(player.state,2);assert.equal(player.lives,1);assert.equal(battle.statistics.misses,1);
  step(battle,30);assert.equal(player.state,0);assert.equal(player.y,280);
  step(battle,61);assert.equal(player.state,1);assert.equal(player.y,200);assert.ok(player.invulnerability.current>180);
});

function comparePlayers(resources,{render=false}={}){
  for(const character of [0,1]){
    const battle=fixture(character,resources),actual=battle.sharedPlayer;
    const referenceBank=actual.bank?resources.createBank(`pl0${character}`):null;
    const referenceEffect=actual.effectBank?resources.createBank('effect'):null;
    const reference=new Th20Player({character,sht:actual.sht,bank:referenceBank,effectBank:referenceEffect,
      x:0,y:200,power:400,lives:2,bombs:3,seed:0,bounds:actual.bounds,movementInsets:actual.movementInsets,
      respawnX:0,respawnY:200,respawnStartY:280});reference.invulnerability.set(90);
    assert.equal(reference.sht,actual.sht);assert.equal(reference.bank?.data,actual.bank?.data);
    const expectedSounds=[],actualSounds=[],context={...battle.playerAdapter.context,onEvent:()=>{},sound:(id,x)=>expectedSounds.push([id,x])};
    battle.playerAdapter.context.sound=(id,x)=>actualSounds.push([id,x]);
    context.damageEnemy=()=>{};context.cancelCircle=()=>{};context.cancelRectangle=()=>{};context.spawnItem=()=>{};
    for(let frame=0;frame<360;frame++){
      const mask=Keys.SHOOT|(frame>30&&frame<110?Keys.FOCUS:0)|(frame>40&&frame<70?Keys.LEFT:0)|(frame===115?Keys.BOMB:0);
      battle.playerAdapter.syncBoss();reference.update(mask,context);battle.update(mask);
      for(const bank of [referenceBank,referenceEffect]){bank?.updateDetached();bank?.collect();}
      assert.deepEqual(actual.snapshot(),reference.snapshot(),`character=${character}, frame=${frame} simulation`);
      if(render){const a=new DrawList(),b=new DrawList(),view={x:480,y:360,scale:1.5,screenScale:1};
        actual.draw(a,view);reference.draw(b,view);assert.deepEqual(a.commands,b.commands,`character=${character}, frame=${frame} full ANM draw`);}
    }
    assert.deepEqual(actualSounds,expectedSounds);battle.playerAdapter.dispose();referenceBank?.dispose();referenceEffect?.dispose();
  }
}
test('Rush and Touhou20 share exact player classes, SHT resources and every input-frame behavior',()=>comparePlayers(createTouhouResources()));
test('Rush and Touhou20 emit identical full-animation drawing through movement, options, focus, shots and Bombs',{
  skip:!existsSync('packages/thlib/assets/touhou-common/manifest.json')||process.env.TS_STG_TEST_STATIC_ASSETS==='1'},()=>{
  const textures=new Map(),host={readText:path=>readFileSync(path,'utf8'),loadTexture:path=>{if(!textures.has(path))textures.set(path,textures.size+1);return textures.get(path);}};
  const resources=createTouhouResources(host);comparePlayers(resources,{render:true});resources.dispose();
});
