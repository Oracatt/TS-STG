import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouhouSpellCard,validateTouhouSpellCard,parseTouhouSpellCard,serializeTouhouSpellCard,TouhouSpellCardTimeline} from '../packages/thlib/src/touhou/spellcard.js';
import {TouhouBulletField} from '../packages/thlib/src/touhou/bullets.js';
import {TouhouRandom} from '../packages/thlib/src/touhou/bullet-patterns.js';
import {TouhouBossCharge} from '../packages/thlib/src/touhou/boss-presentation.js';
import {bulletTestBank,bulletTestStyles} from './fixtures/th20-bullet-bank.js';

const document=(events=[],overrides={})=>({...createTouhouSpellCard(),duration:12,events,...overrides});
const bullet=(overrides={})=>({...createTouhouSpellCard().events[1],id:'bullet',frame:0,duration:1,interval:1,...overrides});
const charge=(overrides={})=>({...createTouhouSpellCard().events[0],id:'charge',releaseFrame:3,...overrides});
const laser=(overrides={})=>({id:'laser',type:'laser',frame:0,enabled:true,duration:1,interval:1,x:0,y:0,origin:'boss',
  kind:'straight',color:4,angle:.5,rotation:.25,speed:3,width:12,length:120,delay:20,grow:15,sustain:120,shrink:15,...overrides});
const move=(overrides={})=>({id:'move',type:'move',frame:0,enabled:true,duration:4,x:100,y:100,easing:'linear',...overrides});
const tick=(timeline,count)=>{for(let frame=0;frame<count;frame++)timeline.update();};

test('spell-card documents round-trip Unicode, independent edits and the entire uint32 random seed',()=>{
  const first=createTouhouSpellCard(),second=createTouhouSpellCard();
  first.name='梦符「测试」';first.seed=0xffffffff;
  const checked=validateTouhouSpellCard(first);assert.notEqual(checked,first);assert.notEqual(checked.events[0],first.events[0]);
  checked.boss.x=80;assert.equal(first.boss.x,0);first.events[0].x=20;assert.equal(second.events[0].x,0);
  const text=serializeTouhouSpellCard(first),restored=parseTouhouSpellCard(text);
  assert.deepEqual(restored,validateTouhouSpellCard(first));assert.equal(restored.seed,0xffffffff);assert.equal(restored.name,first.name);
  assert.equal(serializeTouhouSpellCard(restored),text);assert.throws(()=>parseTouhouSpellCard('{broken'),/document: invalid JSON/);
  assert.throws(()=>parseTouhouSpellCard({}),/document: expected JSON text/);
});

test('strict version, event and field validation never discards unknown data or invokes an accessor',()=>{
  for(const [doc,path]of[
    [{...document(),version:2},'document.version'],[{...document(),format:'js'},'document.format'],
    [{...document(),extra:true},'document.extra'],[document([{id:'code',type:'script',frame:0,script:'alert(1)'}]),'document.events[0].script'],
    [document([{id:'unknown',type:'unknown',frame:0}]),'document.events[0].type'],
    [document([{id:'clear',type:'clear',frame:0,sound:2}]),'document.events[0].sound'],
    [{...document(),boss:{x:0,y:0,z:1}},'document.boss.z'],
  ])assert.throws(()=>validateTouhouSpellCard(doc),error=>error.message.startsWith(`${path}:`));
  let called=false;const event={id:'clear',type:'clear',frame:0};
  Object.defineProperty(event,'enabled',{get(){called=true;return true;},enumerable:true});
  assert.throws(()=>validateTouhouSpellCard(document([event])),/document.events\[0\].enabled: accessors/);assert.equal(called,false);
});

test('validation rejects invalid numbers, duplicate IDs, incomplete events and frames beyond the card',()=>{
  const cases=[
    [document([],{duration:36001}),'document.duration'],[document([],{seed:-1}),'document.seed'],
    [document([],{hp:0}),'document.hp'],[document([bullet({speed:Infinity})]),'document.events[0].speed'],
    [document([bullet({bulletType:50})]),'document.events[0].bulletType'],[document([bullet({color:16})]),'document.events[0].color'],
    [document([bullet({pattern:13})]),'document.events[0].pattern'],[document([bullet({count:1.5})]),'document.events[0].count'],
    [document([bullet({interval:0})]),'document.events[0].interval'],[document([bullet({frame:11,duration:2})]),'document.events[0].duration'],
    [document([charge({frame:10,releaseFrame:2})]),'document.events[0].releaseFrame'],[document([charge({color:'black'})]),'document.events[0].color'],
    [document([{id:'sound',type:'sound',frame:0,sound:90}]),'document.events[0].sound'],
    [document([bullet({enabled:'false'})]),'document.events[0].enabled'],
    [document([bullet(),bullet()]),'document.events[1].id'],
    [document([{id:'bullet',type:'bullet',frame:0}]),'document.events[0].x'],
  ];
  for(const [doc,path]of cases)assert.throws(()=>validateTouhouSpellCard(doc),error=>error.message.startsWith(`${path}:`),path);
  assert.throws(()=>validateTouhouSpellCard(document(Array.from({length:257},(_,i)=>({id:`clear-${i}`,type:'clear',frame:0})))),/document.events:/);
  assert.doesNotThrow(()=>validateTouhouSpellCard(document([bullet({frame:11}),charge({frame:10,releaseFrame:1})])));
});

test('emission and movement limits account for active same-frame work while ignoring disabled actions',()=>{
  assert.throws(()=>validateTouhouSpellCard(document([bullet({count:2048,rows:2})])),/count \* rows exceeds 2048/);
  const events=Array.from({length:4},(_,index)=>bullet({id:`bullet-${index}`,count:2048}));
  assert.doesNotThrow(()=>validateTouhouSpellCard(document(events)));
  assert.throws(()=>validateTouhouSpellCard(document([...events,laser()])),/exceeds 8192 projectiles at frame 0/);
  assert.doesNotThrow(()=>validateTouhouSpellCard(document([...events,laser({frame:1}),bullet({enabled:false})])));
  assert.throws(()=>validateTouhouSpellCard(document([move(),move({id:'second',frame:3})])),/document.events\[1\].frame: enabled move events overlap/);
  assert.doesNotThrow(()=>validateTouhouSpellCard(document([move(),move({id:'second',frame:4}),move({id:'disabled',enabled:false})])));
});

test('looped emissions use document order, the actual current Boss origin, and one rotation step per emission',()=>{
  const calls=[],boss={x:0,y:20};let timeline;
  timeline=new TouhouSpellCardTimeline(document([
    move({duration:4,x:40,y:20}),bullet({id:'loop',duration:6,interval:2,x:3,y:4,angle:.2,rotation:.3}),
    {id:'clear',type:'clear',frame:2},{id:'sound',type:'sound',frame:2,sound:7},
    bullet({id:'world',frame:2,x:-8,y:70,origin:'world',enabled:false}),
  ],{duration:6}),{boss,bullets:{emit:p=>calls.push(['bullet',timeline.frame,p.x,p.y,p.angle])},
    clear:()=>calls.push(['clear',timeline.frame]),sound:(id,x)=>calls.push(['sound',timeline.frame,id,x]),
    onComplete:done=>calls.push(['done',done.frame])});
  assert.equal(timeline.frame,0);assert.equal(boss.x,0);tick(timeline,6);
  assert.deepEqual(calls,[['bullet',0,13,24,.2],['bullet',2,33,24,.5],['clear',2],['sound',2,7,30],['bullet',4,43,24,.8],['done',6]]);
  assert.deepEqual(timeline.snapshot(),{frame:6,alive:false,completed:true,documentId:'new-spellcard'});
  timeline.update();assert.equal(calls.length,6);assert.equal(timeline.frame,6);
});

test('move events sample their start on activation, smoothstep their interval, and preserve initial external positions',()=>{
  const boss={x:-100,y:80};const timeline=new TouhouSpellCardTimeline(document([move({frame:2,x:100,y:0,easing:'smooth'})]),{boss});
  assert.deepEqual(boss,{x:-100,y:80});tick(timeline,2);boss.x=20;boss.y=40;
  timeline.update();assert.deepEqual(boss,{x:32.5,y:33.75});
  tick(timeline,3);assert.deepEqual(boss,{x:100,y:0});
  const saved=timeline.document;assert.equal(Object.isFrozen(saved),true);assert.equal(Object.isFrozen(saved.events[0]),true);
});

test('aimed shots sample the player relative to the actual emission position each time',()=>{
  const shots=[],boss={x:10,y:20},player={x:20,y:30};
  const timeline=new TouhouSpellCardTimeline(document([bullet({duration:2,x:10,y:5,pattern:0,rotation:0}),
    bullet({id:'world',x:0,y:30,origin:'world',pattern:0})]),{boss,player,bullets:{emit:p=>shots.push(p)}});
  timeline.update();assert.equal(shots[0].playerAngle,Math.fround(Math.PI/2));assert.equal(shots[1].playerAngle,0);
  player.x=30;player.y=25;timeline.update();assert.equal(shots[2].playerAngle,0);
});

test('straight and infinite lasers use their public factories and type zero without changing lifetimes',()=>{
  const calls=[],timeline=new TouhouSpellCardTimeline(document([
    laser({duration:3,interval:2,x:2,y:5}),laser({id:'infinite',kind:'infinite',frame:1,x:-50,y:40,origin:'world'}),
  ]),{boss:{x:10,y:20},lasers:{spawnStraight:p=>calls.push(['straight',p]),spawnInfinite:p=>calls.push(['infinite',p])}});
  tick(timeline,3);assert.deepEqual(calls.map(([kind,p])=>[kind,p.x,p.y,p.type,p.angle]),[
    ['straight',12,25,0,.5],['infinite',-50,40,0,.5],['straight',12,25,0,.75]]);
  assert.deepEqual(calls[1][1],{x:-50,y:40,type:0,color:4,angle:.5,speed:3,width:12,length:120,delay:20,grow:15,sustain:120,shrink:15});
});

test('charge follows later Boss births, shares the exact logical clock and releases on the authored frame',()=>{
  const bank=bulletTestBank(),sounds=[],boss={x:1,y:30},charges=[];
  const timeline=new TouhouSpellCardTimeline(document([charge({x:2,y:3})],{duration:4}),{boss,
    presentation:{beginCharge:options=>{const value=new TouhouBossCharge(bank,options);charges.push(value);return value;}},
    sound:(id,x)=>sounds.push([id,x,timeline.frame])});
  for(let i=0;i<4;i++){timeline.update();if(i===2)boss.x=11;for(const value of charges)value.update();}
  assert.deepEqual(sounds,[[54,3,0],[6,13,3]]);assert.equal(charges[0].released,true);assert.equal(charges[0].age,3);
  assert.deepEqual(bank.instances.map(vm=>[vm.scriptId,vm.x,vm.y]),[[64,3,33],[91,13,33]]);
  assert.equal(timeline.completed,true,'last-frame release is allowed to finish after timeline completion');
});

test('stop cancels only owned charge work, prevents delayed sounds and does not settle or clear',()=>{
  const bank=bulletTestBank(),charges=[],sounds=[];let cleared=0,completed=0;
  const timeline=new TouhouSpellCardTimeline(document([charge(),{id:'clear',type:'clear',frame:5}]),{boss:{x:0,y:0},
    presentation:{beginCharge:options=>{const value=new TouhouBossCharge(bank,options);charges.push(value);return value;}},
    sound:id=>sounds.push(id),clear:()=>cleared++,onComplete:()=>completed++});
  timeline.update();charges[0].update();timeline.stop();timeline.stop();
  for(let i=0;i<10;i++){timeline.update();charges[0].update();}
  assert.deepEqual(sounds,[54]);assert.equal(charges[0].stopped,true);assert.equal(charges[0].released,false);
  assert.equal(bank.instances.length,1);assert.equal(bank.instances[0].alive,true,'existing particles retire through presentation');
  assert.equal(cleared,0);assert.equal(completed,0);assert.equal(timeline.completed,false);assert.equal(timeline.frame,1);
});

test('charge sound defaults normalize, null cues stay silent, and disabled releases never play',()=>{
  const initial=charge();delete initial.sound;delete initial.releaseSound;
  assert.deepEqual([validateTouhouSpellCard(document([initial])).events[0].sound,validateTouhouSpellCard(document([initial])).events[0].releaseSound],[54,6]);
  const sounds=[],presentation={beginCharge:()=>({stop(){}})};
  const silent=new TouhouSpellCardTimeline(document([charge({sound:null,releaseSound:null})]),{boss:{x:0,y:0},presentation});tick(silent,12);
  const noRelease=new TouhouSpellCardTimeline(document([charge({release:false})]),{boss:{x:0,y:0},presentation,sound:id=>sounds.push(id)});tick(noRelease,12);
  assert.deepEqual(sounds,[54]);
});

test('missing adapters fail clearly at the event and cancellation from onEvent prevents that action',()=>{
  for(const event of[bullet(),laser(),charge(),{id:'sound',type:'sound',frame:0,sound:1},{id:'clear',type:'clear',frame:0}]){
    const timeline=new TouhouSpellCardTimeline(document([event]),{boss:{x:0,y:0}});
    assert.throws(()=>timeline.update(),/document.events\[0\]: context requires/);assert.equal(timeline.alive,false);
  }
  let emitted=0,timeline;
  timeline=new TouhouSpellCardTimeline(document([bullet()]),{boss:{x:0,y:0},bullets:{emit:()=>emitted++},onEvent:()=>timeline.stop()});
  timeline.update();assert.equal(emitted,0);assert.equal(timeline.completed,false);
});

test('random patterns 6/7/8 match the original batch emitter exactly without changing its default RNG',()=>{
  const capture=field=>field.bullets.map(value=>Object.fromEntries(['id','slot','x','y','z','vx','vy','vz','angle','speed','initialSpeed','type','color','radius'].map(key=>[key,value[key]])));
  const make=()=>new TouhouBulletField({bank:bulletTestBank(),styles:bulletTestStyles(),random:new TouhouRandom(777)});
  for(const pattern of [6,7,8]){
    const source=make(),actual=make(),rng=new TouhouRandom(0xfedcba98),originalDefault=actual.random.snapshot();
    const event=bullet({duration:3,count:5,rows:3,pattern,speed:2,speedStep:4,angle:.3,angleStep:.6,rotation:.2});
    const doc=document([event],{duration:3,seed:0xfedcba98});
    const timeline=new TouhouSpellCardTimeline(parseTouhouSpellCard(serializeTouhouSpellCard(doc)),{boss:{x:0,y:96},bullets:actual});
    for(let i=0;i<3;i++){
      source.emit({x:0,y:96,type:event.bulletType,color:event.color,pattern,count:5,rows:3,speed:2,speedStep:4,angle:.3+.2*i,angleStep:.6},{random:rng});
      timeline.update();assert.deepEqual(capture(actual),capture(source),`pattern ${pattern}, frame ${i}`);
    }
    assert.deepEqual(actual.random.snapshot(),originalDefault,'timeline random must not consume another owner\'s stream');
    const repeated=make(),second=new TouhouSpellCardTimeline(doc,{boss:{x:0,y:96},bullets:repeated});tick(second,3);
    assert.deepEqual(capture(repeated),capture(actual),'same saved seed reproduces every generated bullet');
  }
});
