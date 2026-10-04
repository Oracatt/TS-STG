import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Keys } from '@ts-stg/thlib';
import { TouhouApplication,createTouhouResources,quantizeTouhouSpellTime,invalidTouhouSpellTime } from '@ts-stg/thlib/touhou';

const root=new URL('../',import.meta.url);
function fixture(options={}){
  const resources=createTouhouResources({readText:path=>fs.readFileSync(new URL(path,root),'utf8'),loadTexture:()=>1});
  return new TouhouApplication({resources,ownResources:true,autostart:true,...options});
}

test('injected application clock records actual spell start and finish through update only',()=>{
  let now=100,reads=0;const writes=[],app=fixture({clock:()=>{reads++;return now;},gameOptions:{
    spellContext:{writeSpellTime:(...args)=>writes.push(args)},stage(game,frame){if(frame===0)game.beginSpell({duration:600});if(frame===59)game.spell.capture(game.context);},
  }});
  for(let frame=0;frame<60;frame++){now=100+frame/60;app.update();}
  const spell=app.game.spell,expected=quantizeTouhouSpellTime(59/60).encoded;
  assert.equal(reads,60);assert.equal(spell.active,false);assert.equal(spell.captureIndex,1);
  assert.equal(spell.encodedTime,expected);assert.equal(invalidTouhouSpellTime(spell.encodedTime),false);assert.equal(writes.length,1);
  now+=1/60;app.update();assert.equal(writes.length,1,'finished result is written once');
  assert.equal(app.game.hud.snapshot().time.encodedTime,expected,'HUD observes the completed platform time on its next update');app.destroy();
});

test('omitting the clock preserves pure simulation and explicit postFrame integration',()=>{
  const app=fixture({gameOptions:{stage(game,frame){if(frame===0)game.beginSpell({duration:600});}}});
  app.update();assert.equal(app.game.spell.flags&0x40,0);assert.equal(app.game.spell.captureIndex,0);
  app.postFrame(10);assert.equal(app.game.spell.flags&0x40,0x40);
  app.game.spell.capture(app.game.context);app.update();assert.equal(app.game.spell.captureIndex,0);
  app.postFrame(12.5);assert.equal(app.game.spell.captureIndex,1);assert.equal(app.game.spell.encodedTime,quantizeTouhouSpellTime(2.5).encoded);app.destroy();
});

test('paused frames retain the source platform clock while spell simulation remains frozen',()=>{
  let now=0,reads=0;const app=fixture({clock:()=>{reads++;return now;},gameOptions:{stage(game,frame){if(frame===0)game.beginSpell({duration:600});}}});
  for(let frame=0;frame<40;frame++){now=frame/60;app.update();}
  const simulated=app.game.spell.frames;now=1;app.update(Keys.PAUSE);assert.equal(app.game.paused,true);
  for(let frame=0;frame<20;frame++){now=2+frame/60;app.update();}
  assert.equal(app.game.spell.frames,simulated);assert.equal(reads,61,'early return inside paused Game still reaches application postFrame');
  app.game.spell.capture(app.game.context);now=5;app.update();assert.equal(app.game.spell.encodedTime,quantizeTouhouSpellTime(5).encoded);app.destroy();
});

test('automatic clock runs after callbacks and respects deferred scene transitions and disposal',()=>{
  const order=[];let app;
  app=new TouhouApplication({clock:()=>{order.push('clock');return 7;},createBank:()=>({dispose(){}}),onAfterUpdate:()=>order.push('after'),
    createMenu:()=>({update(){order.push('menu');app.start();},destroy(){order.push('destroy-menu');}}),
    createGame:()=>({update(){order.push('game');},postFrame(now){order.push(['post',now]);},destroy(){}}),
  });
  app.update();assert.deepEqual(order,['menu','destroy-menu','after','clock',['post',7]]);
  app.destroy();order.length=0;app.update();assert.deepEqual(order,[],'disposed applications do not read the host clock');
});
