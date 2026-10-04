import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawList, Keys } from '@ts-stg/thlib';
import { getTouhouLaserCollisionSegments } from '@ts-stg/thlib/touhou';
import { rushTouhouBulletStyle } from '../games/rushboss/src/bullet-visuals.js';
import { BULLET_STYLES, bulletSprite } from '../games/rushboss/src/bullet-styles.js';
import { RushBattle } from '../games/rushboss/src/runtime.js';
import { RushGame } from '../games/rushboss/src/game.js';
import { RushGraphics } from '../games/rushboss/src/graphics.js';
import { BOSSES } from '../games/rushboss/src/catalog.js';

const emptyPhase = { key:'geometry-fixture',hp:100,time:1000,spell:false,bonus:0 };
function collisionFixture(kind, { position={x:0,y:0},player={x:0,y:0},rotation=0,size,delay=0 } = {}) {
  const battle=new RushBattle([emptyPhase],{profile:'portrait'});
  Object.assign(battle.player,{...player,invulnerable:0,deathbomb:0,respawning:0});
  const bullet=battle.spawn(kind,position,{x:0,y:0},0,{delay,rotation,...(size===undefined?{}:{size})});
  return {battle,bullet};
}

import { hostFixture, commonManifest } from './fixtures/rushboss-host.js';

const settle=game=>{let frames=0;while(game.inputLocked&&!game.quitRequested){game.update(0);assert.ok(++frames<200,'Menu transition must finish');}};
const tap=(game,key)=>{settle(game);game.update(key);game.update(0);settle(game);};
const disposeGame=game=>{game.graphics.dispose();game.assets.dispose();};

test('portrait bullet collision resolves the same original style and radius as its public ANM',()=>{
  const battle=new RushBattle([emptyPhase],{profile:'portrait'});
  for(const kind of Object.keys(BULLET_STYLES)){
    const bullet=battle.spawn(kind,{x:0,y:0},{},3,{delay:0}),state=battle.projectiles.circle(bullet);
    const style=rushTouhouBulletStyle(battle.touhouResources,bullet,true);
    assert.ok(style,kind);assert.equal(state.style.type,style.type);assert.equal(state.radius,style.radius);
    assert.equal(state.scale,1);assert.equal(state.scaleEnabled,false);
  }
  battle.dispose();
});

// player_entity/collision.cpp: distance < playerRadius^2 + bulletRadius^2.
// The sprite's rotation and former capsule/box labels never change this circle.
test('Rush contacts use original circular radii, strict tangency and explicit size scaling',()=>{
  const cases=[
    ['XiaoYu',16,4.875,1],['XiaoYu',16,5,2],['XiaoYu',16,43,2],['XiaoYu',16,43.25,0],
    ['MiDan',16,3.75,1],['MiDan',16,3.875,2],
    ['ZhaDan',16,4,1],['ZhaDan',16,4.125,2],
    ['XiaoYu',32,8.5,1],['XiaoYu',32,8.625,2],
    ['MiDan',32,5.5,1],['MiDan',32,5.75,2],
  ];
  for(const [kind,size,x,collision] of cases)for(const rotation of [0,-Math.PI/2,.73]){
    const {battle,bullet}=collisionFixture(kind,{rotation,size,player:{x,y:0}});
    try{
      assert.equal(battle.player.radius,3);
      assert.equal(battle.intersectsBullet(bullet,3),collision===1,`${kind}, size${size}, x${x}, rotation${rotation}`);
      battle.checkBullet(bullet);
      assert.equal(battle.sharedPlayer.state,collision===1?4:1);
      assert.equal(battle.graze,Number(collision===2));assert.equal(bullet.alive,collision!==1);
      if(collision===1){
        for(let frame=0;frame<=battle.sharedPlayer.deathbombFrames;frame++)battle.updatePlayer(0);
        assert.equal(battle.statistics.misses,1);assert.equal(battle.sharedPlayer.state,2);
      }else{battle.checkBullet(bullet);assert.equal(battle.graze,Number(collision===2),'graze does not repeat on adjacent frames');}
    }finally{battle.dispose();}
  }
});

test('source startup circles remain collidable, and player state owns invulnerability semantics',()=>{
  const delayed=collisionFixture('XiaoYu',{delay:15});
  delayed.battle.checkBullet(delayed.bullet);
  assert.equal(delayed.battle.sharedPlayer.state,4);assert.equal(delayed.bullet.alive,false);delayed.battle.dispose();
  for(const mode of ['checking','dead','invincible','deathbomb']){
    const {battle,bullet}=collisionFixture('XiaoYu');
    if(mode==='checking')bullet.checking=false;
    if(mode==='dead')bullet.kill();
    if(mode==='invincible')battle.invincible=true;
    if(mode==='deathbomb')battle.player.deathbomb=1;
    battle.checkBullet(bullet);assert.equal(battle.statistics.misses,0,mode);assert.equal(battle.graze,0,mode);
    assert.equal(bullet.alive,mode!=='dead');battle.dispose();
  }
  // Source circles return contact=1 during invulnerability: retire the enemy
  // bullet without a miss. A nearby bullet may still graze during this timer.
  for(const x of [0,10]){
    const {battle,bullet}=collisionFixture('XiaoYu',{position:{x,y:0}});battle.player.invulnerable=60;
    battle.checkBullet(bullet);assert.equal(battle.sharedPlayer.state,1);
    assert.equal(bullet.alive,x!==0);assert.equal(battle.graze,Number(x!==0));battle.dispose();
  }
});

test('straight beams use source type1 trimming and curves have one shared sample owner',()=>{
  // Rush width4 draws width8; source type1 collision width is8/2=4.
  // Its midpoint side boundary is therefore2 + player radius3 =5.
  for(const [width,playerY,expected] of [[4,5,true],[4,5.125,false],
    [16,11,true],[16,11.125,false],[32,21.5,true],[32,21.75,false]]){
    const battle=new RushBattle([emptyPhase],{profile:'portrait'});
    const beam=battle.laser({x:0,y:0},0,0,{width,length:20});
    assert.equal(battle.intersectsBullet(beam,3,{x:10,y:playerY}),expected);
    assert.equal(battle.intersectsBullet(beam,0,{x:0,y:0}),false,'type1 trims length to95% around the midpoint');
    assert.equal(battle.intersectsBullet(beam,0,{x:.5,y:0}),true);
    battle.dispose();
  }
  const warning=new RushBattle([emptyPhase],{profile:'portrait'});
  const delayed=warning.laser({x:0,y:0},0,0,{delay:8,width:4,length:20});
  assert.equal(warning.intersectsBullet(delayed,3,{x:10,y:0}),false,'laser delay is a source warning state');
  delayed.delay=0;assert.equal(warning.intersectsBullet(delayed,3,{x:10,y:0}),true);
  delayed.checking=false;assert.equal(warning.intersectsBullet(delayed,3,{x:10,y:0}),false);warning.dispose();
  const battle=new RushBattle([emptyPhase],{profile:'portrait',invincible:true});
  const head=battle.laser({x:0,y:0},0,0,{curve:true,width:8,vx:480,vy:0});
  for(let i=0;i<3;i++){
    head.x=i*8;const part=battle.addLaserPart(head);battle.projectiles.updateLasers();
    assert.equal(battle.intersectsBullet(part,3,part),false,'render parts never become independent contact owners');
    const segments=getTouhouLaserCollisionSegments(battle.projectiles.lasers.get(head));
    // Original type2 retains a full pre-birth buffer at the origin. With
    // speed8, sample0 is below16 and samples1..88 contribute, even before
    // their positions have separated. Visual Part count is not capacity.
    assert.equal(segments.length,88,'source distance uses the complete birth history');
    assert.ok(segments.every(segment=>segment.position.x>=8&&segment.position.x<=16));
    if(i===2){assert.equal(battle.intersectsBullet(head,3,{x:16,y:0}),true);assert.equal(battle.intersectsBullet(head,0,{x:16,y:10}),false);}
  }
  battle.dispose();
});

test('JunDan and LianDan use the correct shared raw sprites in every palette entry',()=>{
  for(let color=0;color<16;color++){
    const jun=`bullet-small.${String(16+color).padStart(3,'0')}`,linked=`bullet-small.${String(160+color).padStart(3,'0')}`;
    assert.equal(bulletSprite('JunDan',color),jun);assert.ok(commonManifest.sprites[jun]);
    assert.equal(bulletSprite('LianDan',color),linked);assert.ok(commonManifest.sprites[linked]);
  }
  for(const kind of Object.keys(BULLET_STYLES))for(let color=0;color<BULLET_STYLES[kind].colors;color++){
    const name=bulletSprite(kind,color);if(name)assert.ok(commonManifest.sprites[name],name);
  }
});

test('solid hearts and animated flames use only their original fallback rectangles',()=>{
  const regions=[],assets={region(...args){regions.push(args.slice(1));}};
  const {host}=hostFixture(),graphics=new RushGraphics(host,assets),draw=new DrawList();
  for(let color=0;color<8;color++){
    assert.equal(bulletSprite('XinDan',color),null);
    graphics.bullet(draw,{kind:'XinDan',color,x:0,y:0,frame:0,alpha:1});
    assert.deepEqual(regions.at(-1).slice(0,2),['src_bullet_3',[color*32,0,32,32]]);
  }
  for(let color=0;color<4;color++)for(let frame=0;frame<8;frame++){
    assert.equal(bulletSprite('YanDan',color),null);
    graphics.bullet(draw,{kind:'YanDan',color,x:0,y:0,frame,alpha:1});
    assert.deepEqual(regions.at(-1).slice(0,2),['src_bullet_3',[(color%2)*128+Math.floor(frame/2)*32,128+Math.floor(color/2)*32,32,32]]);
  }
  assert.deepEqual(graphics.snapshot().fallbacks,['XinDan','YanDan']);graphics.dispose();
});

test('main-page input reaches all sixteen selectable boss spell cards through practice',()=>{
  const counts=BOSSES.map(b=>b.phases.filter(p=>p.spell).length);assert.deepEqual(counts,[4,5,7]);
  let selected=0;
  for(let bossIndex=0;bossIndex<BOSSES.length;bossIndex++){
    const spells=BOSSES[bossIndex].phases.map((p,i)=>({p,i})).filter(e=>e.p.spell);
    for(let spellIndex=0;spellIndex<spells.length;spellIndex++){
      const {host,resources}=hostFixture(),game=new RushGame(host,{resources,invincible:true});
      tap(game,Keys.DOWN);assert.equal(game.selection,1);
      tap(game,Keys.CONFIRM);assert.equal(game.screen,'difficulty');assert.equal(game.practice,true);game.render();
      tap(game,Keys.RIGHT);assert.equal(game.difficulty,2);
      tap(game,Keys.CONFIRM);assert.equal(game.screen,'character');game.render();
      tap(game,Keys.RIGHT);assert.equal(game.character,1);
      tap(game,Keys.CONFIRM);assert.equal(game.screen,'boss');game.render();
      for(let index=0;index<bossIndex;index++)tap(game,Keys.DOWN);
      tap(game,Keys.CONFIRM);assert.equal(game.screen,'spell');game.render();
      for(let index=0;index<spellIndex;index++)tap(game,Keys.DOWN);
      assert.equal(game.spellIndex,spellIndex);
      tap(game,Keys.CONFIRM);assert.equal(game.screen,'battle');
      assert.equal(game.battle.bossKey,BOSSES[bossIndex].key);assert.strictEqual(game.battle.phase,spells[spellIndex].p);
      assert.equal(game.battle.phaseIndex,spells[spellIndex].i);assert.equal(game.battle.singlePhase,true);
      assert.equal(game.battle.difficulty,2);assert.equal(game.battle.character,1);game.render();
      selected++;disposeGame(game);
    }
  }
  assert.equal(selected,16);
});

test('pause freezes simulation, continues, retries the selected spell, returns and quits',()=>{
  const {host,calls,resources}=hostFixture(),game=new RushGame(host,{resources,startBoss:'artia',practice:true,phaseIndex:3,invincible:true});
  game.update(0);const initialFrame=game.battle.frame;
  tap(game,Keys.PAUSE);assert.equal(game.paused,true);game.render();
  for(let index=0;index<8;index++)game.update(0);
  assert.equal(game.battle.frame,initialFrame);assert.ok(calls.some(call=>call[0]==='pauseMusic'));
  tap(game,Keys.CONFIRM);assert.equal(game.paused,false);assert.equal(game.battle.frame,initialFrame+1);
  assert.ok(calls.some(call=>call[0]==='resumeMusic'));
  tap(game,Keys.PAUSE);const beforeCancelBombs=game.battle.player.bombs;
  tap(game,Keys.BOMB);assert.equal(game.paused,false);assert.equal(game.battle.player.bombs,beforeCancelBombs);
  tap(game,Keys.PAUSE);tap(game,Keys.DOWN);assert.equal(game.pauseSelection,1);
  const previous=game.battle;tap(game,Keys.CONFIRM);assert.notStrictEqual(game.battle,previous);
  assert.equal(game.battle.phaseIndex,3);assert.equal(game.bossIndex,2);assert.equal(game.battle.frame,1);
  tap(game,Keys.PAUSE);tap(game,Keys.DOWN);tap(game,Keys.DOWN);tap(game,Keys.CONFIRM);
  assert.equal(game.screen,'title');assert.equal(game.paused,false);assert.equal(game.battle,null);
  tap(game,Keys.BOMB);assert.equal(game.selection,5);tap(game,Keys.CONFIRM);
  assert.equal(calls.filter(call=>call[0]==='quit').length,1);disposeGame(game);
});

test('practice menu cancellation walks backward without accidentally starting a battle',()=>{
  const {host,resources}=hostFixture(),game=new RushGame(host,{resources});
  tap(game,Keys.DOWN);tap(game,Keys.CONFIRM);tap(game,Keys.CONFIRM);tap(game,Keys.CONFIRM);tap(game,Keys.CONFIRM);
  assert.equal(game.screen,'spell');
  for(const expected of ['boss','character','difficulty','title']){tap(game,Keys.BOMB);assert.equal(game.screen,expected);}
  assert.equal(game.battle,null);disposeGame(game);
});

test('main-page sound volume applies to subsequent battle cues as well as menus',()=>{
  const {host,calls,resources}=hostFixture(),game=new RushGame(host,{resources});
  game.soundVolume=0;game.startBattle(0);game.battle.sound('tan00');
  assert.equal(calls.filter(call=>call[0]==='playSound').at(-1)[2],0);
  game.soundVolume=0.25;game.battle.sound('tan00');
  const sourceVolume=game.assets.manifest.sounds.se_tan00?.volume??1;
  assert.equal(calls.filter(call=>call[0]==='playSound').at(-1)[2],0.25*sourceVolume);
  disposeGame(game);
});
