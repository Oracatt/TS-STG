import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AnmBank } from '../packages/thlib/src/touhou/anm.js';
import { TouhouHud } from '../packages/thlib/src/touhou/hud.js';
import { TouhouItems } from '../packages/thlib/src/touhou/items.js';
import { TouhouSpell, encodeTouhouSpellTime } from '../packages/thlib/src/touhou/spell.js';
import { TouhouGame } from '../packages/thlib/src/touhou/game.js';
import { createTouhouResources } from '../packages/thlib/src/touhou/resources.js';
import { TouhouRenderQueue } from '../packages/thlib/src/touhou/render-queue.js';
import { DrawList } from '../packages/thlib/src/render.js';
import { anmSpriteVertices } from '../packages/thlib/src/touhou/anm-render.js';

const data=name=>JSON.parse(fs.readFileSync(new URL(`../packages/thlib/assets/touhou-common/anm/${name}.json`,import.meta.url)));
const bank=name=>new AnmBank(data(name),{loadTexture:()=>11});
const fixture=()=>new TouhouHud({bank:bank('front'),textBank:bank('ascii_960'),font:{draw(){}}});
const advance=(hud,n)=>{for(let i=0;i<n;i++)hud.update();};

test('HUD capture uses source ANM banner and ten independent digit/comma animations with original point units',()=>{
  const hud=fixture();hud.notice(0,12345678);
  assert.deepEqual(hud.snapshot().notices.map(n=>[n.type,n.scriptId,n.sprite]),[[0,49,39]]);
  assert.deepEqual(hud.scoreDigits.map(vm=>[vm.scriptId,vm.spriteIndex]),[[4,240],[5,241],[6,242],[7,243],[8,244],[9,245],[10,246],[11,247],[12,253],[13,253]]);
  assert.ok(hud.scoreDigits.every(vm=>vm.drawPriority===60));
  advance(hud,60);assert.ok(hud.scoreDigits.every(vm=>vm.visible&&vm.alpha===255));
  advance(hud,94);assert.equal(hud.snapshot().notices.length,0);assert.equal(hud.activeNotice,true,'time panel continues through frame 170');
  advance(hud,16);assert.equal(hud.activeNotice,false);hud.destroy();
});

test('source notice slots replace their own group while capture and Extend coexist',()=>{
  const hud=fixture();hud.notice(0,500000);const old=hud.notices[0].animation;
  assert.deepEqual(hud.scoreDigits.map(vm=>vm.visible),[false,false,true,true,true,true,true,true,true]);
  assert.deepEqual(hud.scoreDigits.map(vm=>vm.scriptId),[4,5,6,7,8,9,10,11,13]);
  hud.notice(4);assert.deepEqual(hud.snapshot().notices.map(n=>n.scriptId),[49,53]);
  hud.notice(1);assert.equal(old.alive,false);assert.deepEqual(hud.snapshot().notices.map(n=>n.scriptId),[50,53]);
  const extend=hud.notices[1].animation;hud.notice(2);assert.equal(extend.alive,false);assert.equal(hud.notices[1].animation.scriptId,51);
  const state=JSON.stringify(hud.snapshot());assert.equal(hud.notice(5),false);assert.equal(JSON.stringify(hud.snapshot()),state);
  advance(hud,170);assert.equal(hud.activeNotice,false);hud.destroy();
});

test('notice frame, real-time text and layer 22 layout come from recovered HUD rules',()=>{
  const hud=fixture(),calls=[];hud.font={draw(_draw,text,options){calls.push({text,...options});}};
  const spell={frames:1234,encodedTime:encodeTouhouSpellTime(20,75),active:false};hud.notice(1,0,{spell});advance(hud,60);
  const queue=new TouhouRenderQueue(),draw=new DrawList();hud.drawNotices(queue);queue.flush(draw);
  assert.deepEqual(calls.map(c=>[c.text,c.x,c.y,c.font,c.drawPriority]),[[' 20.',224,144,4,84],['56s',268,150,4,84],[' 20.',224,160,4,84],['75s',268,166,4,84]]);
  const title=hud.notices[0].animation;assert.equal(title.layer,22);assert.equal(title.drawPriority,60);
  assert.ok(draw.commands.some(c=>c[0]==='statefulQuad'&&c[6]===336&&c[7]===24),'source playfield origin retained');
  calls.length=0;spell.encodedTime=0;hud.update();hud.drawNotices(draw);assert.equal(calls[2].text,'999.');assert.equal(calls[3].text,'99s');hud.destroy();
});

test('capture and failed result banners stay above both time rows for their entire visible lifetime',()=>{
  const view={x:336,y:24,scale:1,screenScale:1.5};
  const bounds=vm=>{const vertices=anmSpriteVertices(vm,view);return{top:Math.min(...vertices.map(v=>v[1])),bottom:Math.max(...vertices.map(v=>v[1]))};};
  for(const type of [0,1]){
    const hud=fixture(),calls=[];hud.font={draw(_draw,text,options){calls.push({text,...options});}};
    hud.notice(type,12345678,{spell:{frames:1234,encodedTime:encodeTouhouSpellTime(20,75),active:false}});
    const banner=hud.notices[0].animation,time=hud.timeNotice.animation;
    assert.equal(banner.F(0x30),type===0?160:256,'source ANM coordinate is unmodified');
    assert.equal(banner.y,type===0?0:-32,'only the failed composition resolves the half-height collision');
    assert.equal(time.F(0x30),256);assert.equal(time.y,0,'original label anchor remains intact');
    let compared=0;
    for(let frame=0;frame<=170;frame++){
      if(banner.alive&&banner.alpha&&time.alive&&time.alpha){
        const title=bounds(banner),label=bounds(time);compared++;
        assert.ok(title.bottom<=label.top,`type ${type}, frame ${frame}: title overlaps time labels`);
        assert.ok(title.bottom<216,`type ${type}, frame ${frame}: title overlaps first time digit row`);
        if(type===0)for(const digit of hud.scoreDigits.filter(vm=>vm.alive&&vm.visible&&vm.alpha))
          assert.ok(bounds(digit).bottom<=label.top,`capture score overlaps time at frame ${frame}`);
      }
      calls.length=0;hud.drawNotices(new DrawList());
      if(time.alive)assert.deepEqual(calls.map(c=>[c.x,c.y]),[[224,144],[268,150],[224,160],[268,166]],'time label and number composition retains source rows');
      hud.update();
    }
    assert.ok(compared>80);hud.destroy();
  }
});

test('spell capture, failed defeat and timeout keep original notification and audio boundaries',()=>{
  const hud=fixture(),sounds=[],player={x:0,y:400,bomb:null,score:0};
  const context={sound:id=>sounds.push(id),hudNotice:(type,value)=>hud.notice(type,value,{spell})};
  const spell=new TouhouSpell({player,context});
  spell.begin({duration:600});spell.age.set(120);spell.capture();
  assert.deepEqual(sounds,[33,46]);assert.equal(hud.snapshot().notices[0].scriptId,49);
  assert.equal(hud.snapshot().notices[0].value,1000000);assert.equal(player.score,100000,'stored score units stay /10');
  sounds.length=0;spell.begin({duration:600});spell.age.set(120);spell.notifyPlayerMiss();
  assert.equal(hud.snapshot().notices[0].scriptId,49,'loss of capture eligibility is not a completed-card notice');
  spell.finish();assert.deepEqual(sounds,[33]);assert.equal(hud.snapshot().notices[0].scriptId,50,'failed defeat has no timeout sound in source');
  sounds.length=0;spell.begin({duration:600});spell.age.set(600);spell.timeout();
  assert.deepEqual(sounds,[33,69]);assert.equal(hud.snapshot().notices[0].scriptId,50);
  sounds.length=0;spell.begin({duration:600,survival:true});spell.age.set(600);spell.timeout();
  assert.deepEqual(sounds,[33,46]);assert.equal(hud.snapshot().notices[0].scriptId,49);hud.destroy();
});

test('result time follows the completed clock generation when the next card begins in the same frame',()=>{
  const hud=fixture(),spell=new TouhouSpell();spell.context.hudNotice=(type,value)=>hud.notice(type,value,{spell});
  spell.begin({duration:600});spell.postFrame(5);spell.frames=124;spell.capture();
  const encoded=spell.postFrame(7.25);spell.begin({duration:600});hud.update();
  assert.equal(hud.snapshot().time.frames,124);assert.equal(hud.snapshot().time.encodedTime,encoded);
  spell.context.hudNotice=undefined;spell.postFrame(7.25);spell.frames=124;spell.capture();spell.postFrame(10.5);hud.update();
  assert.equal(hud.snapshot().time.encodedTime,encoded,'a later generation with identical frames cannot overwrite the earlier notice');hud.destroy();
});

test('full life pickup and third fragment emit Extend once; incomplete fragments do not',()=>{
  for(const [type,fragments,extended] of [[5,0,true],[4,2,true],[4,1,false]]){
    const hud=fixture(),sounds=[],events=[],player={x:0,y:400,state:1,power:100,lives:2,bombs:2,lifeFragments:fragments};
    const items=new TouhouItems({player,context:{sound:id=>sounds.push(id),hudNotice:(type,value)=>hud.notice(type,value),onEvent:(...event)=>events.push(event)}});
    items.spawn({type,x:0,y:400,speed:0});sounds.length=0;items.update();
    assert.equal(player.lives,extended?3:2);assert.deepEqual(sounds,extended?[17,37]:[37]);
    assert.deepEqual(hud.snapshot().notices.map(n=>n.scriptId),extended?[53]:[]);
    assert.equal(events.filter(e=>e[0]==='hudNotice').length,0,'direct HUD callback does not duplicate legacy event');
    advance(hud,110);assert.equal(hud.activeNotice,false);hud.destroy();
  }
  const events=[],items=new TouhouItems({player:{x:0,y:400,lives:2,bombs:2},context:{onEvent:(...event)=>events.push(event)}});
  items.extendLife();assert.deepEqual(events.find(e=>e[0]==='hudNotice'),['hudNotice',{type:4,value:0}],'legacy standalone event hook preserved');
});

test('public Game composes spell and item notices without business-specific adapters',()=>{
  const root=new URL('../',import.meta.url),resources=createTouhouResources({readText:file=>fs.readFileSync(new URL(file,root),'utf8'),loadTexture:()=>11});
  const sounds=[],game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,onSound:id=>sounds.push(id)});
  game.beginSpell({duration:600});game.spell.capture(game.context);game.items.extendLife(game.context);
  assert.deepEqual(game.hud.snapshot().notices.map(n=>n.scriptId),[49,53]);assert.ok(sounds.includes(46)&&sounds.includes(17));
  for(let i=0;i<60;i++)game.update();assert.ok(game.render().length>0);game.destroy();resources.dispose();
});

test('public Game Boss defeat replaces the minor-enemy death while ordinary enemies keep their own sound and ANM',()=>{
  const root=new URL('../',import.meta.url),resources=createTouhouResources({readText:file=>fs.readFileSync(new URL(file,root),'utf8'),loadTexture:()=>11});
  const sounds=[],game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,onSound:id=>sounds.push(id)});
  const boss=game.spawnEnemy({x:0,y:128,hp:5000,script:0,deathSound:3,drop:[{type:5}]});
  game.enterBoss(boss,{onDefeated:({game,boss,source})=>game.beginBossDefeat(boss,{source})});
  boss.defeat(null,game.context);
  assert.equal(boss.alive,true);assert.equal(game.bossPresentation.snapshot().deaths.length,0);
  assert.equal(game.items.items.length,0);assert.equal(game.bossDefeats.length,1);
  for(let frame=0;frame<60;frame++)game.update();
  const death=game.bossPresentation.snapshot().deaths;
  assert.equal(death.length,1);assert.deepEqual(death[0].position,{x:boss.x,y:boss.y,z:0});assert.deepEqual(death[0].roots.map(vm=>vm.scriptId),[25,57]);
  assert.equal(boss.effects.length,0);assert.ok(!sounds.includes(3));assert.equal(sounds.filter(id=>id===5).length,2);
  assert.equal(game.items.items.length,1,'death ownership does not suppress ordinary reward drops');
  assert.equal(boss.deathScript,37);assert.equal(boss.deathSound,3,'registered Boss did not mutate the minor-enemy defaults');
  const ordinary=game.spawnEnemy({x:60,y:128,hp:5000,script:0,deathSound:4});ordinary.defeat(null,game.context);
  assert.deepEqual(ordinary.effects.map(vm=>vm.scriptId),[37]);assert.ok(sounds.includes(4));assert.equal(game.bossPresentation.snapshot().deaths.length,1,'large HP and hp-derived flags never infer Boss identity');
  game.destroy();resources.dispose();
});
