import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList} from '@ts-stg/thlib';
import {RushBossArtwork,RUSH_BOSS_ARTWORK} from '../games/rushboss/src/boss-artwork.js';

const sizes={src_sunnymilk:{width:512,height:512},src_monstone:{width:192,height:64},src_artia:{width:576,height:333}};
const assets={texture:name=>name,size:name=>sizes[name]};
const battle=(key='sunny')=>({frame:0,bossKey:key,boss:{x:0,y:100,alive:true,moving:false,animationIndex:0},world:{entities:[]}});
const sample=art=>art.snapshot().actors[0];
const tick=(art,b,frame)=>{b.frame=frame;art.update(b);return sample(art);};

test('Rush Boss source profiles retain atlas rectangles, interval and original aspect ratios',()=>{
  assert.deepEqual(Object.keys(RUSH_BOSS_ARTWORK),['sunny','monstone','artia']);
  assert.deepEqual(RUSH_BOSS_ARTWORK.sunny.animations.map(a=>[a.interval,a.rects.length]),[[7,4],[7,3],[7,3],[1000,1],[1000,1],[1000,1]]);
  assert.deepEqual(RUSH_BOSS_ARTWORK.artia.animations[3].rects.map(r=>[r.x,r.y,r.width,r.height,r.flip]),
    [[192,111,96,111,true],[96,111,96,111,true],[0,111,96,111,true]]);
  assert.deepEqual(RUSH_BOSS_ARTWORK.sunny.animations[5].rects[0],{x:192,y:192,width:96,height:96,flip:false});
  assert.deepEqual(RUSH_BOSS_ARTWORK.monstone.animations.map(a=>a.rects[0].x),[0,64,128,64,128]);
});

test('animation cadence restarts after movement pose change, independent of global modulo',()=>{
  const b=battle(),art=new RushBossArtwork(assets);tick(art,b,0);
  assert.equal(tick(art,b,6).frameIndex,0);assert.equal(tick(art,b,7).frameIndex,1);
  b.boss.moving=true;b.boss.move={x:-100,y:100,distance:100};
  assert.equal(tick(art,b,8).animationIndex,1);assert.equal(sample(art).frameIndex,0);
  assert.equal(tick(art,b,13).frameIndex,0);assert.equal(tick(art,b,14).frameIndex,1);
  b.boss.moving=false;assert.equal(tick(art,b,15).animationIndex,0);assert.equal(sample(art).frameIndex,0);
});

test('Artia return pose uses three reversed frames from move completion fraction',()=>{
  const b=battle('artia'),art=new RushBossArtwork(assets);tick(art,b,0);
  b.boss.moving=true;b.boss.move={x:-100,y:100,distance:100};b.boss.x=-93;
  assert.equal(tick(art,b,1).animationIndex,3);assert.equal(sample(art).rect.x,192);
  b.boss.x=-96;tick(art,b,2); // Source uses the prior pre-move distance (7%).
  assert.equal(sample(art).rect.x,192);
  b.boss.x=-99;tick(art,b,3);assert.equal(sample(art).rect.x,96);
  b.boss.x=-99.9;tick(art,b,4);assert.equal(sample(art).rect.x,0);
  b.boss.moving=false;tick(art,b,5);assert.equal(sample(art).animationIndex,0);
});

test('Sunny casting pose is exact, and movement completion clears a stale casting request',()=>{
  const b=battle(),art=new RushBossArtwork(assets);tick(art,b,0);b.boss.animationIndex=5;tick(art,b,11);
  assert.equal(sample(art).rect.y,192);assert.equal(sample(art).rect.x,192);
  b.boss.moving=true;b.boss.move={x:100,y:100,distance:100};tick(art,b,12);assert.equal(sample(art).animationIndex,2);
  b.boss.moving=false;tick(art,b,13);tick(art,b,14);assert.equal(sample(art).animationIndex,0);
  // A fresh explicit animation change can request the next cast.
  b.boss.animationIndex=0;tick(art,b,15);b.boss.animationIndex=5;tick(art,b,16);assert.equal(sample(art).animationIndex,5);
});

test('Monstone orbital enemies use the original first sprite and no Character floating',()=>{
  const b=battle('monstone'),art=new RushBossArtwork(assets),clone={x:40,y:10,vx:-50,vy:10,alive:true,delay:0,visualKind:'monstone',kind:'Monstone',alpha:.75,tint:[1,1,.5,.75]};
  b.world.entities.push(clone);tick(art,b,20);
  const body=art.snapshot().actors[1];assert.equal(body.animationIndex,0);assert.equal(body.rect.x,0);assert.equal(body.bob,0);
  const draw=new DrawList();art.draw(draw,clone,b,{key:'monstone'});
  const sprite=draw.commands.find(c=>c[0]==='spriteRegion');assert.equal(sprite[1],'src_monstone');assert.equal(sprite[6],396);assert.equal(sprite[7],345);
  assert.equal(sprite.at(-1),0xffff7fbf,'Source tint RGB with .75 alpha, applied once');
});

test('Boss trails freeze rect and local bob, outlive ten-frame placeholders, and fade by source .02 steps',()=>{
  const b=battle(),art=new RushBossArtwork(assets);tick(art,b,0);tick(art,b,6);
  const captured=sample(art),trail={alive:true,visualKind:'afterimage',source:'sunny',x:0,y:100,alpha:.5,frame:0,lifetime:10};
  b.world.entities.push(trail);tick(art,b,7);assert.equal(art.snapshot().trails[0].frameIndex,captured.frameIndex);
  assert.equal(art.snapshot().trails[0].bob,captured.bob);
  b.world.entities=[];b.boss.x=50;b.boss.animationIndex=5;tick(art,b,17);
  const saved=art.snapshot().trails[0];assert.equal(saved.frameIndex,0);assert.equal(saved.x,0);assert.ok(saved.alpha>.299&&saved.alpha<.301);
  const draw=new DrawList();art.drawTrails(draw,b);const sprite=draw.commands.find(c=>c[0]==='spriteRegion');assert.equal(sprite[2],0);
  tick(art,b,31);assert.equal(art.snapshot().trails.length,1);tick(art,b,32);assert.equal(art.snapshot().trails.length,0);
});

test('draw is idempotent during pause, applies one uniform screen scale, and never mutates combat data',()=>{
  const b=battle('artia'),art=new RushBossArtwork(assets,{view:{x:100,y:10,scale:2,screenScale:1}});
  b.frame=12;const original=JSON.stringify(b),first=new DrawList(),second=new DrawList();art.draw(first,b.boss,b);
  const before=JSON.stringify(art.snapshot());art.draw(second,b.boss,b);art.drawTrails(second,b);
  assert.equal(JSON.stringify(art.snapshot()),before);assert.equal(JSON.stringify(b),original);assert.deepEqual(first.commands,second.commands);
  const sprite=first.commands.find(c=>c[0]==='spriteRegion');assert.equal(sprite[6],100);assert.equal(sprite[8],128);assert.equal(sprite[9],148);
});

test('left-facing sprites mirror UVs without negative dimensions or texture bleed; reset clears owned presentation',()=>{
  const b=battle('artia'),art=new RushBossArtwork(assets);b.boss.moving=true;b.boss.move={x:-100,y:100,distance:100};
  const draw=new DrawList();art.draw(draw,b.boss,b);const mesh=draw.commands.find(c=>c[0]==='mesh');assert.ok(mesh);
  assert.ok(mesh[2][0][2]>mesh[2][1][2]);assert.equal(mesh[2][1][0]-mesh[2][0][0],96);
  assert.deepEqual(draw.commands[0],['sampler','src_artia','bilinear','clamp','clamp']);
  art.reset();assert.equal(art.snapshot().actors.length,0);assert.equal(art.snapshot().ticks,0);
  art.update(b);art.update(battle('monstone'));assert.deepEqual(art.snapshot().actors.map(s=>s.key),['monstone']);
  art.destroy();assert.throws(()=>art.update(b),/disposed/);
});
