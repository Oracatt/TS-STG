import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DrawList,Keys} from '@ts-stg/thlib';
import {AnmBank,TouhouApplication,TouhouSceneTransition,TouhouStageSelect} from '@ts-stg/thlib/touhou';

const common='packages/thlib/assets/touhou-common/anm/',reference='games/touhou20/assets/anm/';
const available=fs.existsSync(`${common}screenswitch.json`)&&fs.existsSync(`${reference}screenswitch.json`); // reference = private local assets
const read=(name,prefix=common)=>JSON.parse(fs.readFileSync(`${prefix}${name}.json`,'utf8'));
const makeBank=(name,prefix=common)=>new AnmBank(read(name,prefix),{loadTexture:()=>1});
const tick=(object,count)=>{for(let i=0;i<count;i++)object.update();};

test('source transition retains each ANM trajectory and loading timing through cover, hold and reveal',{skip:!available},()=>{
  const bank=makeBank('screenswitch'),ascii=makeBank('ascii_960');
  const actual=new TouhouSceneTransition({bank,loadingBank:ascii});
  const oracle=makeBank('screenswitch',reference),text=makeBank('ascii_960',reference);
  let panels=[3,4,5,6].map(script=>oracle.create(script,{x:320,y:240}));
  panels[0].setLayer(35);
  const mask=oracle.create(11),loading=text.create(17,{x:960,y:784});
  const compare=()=>{
    assert.deepEqual(actual.panels.map(vm=>vm.snapshot()),panels.map(vm=>vm.snapshot()));
    assert.deepEqual(actual.mask.snapshot(),mask.snapshot());
    assert.deepEqual(actual.loading.snapshot(),loading.snapshot());
  };
  compare();tick(actual,29);tick(oracle,29);tick(text,29);compare();assert.equal(actual.ready,false);
  actual.update();oracle.update();text.update();compare();assert.equal(actual.ready,true);
  tick(actual,16);tick(oracle,16);tick(text,16);compare();
  assert.equal(actual.panels[0].renderType,16,'Source script3 holds a fully closed colored plane after frame45');
  assert.deepEqual(actual.panels.map(vm=>vm.alive),[true,false,false,false]);
  actual.reveal();for(const vm of panels)vm.destroy();panels=[7,8,9,10].map(script=>oracle.create(script,{x:320,y:240}));loading.interrupt(1,true);compare();
  for(let i=0;i<54;i++){actual.update();oracle.update();text.update();compare();}
  assert.equal(actual.alive,true);actual.update();assert.equal(actual.alive,false);
  assert.equal(bank.instances.length,0);assert.equal(ascii.instances.length,0);
});

test('transition composition clears only framebuffer alpha, uses source mask blend and restores render state',{skip:!available},()=>{
  const bank=makeBank('screenswitch'),effect=new TouhouSceneTransition({bank});tick(effect,15);
  const draw=new DrawList();effect.draw(draw);
  assert.deepEqual(draw.commands.slice(0,4),[
    ['alphaTest',0],['blendFactors','zero','one','add','one','zero','add'],['rect',0,0,960,720,0],['blendEnd'],
  ]);
  // ANM's optimized stateful quad preserves the mask's source blend mode7.
  const mask=draw.commands.filter(command=>command[0]==='statefulQuad').at(-1);
  assert.ok(mask);assert.ok(mask.some(value=>Array.isArray(value)&&value[1]==='dstAlpha'&&value[2]==='oneMinusDstAlpha'));
  const fallback=new TouhouSceneTransition({bank,masked:false,loadingScript:null}),plain=new DrawList();fallback.draw(plain);
  assert.equal(plain.commands.some(command=>command[0]==='rect'),false);
  fallback.destroy();effect.destroy();
});

function applicationFixture(options={}){
  const events=[],banks=[];let menuStart,updates=0;
  const app=new TouhouApplication({
    createBank:name=>{const bank={dispose:()=>events.push(`dispose:${name}`)};banks.push(bank);return bank;},
    createMenu:({onStart})=>{menuStart=onStart;return{update(){events.push('menu:tick');},draw:draw=>draw.rect(0,0,1,1,1),destroy(){events.push('menu:destroy');}};},
    createGame:()=>({frame:0,update(mask){this.frame++;updates++;events.push(`game:${mask}`);},render:()=>[['clear',123]],destroy(){events.push('game:destroy');}}),
    createTransition:()=>({phase:'cover',age:0,alive:true,get ready(){return this.age>=30;},update(){if(++this.age===55&&this.phase==='reveal')this.alive=false;},reveal(){this.phase='reveal';this.age=0;},draw:draw=>draw.rect(0,0,2,2,2),destroy(){this.alive=false;events.push('transition:destroy');},snapshot(){return{phase:this.phase,age:this.age};}}),
    ...options,
  });
  return{app,events,banks,start:selection=>menuStart(selection),updates:()=>updates};
}

test('interactive application swaps after30 cover ticks and updates gameplay while reveal runs',()=>{
  const {app,start,events,updates}=applicationFixture();
  start({character:1,difficulty:2,mode:'normal'});assert.equal(app.mode,'title');
  for(let i=0;i<29;i++){app.update(16);assert.equal(app.sceneUpdated,false);}
  assert.equal(app.mode,'title');assert.equal(events.includes('menu:tick'),false);assert.equal(updates(),0);
  app.update(16);assert.equal(app.mode,'game');assert.equal(app.game.frame,0);assert.equal(app.sceneUpdated,false);
  assert.equal(app.transition.phase,'reveal');assert.equal(app.selection.character,1);
  assert.deepEqual(app.render(),[['clear',123],['rect',0,0,2,2,2]]);
  app.update(16);assert.equal(app.game.frame,1);assert.equal(app.sceneUpdated,true);
  tick(app,54);assert.equal(updates(),55);assert.equal(app.transition,null);
  assert.equal(events.filter(event=>event==='dispose:screenswitch').length,1);
  assert.deepEqual(app.render(),[['clear',123]]);app.destroy();
});

test('immediate starts, disabled transitions and cancellation retain application lifecycle contracts',()=>{
  const {app,start,events}=applicationFixture();start({});tick(app,10);app.start({character:1});
  assert.equal(app.mode,'game');assert.equal(app.transition,null);assert.equal(app.game.frame,0);
  assert.equal(events.filter(event=>event==='dispose:screenswitch').length,1);
  app.openMenu();start({});app.destroy();assert.equal(app.transition,null);
  assert.equal(events.filter(event=>event==='dispose:screenswitch').length,2);
  const disabled=applicationFixture({transitionOptions:false});disabled.start({});assert.equal(disabled.app.mode,'game');assert.equal(disabled.app.transition,null);disabled.app.destroy();
  const immediate=applicationFixture({autostart:true});assert.equal(immediate.app.mode,'game');assert.equal(immediate.app.transition,null);immediate.app.destroy();
});

test('stage selection covers at age10 and swaps at age40 without adding a second launch delay',()=>{
  let list,lateSelection=0;
  const {app}=applicationFixture({createMenu:options=>list=new TouhouStageSelect({
    bank:{},font:{draw(){}},headingScript:false,entries:[{label:'Stage 1'}],
    onTransition:()=>options.onStart({character:0,difficulty:1,mode:'practice'}),onSelect:()=>lateSelection++,
  })});
  list.phase=2;list.age=20;app.update(Keys.CONFIRM);tick(app,9);
  assert.equal(list.age,10);assert.equal(app.transition,null);app.update();
  assert.equal(app.transition.age,0);assert.equal(list.active,true);
  tick(app,29);assert.equal(app.mode,'title');assert.equal(list.age,11,'Old page remains visible, frozen beneath the cover');
  app.update();assert.equal(app.mode,'game');assert.equal(app.game.frame,0);assert.equal(list.active,false);
  assert.equal(lateSelection,0);app.destroy();
  const events=[],standalone=new TouhouStageSelect({bank:{},font:{draw(){}},headingScript:false,entries:[{label:'Stage'}],
    onTransition:()=>events.push('cover'),onSelect:()=>events.push('launch')});
  standalone.phase=2;standalone.age=20;standalone.update(Keys.CONFIRM);tick(standalone,39);
  assert.deepEqual(events,['cover']);standalone.update();assert.deepEqual(events,['cover','launch']);
});
