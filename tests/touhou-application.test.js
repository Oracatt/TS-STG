import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as publicApi from '@ts-stg/thlib/touhou';
import * as legacy from '../games/touhou20/src/index.js';
import {Keys,DrawList} from '@ts-stg/thlib';

test('application, menu, HUD, pause and results belong to the public library',()=>{
  for(const name of ['Game','Hud','TitleMenu','Buttons','Pause','GameOver']){
    assert.equal(typeof publicApi[`Touhou${name}`],'function');
    assert.equal(legacy[`Th20${name}`],publicApi[`Touhou${name}`]);
  }
  assert.equal(legacy.continueTh20Game,publicApi.continueTouhouGame);
  assert.equal(legacy.insertTh20HighScore,publicApi.insertTouhouHighScore);
});

const root=new URL('../',import.meta.url);
const host={readText:path=>fs.readFileSync(new URL(path,root),'utf8'),loadTexture:()=>1};
const available=fs.existsSync(new URL('../packages/thlib/assets/touhou-common/anm/title.json',import.meta.url));
const ticks=(object,count,mask=0)=>{for(let i=0;i<count;i++)object.update(mask);};

test('public-only application runs source menu, character selection, game, pause, retry and title',{skip:!available},()=>{
  const resources=publicApi.createTouhouResources(host),events=[];
  const app=new publicApi.TouhouApplication({resources,gameOptions:{power:400},
    menuOptions:{excluded:[1,3,4,5,6,7,8]},onSceneChange:event=>events.push(event.mode),
    ownResources:true});
  assert.equal(app.mode,'title');ticks(app,132);app.update(Keys.CONFIRM);ticks(app,20);
  assert.equal(app.menu.state,'difficulty');ticks(app,7);app.update(Keys.CONFIRM);ticks(app,14);
  assert.equal(app.menu.state,'character');ticks(app,7);app.update(Keys.RIGHT);app.update(0);app.update(Keys.CONFIRM);ticks(app,14);
  assert.equal(app.mode,'title');assert.equal(app.transition.phase,'cover');ticks(app,30);
  assert.equal(app.mode,'game');assert.equal(app.game.player.character,1);
  assert.ok(app.game instanceof publicApi.TouhouGame);assert.ok(app.game.player instanceof publicApi.TouhouPlayer);
  ticks(app,40,Keys.SHOOT);assert.ok(app.game.player.shots.length>0);
  const frame=app.game.frame;app.update(Keys.PAUSE);ticks(app,10);
  assert.ok(app.game.pauseVisual instanceof publicApi.TouhouPause);assert.equal(app.game.frame,frame);
  app.update(0);app.update(Keys.PAUSE);ticks(app,12);assert.equal(app.game.paused,false);
  const game=app.game;app.game.onRestart();assert.notEqual(app.game,game);assert.equal(game.destroyed,true);
  assert.equal(app.game.player.character,1);app.game.onExit();assert.equal(app.mode,'title');
  assert.deepEqual(events,['title','game','game','title']);app.destroy();app.destroy();assert.equal(resources.disposed,true);
});

test('application scene callback commits after current update and owns allocated banks',()=>{
  const events=[],banks=[];let menuOptions,gameOptions;
  const fakeBank=name=>{const bank={name,dispose:()=>events.push(`dispose:${name}`)};banks.push(bank);return bank;};
  const app=new publicApi.TouhouApplication({createBank:fakeBank,transitionOptions:false,
    createMenu:options=>{menuOptions=options;return{update(){events.push('menu:start');options.onStart({character:0,difficulty:2,mode:'practice'});events.push('menu:end');},draw(){},destroy(){events.push('menu:destroy');},snapshot(){return{};}};},
    createGame:options=>{gameOptions=options;return{update(){},render:()=>[],destroy(){events.push('game:destroy');},snapshot:()=>({frame:0})};},
  });
  assert.deepEqual(menuOptions.excluded,[1,3,4,5,6,7,8],'Unconfigured application pages remain unavailable');
  app.update();assert.deepEqual(events.slice(0,4),['menu:start','menu:end','menu:destroy','dispose:title']);
  assert.equal(app.mode,'game');assert.equal(gameOptions.session.mode,1);assert.equal(gameOptions.difficulty,2);
  app.destroy();assert.equal(events.filter(event=>event.startsWith('dispose:')).length,banks.length);
  assert.throws(()=>app.start(),/disposed/);assert.deepEqual(app.render(),[]);
});

test('menu labels, actions and animation scripts can be supplied without a game skin',()=>{
  const created=[],drawn=[],bank={instances:[],create(id){created.push(id);const vm={children:[],interrupt(){},interruptNow(){},destroy(){}};this.instances.push(vm);return vm;},update(){},draw(){}};
  const menu=new publicApi.TouhouTitleMenu({bank,font:{draw:(draw,text,options)=>drawn.push([text,options.x,options.y])},
    scripts:{0:false,31:900},labels:['Play','Close'],startModes:{0:'practice'},quitIndex:1,excluded:[],layout:{x:30,y:45,lineHeight:18}});
  assert.deepEqual(created,[900]);ticks(menu,132);menu.draw(new DrawList());
  assert.deepEqual(drawn,[['Play',30,45],['Close',30,63]]);menu.destroy();
});

test('application preserves explicit page handlers and exclusions',()=>{
  let seen,quit=0;
  const create=menuOptions=>new publicApi.TouhouApplication({menuOptions,createBank:()=>({dispose(){}}),onQuit:()=>quit++,
    createMenu:options=>{seen=options;return{destroy(){}};}});
  const handler=()=>{},custom=create({onSelect:handler});assert.equal(seen.onSelect,handler);assert.equal(seen.excluded,undefined);custom.destroy();
  const explicit=create({excluded:[2,3]});assert.deepEqual(seen.excluded,[2,3]);explicit.destroy();
  const short=create({labels:['Play','Quit']});assert.deepEqual(seen.excluded,[]);assert.deepEqual(seen.startModes,{0:'normal'});seen.onSelect(1);assert.equal(quit,1);short.destroy();
});

test('cancel selects the configured quit item when a custom menu reorders entries',()=>{
  const actions=[],bank={instances:[],update(){},draw(){}};
  const menu=new publicApi.TouhouTitleMenu({bank,font:{draw(){}},scripts:{0:false,31:false},
    labels:['Close','Play','About'],startModes:{1:'normal'},quitIndex:0,excluded:[],onSelect:index=>actions.push(index)});
  ticks(menu,132);menu.selection=1;menu.update(Keys.CANCEL);assert.equal(menu.selection,0);
  menu.update(0);menu.update(Keys.CANCEL);ticks(menu,20);assert.deepEqual(actions,[0]);menu.destroy();
});
