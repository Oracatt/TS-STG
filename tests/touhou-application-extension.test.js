import test from 'node:test';
import assert from 'node:assert/strict';
import {DrawList,Keys} from '@ts-stg/thlib';
import {TouhouApplication} from '../packages/thlib/src/touhou/application.js';
import {TouhouTitleMenu} from '../packages/thlib/src/touhou/menu.js';
import {createTouhouResources} from '../packages/thlib/src/touhou/resources.js';
import {TouhouDialogue} from '../packages/thlib/src/touhou/dialogue.js';
import {TouhouGameOver,continueTouhouGame} from '../packages/thlib/src/touhou/game-over.js';
import {TouhouPlayer} from '../packages/thlib/src/touhou/player.js';
import {TOUHOU_PLAYER_DATA} from '../packages/thlib/src/touhou/player-data.js';

const ticks=(owner,count,mask=0)=>{for(let n=0;n<count;n++)owner.update(mask);};
function bank(name='fixture'){
  return {name,instances:[],disposed:false,create(scriptId){
    const vm={scriptId,children:[],alive:true,layer:35,alpha:255,color:0xffffff,scaleX:1,
      interrupt(){},interruptNow(){},flag(){},F(){},update(){},draw(){},worldPosition:()=>({x:0,y:0}),destroy(){this.alive=false;}};
    this.instances.push(vm);return vm;
  },update(){},draw(){},collect(){},dispose(){this.disposed=true;}};
}
const emptyArchive=name=>({format:'touhou-anm-v8',name,entries:[],scripts:[],sprites:[]});

test('registered cutscene and ending scenes share deferred switching, source transition and scoped banks',()=>{
  const events=[],banks=[];
  const app=new TouhouApplication({initialScene:'opening',createBank:name=>{const value=bank(name);banks.push(value);return value;},
    transitionOptions:{loadingBank:null},createTransition:()=>({phase:'cover',age:0,alive:true,
      get ready(){return this.age===2;},update(){this.age++;if(this.phase==='reveal'&&this.age===2)this.alive=false;},
      reveal(){this.phase='reveal';this.age=0;},draw(){events.push('transition:draw');},destroy(){events.push('transition:destroy');}}),
    scenes:{opening:({createBank},application)=>{createBank('intro');return{
      update(){events.push('opening:update');application.switchScene('ending',{transition:true,data:{ending:'good'}});events.push('opening:done');},
      draw(){events.push('opening:draw');},destroy(){events.push('opening:destroy');}};},
      ending:({data,createBank})=>{assert.deepEqual(data,{ending:'good'});createBank('credits');return{
        update(){events.push('ending:update');},draw(){events.push('ending:draw');},destroy(){events.push('ending:destroy');}};}},
  });
  assert.equal(app.mode,'opening');assert.equal(banks.length,1);app.update();
  assert.deepEqual(events,['opening:update','opening:done']);assert.equal(app.mode,'opening');app.render();
  ticks(app,2);assert.equal(app.mode,'ending');assert.equal(banks[0].disposed,true);assert.equal(app.transition.phase,'reveal');
  app.update();assert.equal(events.at(-1),'ending:update');app.render();assert.ok(events.includes('ending:draw'));
  const previous=app.scene;assert.throws(()=>app.switchScene('missing'),/Unknown/);assert.equal(app.scene,previous);
  app.destroy();assert.ok(banks.every(value=>value.disposed));
});

test('custom character profiles allocate their actual bank and pass gameplay profile/shot data to the game factory',()=>{
  const names=[],sht={custom:true},profile={id:'sakuya'},resources={players:{sakuya:{bank:'knife-player',profile,sht}},shots:{},
    createBank(name){names.push(name);return bank(name);}};let received;
  const app=new TouhouApplication({resources,autostart:true,initialSelection:{character:'sakuya'},
    createGame:options=>{received=options;return{update(){},render:()=>[],destroy(){}};}});
  assert.ok(names.includes('knife-player'));assert.equal(names.includes('pl01'),false);
  assert.equal(received.systemOptions.player.profile,profile);assert.equal(received.systemOptions.player.sht,sht);
  assert.equal(received.systemOptions.player.bank,received.banks['knife-player']);app.destroy();
});

test('application maps menu difficulty identifiers through gameOptions without changing the selected identifier',()=>{
  let received;
  const app=new TouhouApplication({autostart:true,initialSelection:{difficulty:'hard-mode'},createBank:bank,
    gameOptions:selection=>({difficulty:selection.difficulty==='hard-mode'?2:0}),
    createGame:options=>{received=options;return{update(){},draw(){}};}});
  assert.equal(app.selection.difficulty,'hard-mode');assert.equal(received.difficulty,2);app.destroy();
  const custom=new TouhouApplication({autostart:true,initialSelection:{difficulty:'custom'},createBank:bank,
    createGame:options=>{received=options;return{update(){},draw(){}};}});
  assert.equal(received.difficulty,'custom');custom.destroy();
});

test('scene lifecycle redirects queue until ownership is established and clean up a cancelled transition',()=>{
  const banks=[],events=[];
  const makeScene=name=>({createBank})=>{createBank(name);return{update(){},draw(){},destroy(){events.push(`destroy:${name}`);}};};
  const app=new TouhouApplication({initialScene:'opening',createBank:name=>{const value=bank(name);banks.push(value);return value;},
    transitionOptions:{loadingBank:null},createTransition:()=>({phase:'cover',alive:true,ready:false,
      update(){this.ready=true;},reveal(){this.phase='reveal';},draw(){},destroy(){events.push('destroy:transition');}}),
    scenes:{opening:makeScene('opening'),middle:makeScene('middle'),ending:makeScene('ending')},
    onSceneChange({mode},application){if(mode==='middle')application.switchScene('ending');}});
  app.switchScene('middle',{transition:true});assert.doesNotThrow(()=>app.update());
  assert.equal(app.mode,'ending');assert.equal(app.transition,null);
  assert.deepEqual(events,['destroy:opening','destroy:transition','destroy:middle']);
  assert.ok(banks.slice(0,-1).every(value=>value.disposed));assert.equal(banks.at(-1).disposed,false);
  app.switchScene('opening',{transition:true});app.switchScene('middle');
  assert.equal(app.mode,'ending');assert.equal(app.transition,null);app.destroy();assert.ok(banks.every(value=>value.disposed));
});

test('a scene factory can redirect without overwriting the destination or leaking its scoped bank',()=>{
  const banks=[],events=[];
  const app=new TouhouApplication({initialScene:'router',createBank:name=>{const value=bank(name);banks.push(value);return value;},
    scenes:{router:({createBank},application)=>{createBank('temporary');application.switchScene('target');return{
      update(){},draw(){},destroy(){events.push('destroy:router');}};},target:({createBank})=>{createBank('target');return{update(){},draw(){}};}}});
  assert.equal(app.mode,'target');assert.deepEqual(events,['destroy:router']);assert.equal(banks[0].disposed,true);
  assert.equal(banks[1].disposed,false);app.destroy();assert.ok(banks.every(value=>value.disposed));
});

test('selection routes skip difficulty, support custom character lists and dispose their presentation',()=>{
  const pages=[],events=[],b=bank();let selected;
  const menu=new TouhouTitleMenu({bank:b,font:{draw(){}},labels:['Start'],excluded:[],characters:[{id:'alice',label:'Alice'},{id:'sakuya',label:'Sakuya'}],
    character:'alice',selectionFlow:['character'],createSelectionPage:(kind,owner)=>{
      pages.push(kind);assert.equal(owner.selectionEntries.length,2);return{draw(){events.push('draw');},destroy(){events.push('destroy');}};
    },onStart:value=>{selected=value;}});
  ticks(menu,132);menu.update(Keys.CONFIRM);ticks(menu,20);assert.deepEqual(pages,['character']);
  assert.equal(b.instances.some(vm=>vm.scriptId===12||vm.scriptId===58),false,'No unrelated source character/difficulty art is instantiated');
  ticks(menu,7);menu.update(Keys.RIGHT);menu.draw(new DrawList());menu.update(0);menu.update(Keys.CONFIRM);ticks(menu,14);
  assert.equal(selected.character,'sakuya');assert.equal(selected.difficulty,1);assert.deepEqual(events,['draw','destroy']);menu.destroy();
});

test('empty or mode-selected menu flows launch directly; unsupported character art needs an explicit renderer',()=>{
  let selected;
  const menu=new TouhouTitleMenu({bank:bank(),font:{draw(){}},labels:['Extra'],excluded:[],startModes:{0:'extra'},
    character:1,difficulty:4,selectionFlow:mode=>mode==='extra'?[]:['difficulty','character'],onStart:value=>{selected=value;}});
  ticks(menu,132);menu.update(Keys.CONFIRM);ticks(menu,20);assert.deepEqual(selected,{character:1,difficulty:4,mode:'extra'});
  assert.throws(()=>new TouhouTitleMenu({bank:bank(),characters:['alice']}),/explicit.*presentation/);menu.destroy();
});

test('resource packs load extra archives, register decoded banks and inject player data without changing built-in defaults',()=>{
  const archive=emptyArchive('custom'),reads=[],sht={custom:true},styles=[];
  const host={readText(path){reads.push(path);return JSON.stringify(path.endsWith('manifest.json')?
    {format:'ts-stg-touhou-common-v1',archives:{custom:{file:'custom.json'}}}:archive);}};
  const resources=createTouhouResources(host,{basePath:'consumer',bankNames:[],shots:{alice:sht},styles,
    players:{alice:{bank:'custom',sht,profile:{id:'alice'}}}});
  assert.deepEqual(reads,['consumer/manifest.json','consumer/custom.json']);assert.equal(resources.banks.custom.data.name,'custom');
  assert.equal(resources.shots.alice,sht);assert.equal(resources.styles,styles);assert.equal(resources.players.alice.sht,sht);
  const scene=resources.createBank('custom');assert.notEqual(scene,resources.banks.custom);
  const added=resources.registerBank('portrait',emptyArchive('portrait'));assert.equal(added,resources.banks.portrait);
  assert.throws(()=>resources.registerBank('portrait',emptyArchive('other')),/already registered/);
  assert.throws(()=>resources.registerBank('broken',{}),/decoded/);assert.equal(Object.hasOwn(resources.data,'broken'),false);
  resources.dispose();assert.equal(scene.disposed,true);assert.equal(added.disposed,true);
  assert.throws(()=>resources.registerBank('later',archive),/disposed/);
});

test('decoded resource banks can be registered in a host-free application',()=>{
  const resources=createTouhouResources(null,{archives:{consumer:emptyArchive('consumer')}});
  assert.equal(resources.banks.pl00,null);assert.equal(resources.createBank('consumer').data.name,'consumer');resources.dispose();
});

function dialogueResources(){
  const names=[],banks=[];
  return {names,banks,createBank(name){names.push(name);const value=bank(name);banks.push(value);return value;},
    encodeText:text=>new Uint8Array(text.length),writeAnimationText(){}};
}
test('dialogue custom portraits own image and motion without loading either source player bank',()=>{
  const resources=dialogueResources(),events=[];
  const dialogue=new TouhouDialogue({resources,character:'alice',exit:{completeFrame:2},
    steps:[{text:'Hello',speaker:'left',autoFrames:-1,portraits:{left:{present:true},right:{present:true}}},{terminal:true}],
    createPortrait:side=>({draw(){events.push(`${side}:draw`);},setActive(active){events.push(`${side}:${active}`);},
      update(){events.push(`${side}:update`);},finish(){events.push(`${side}:finish`);},dispose(){events.push(`${side}:dispose`);},
      state:()=>({x:20,y:30,width:80,height:160,color:0xffffff,alpha:255,layer:35})})});
  assert.deepEqual(resources.names,['front','text']);assert.equal(dialogue.portraitState('left').width,80);
  dialogue.update();dialogue.draw(new DrawList());assert.ok(events.includes('left:draw'));assert.ok(events.includes('right:false'));
  dialogue.advance();assert.ok(events.includes('left:finish'));ticks(dialogue,2);assert.equal(dialogue.complete,true);
  dialogue.dispose();dialogue.dispose();assert.equal(events.filter(event=>event==='left:dispose').length,1);
});

test('custom ANM dialogue profiles explicitly select their bank and root script',()=>{
  const resources=dialogueResources();const dialogue=new TouhouDialogue({resources,character:'alice',
    portraitProfiles:{alice:{bank:'alice-portrait',root:4,body:5,x:12,y:30,width:80,height:160}},
    steps:[{text:'Hello',speaker:'left',portraits:{left:{present:true}}}]});
  assert.ok(resources.names.includes('alice-portrait'));assert.equal(dialogue.portrait.scriptId,4);
  assert.equal(resources.names.includes('pl01'),false);dialogue.dispose();
});

test('seventh-stage continuation uses the caller policy once before notification with no additional replenishment',()=>{
  const player={lives:0,bombs:1,power:200,score:12345},session={stage:7,credits:1},events=[];
  const result=new TouhouGameOver({bank:bank(),player,session,continuePolicy:(p,s)=>{events.push('policy');p.lives=6;s.checkpoint='midboss';},
    onContinue:({player:p})=>{events.push('continue');assert.equal(p.lives,6);}});
  ticks(result,11);assert.equal(result.excluded.has(0),false);result.update(Keys.CONFIRM);ticks(result,12);
  assert.deepEqual(events,['policy','continue']);assert.deepEqual(player,{lives:6,bombs:1,power:200,score:12345});assert.equal(session.credits,1);
});

test('Extra is explicit and continuation eligibility can be replaced without changing stage numbering',()=>{
  const create=options=>new TouhouGameOver({bank:bank(),player:{},session:{stage:2,stageKind:'extra',credits:2},...options});
  const extra=create();ticks(extra,11);assert.ok(extra.excluded.has(0));
  const custom=create({canContinue:true,continuePolicy:()=>{}});ticks(custom,11);assert.equal(custom.excluded.has(0),false);
  const disabled=create({canContinue:true,continuePolicy:null});ticks(disabled,11);assert.ok(disabled.excluded.has(0));
});

test('original continuation replenishes within player rules without rewriting caps or starting power',()=>{
  const make=rules=>new TouhouPlayer({sht:TOUHOU_PLAYER_DATA[0],rules,lives:0,bombs:0,power:0});
  const expanded=make({maxLives:12,maxBombs:12,maxPower:800,powerPerLevel:200,startingPower:200});
  continueTouhouGame(expanded,{credits:2});
  assert.deepEqual([expanded.lives,expanded.bombs,expanded.power,expanded.powerLevel],[2,3,800,4]);
  assert.deepEqual([expanded.maxLives,expanded.maxBombs,expanded.maxPower,expanded.startingPower],[12,12,800,200]);
  const limited=make({maxLives:1,maxBombs:1,maxPower:150,startingPower:50});
  continueTouhouGame(limited,{credits:2});
  assert.deepEqual([limited.lives,limited.bombs,limited.power],[1,1,150]);
  assert.deepEqual([limited.maxLives,limited.maxBombs,limited.maxPower,limited.startingPower],[1,1,150,50]);
});
