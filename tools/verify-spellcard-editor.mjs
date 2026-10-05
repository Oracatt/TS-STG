import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createTouhouSpellCard} from '../packages/thlib/src/touhou/spellcard.js';
import {generateSpellSource} from './spellcard-editor/source.js';

const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'build/spellcard-check');
mkdirSync(folder,{recursive:true});
writeFileSync(resolve(folder,'parity.js'),`import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';
import {createTouhouSpellCard} from '@ts-stg/thlib/touhou';
const doc=createTouhouSpellCard();doc.events[1].pattern=8;doc.events[1].speedStep=2;doc.events[1].angleStep=1;
doc.events.push({id:'laser',type:'laser',frame:30,duration:1,interval:1,x:0,y:0,origin:'boss',kind:'infinite',color:4,
angle:Math.PI/2,rotation:0,speed:0,width:10,length:220,delay:30,grow:30,sustain:240,shrink:30});
globalThis.__tsstg_game=createSpellCardPreview(tsstg,doc,{silent:true});\n`);
const snapshots=[];
for(const backend of ['quickjs','v8']){
  const output=resolve(folder,`${backend}-parity.json`);
  const result=spawnSync(resolve(root,'build/Release/ts-stg.exe'),['build/spellcard-check/parity.js','--root',root,
    '--backend',backend,'--headless','--frames','360','--snapshot',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.status,0,result.stderr||result.error?.message);snapshots.push(JSON.parse(readFileSync(output,'utf8')));
}
assert.deepEqual(snapshots[0],snapshots[1],'QuickJS/V8 authored rehearsal snapshots');
assert.equal(snapshots[0].timeline.frame,360);assert.ok(snapshots[0].game.bullets.count>0);
console.log('PASS: authored card + actual TouhouGame, 360 frames, exact QuickJS/V8 snapshot parity');

// New files are executable JS, with no event arrangement or browser geometry
// adapter. Run that exact default template through the real preview controller.
writeFileSync(resolve(folder,'source-default.js'),generateSpellSource());
writeFileSync(resolve(folder,'source-default-check.js'),`import {createControlledPreview} from '../../tools/spellcard-editor/controller.js';
function check(condition,message){if(!condition)throw Error(message);}
const paths={control:'build/spellcard-check/virtual-default-source.json',status:'spellcard-check/default-source-status.json'};
const fallback=${JSON.stringify({...createTouhouSpellCard(),id:'unused-fallback',duration:20,events:[]})};
let state={revision:1,documentRevision:1,document:fallback,modulePath:'./source-default.js',
  commands:[{id:1,action:'seek',frame:90}],input:0};
const host={...tsstg,readText:file=>file===paths.control?JSON.stringify(state):tsstg.readText(file)};
const controller=createControlledPreview(host,paths,{loadModule:path=>import(path)});
let seekCheck=0,firstSnapshot='';
globalThis.__tsstg_game={
  update(){controller.update();const result=controller.snapshot(),status=result.editor;if(status.error)throw Error(status.error);
    if(status.documentRevision!==1||status.loading||status.seeking)return;
    if(seekCheck===0&&status.frame===90){firstSnapshot=JSON.stringify(result.preview);seekCheck=1;
      state={...state,revision:state.revision+1,commands:[{id:2,action:'seek',frame:0}]};
    }else if(seekCheck===1&&status.frame===0&&status.commandId===2){seekCheck=2;
      state={...state,revision:state.revision+1,commands:[{id:3,action:'seek',frame:90}]};
    }else if(seekCheck===2&&status.frame===90&&status.commandId===3){
      check(JSON.stringify(result.preview)===firstSnapshot,'Backward/forward source-only seek changed the seeded native scene');seekCheck=3;
    }
  },
  render:()=>[],snapshot(){const result=controller.snapshot();
    check(result.editor.documentRevision===1&&!result.editor.loading,'Default JS source never became active');
    check(result.editor.document.id!==fallback.id&&result.editor.document.duration>fallback.duration,'Preview used fallback metadata instead of executed module exports');
    check(result.editor.document.events.length===0,'The new-file template still depends on arranged events');
    check(result.editor.frame===90&&result.editor.bullets>0,'The direct JS template did not emit native bullets during seek');
    check(seekCheck===3,'Repeated source-only seek did not complete');
    return result.preview;
  },
};
`);
const defaultSourceSnapshots=[];
for(const backend of ['quickjs','v8']){
  const output=resolve(folder,`${backend}-default-source.json`);
  const result=spawnSync(resolve(root,'build/Release/ts-stg.exe'),['build/spellcard-check/source-default-check.js','--root',root,
    '--backend',backend,'--headless','--frames','60','--snapshot',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.status,0,result.stderr||result.error?.message);defaultSourceSnapshots.push(JSON.parse(readFileSync(output,'utf8')));
}
assert.deepEqual(defaultSourceSnapshots[0],defaultSourceSnapshots[1],'QuickJS/V8 direct JS template snapshots');
console.log('PASS: source-only new-file JS, native-evaluated metadata, seeded seek and real bullets on QuickJS/V8');

// Exercise the desktop adapter against the actual native host and shared ANM
// assets. Spies observe the audio boundary while still decoding/playing through
// the host; only the editor control file is supplied from memory.
writeFileSync(resolve(folder,'lifecycle.js'),`import {createSpellCardPreview} from '../../tools/spellcard-editor/native-preview.js';
import {createControlledPreview} from '../../tools/spellcard-editor/controller.js';
import {createTouhouSpellCard,quantizeTouhouSpellTime,invalidTouhouSpellTime} from '@ts-stg/thlib/touhou';
function check(condition,message){if(!condition)throw Error(message);}
const manifest=JSON.parse(tsstg.readText('packages/thlib/assets/touhou-common/audio/manifest.json'));
const openingFile='packages/thlib/assets/touhou-common/'+manifest.files[manifest.definitions.find(item=>item.id===33).fileIndex].path;
const soundFiles=new Map(),played=[];
const host={...tsstg,
  loadSound(file){const handle=tsstg.loadSound(file);soundFiles.set(handle,file);return handle;},
  playSound(handle,...options){played.push(soundFiles.get(handle));return tsstg.playSound(handle,...options);},
};
const openings=()=>played.filter(file=>file===openingFile).length;
const document=createTouhouSpellCard();document.id='native-editor-lifecycle';document.duration=120;
document.events=[{...document.events[1],frame:0,duration:120,interval:15,count:12,speed:1}];
const rehearsal=createSpellCardPreview(host,document,{silent:true});
check(openings()===0,'Creating a paused rehearsal must not play the opening sound');
rehearsal.setSilent(false);rehearsal.update();
check(openings()===1,'First audible update must play the shared opening sound exactly once');
for(let i=0;i<8;i++)rehearsal.update();
check(openings()===1,'The opening sound must not repeat on subsequent updates');
rehearsal.setSilent(true);rehearsal.reset();
for(let i=0;i<8;i++)rehearsal.update();
check(openings()===1,'Silent seeking must not play the opening sound');
rehearsal.setSilent(false);rehearsal.update();
check(openings()===1,'Resuming after a silent seek must not replay a deferred opening');
rehearsal.destroy();

const paths={control:'build/spellcard-check/virtual-control.json',status:'spellcard-check/lifecycle-status.json'};
let state={revision:0,documentRevision:1,document,commands:[],input:0},preview;
const controlledHost={...host,readText:file=>file===paths.control?JSON.stringify(state):tsstg.readText(file)};
const controller=createControlledPreview(controlledHost,paths,{factory:(...args)=>(preview=createSpellCardPreview(...args))});
check(openings()===1,'Creating the paused controller must remain silent');
state={...state,revision:1,commands:[{id:1,action:'play'}]};controller.update();
check(openings()===2,'Controller Play must produce one opening sound');
let sawBullets=false;
while(preview.timeline.alive){
  // Holding Confirm across completion must not continuously restart the card.
  if(preview.timeline.frame===110)state={...state,revision:state.revision+1,input:256};
  controller.update();sawBullets||=preview.game.bullets.bullets.length>0;
  check(!controller.snapshot().editor.error,'Native controller update failed');
}
const terminalFrame=preview.game.frame,expectedTime=quantizeTouhouSpellTime(document.duration/60).encoded;
check(sawBullets,'Lifecycle fixture must contain actual native thlib bullets');
check(preview.timeline.frame===120&&terminalFrame===120,'The card must end at its authored fixed frame');
check(preview.game.spell.result?.timeout===true,'The shared spell owner must settle the timeout');
check(!invalidTouhouSpellTime(preview.game.spell.encodedTime)&&preview.game.spell.encodedTime===expectedTime,
  'Shared result time must encode the two-second simulation duration');
check(preview.game.hud.activeNotice,'The shared result notice must be alive when the timeline ends');
check(controller.snapshot().editor.settling,'The controller must advance presentation after timeline completion');
let tailFrames=0;
while(controller.snapshot().editor.settling&&tailFrames<600){controller.update();tailFrames++;}
check(tailFrames>0&&tailFrames<600,'Native result presentation must complete within 600 frames');
check(!preview.game.hud.activeNotice&&!preview.settling,'Shared result/cancel animations must finish rather than freeze');
check(preview.game.bullets.bullets.length===0&&!preview.game.lasers.lasers.some(laser=>laser.alive),
  'No enemy projectiles may remain after terminal presentation');
check(preview.game.frame>terminalFrame&&preview.timeline.frame===120,'Only the presentation clock advances during settlement');
check(preview.game.spell.encodedTime===expectedTime,'The presentation tail must not inflate the recorded spell time');
controller.update();check(preview.timeline.frame===120,'A held Confirm must not restart a completed rehearsal');
state={...state,revision:state.revision+1,input:0};controller.update();
state={...state,revision:state.revision+1,input:256};controller.update();
check(preview.timeline.alive&&preview.timeline.frame===1&&controller.snapshot().editor.playing,
  'A fresh Enter press must restart a completed, paused rehearsal');
check(openings()===3,'Restarting with Enter must play one fresh shared opening sound');
const result={passed:true,terminalFrame,tailFrames,encodedTime:expectedTime,openingPlays:openings(),retryFrame:preview.timeline.frame};
controller.destroy();
globalThis.__tsstg_game={update(){},render:()=>[],snapshot:()=>result};
`);
const lifecycle=[];
for(const backend of ['quickjs','v8']){
  const output=resolve(folder,`${backend}-lifecycle.json`);
  const result=spawnSync(resolve(root,'build/Release/ts-stg.exe'),['build/spellcard-check/lifecycle.js','--root',root,
    '--backend',backend,'--headless','--frames','1','--snapshot',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.status,0,result.stderr||result.error?.message);lifecycle.push(JSON.parse(readFileSync(output,'utf8')));
}
assert.deepEqual(lifecycle[0],lifecycle[1],'QuickJS/V8 native preview lifecycle parity');
assert.equal(lifecycle[0].passed,true);
console.log(`PASS: native opening/seek audio, result/cancel tail (${lifecycle[0].tailFrames} frames), elapsed time and Enter retry on QuickJS/V8`);

// Load actual edited ES modules through both embedded runtimes. In particular,
// handwritten bullets below have no equivalent visual event in the metadata.
const generatedDocument={...createTouhouSpellCard(),id:'generated-esm',duration:180,hp:99999};
generatedDocument.events=[{...generatedDocument.events[1],frame:0,duration:180,interval:10,count:8}];
writeFileSync(resolve(folder,'source-generated.js'),generateSpellSource(generatedDocument));
const manualDocument={...generatedDocument,id:'handwritten-esm',duration:70,events:[]};
function manualSource(document,{fail=false,snapshot=true}={}){
  return `export const spellCard=${JSON.stringify(document)};
export function createSpell(context){
  if(!context.game||!context.player||typeof context.random.unit!=='function')throw Error('Missing native script context');
  return {frame:0,alive:true,emissions:0,
    update(){
      ${fail?"if(this.frame===3)throw Error('Authored update failed');":''}
      if(this.frame%5===0){
        context.bullets.emit({x:context.boss.x,y:context.boss.y,type:0,color:6,pattern:3,count:7,rows:1,speed:1,
          angle:context.random.unit()*Math.PI*2},{random:context.random});
        context.boss.x+=2;this.emissions++;
      }
      this.frame++;if(this.frame>=spellCard.duration)this.alive=false;
    },stop(){this.alive=false;},
    ${snapshot?'snapshot(){return{frame:this.frame,alive:this.alive,emissions:this.emissions};}':''}
  };
}\n`;
}
writeFileSync(resolve(folder,'source-handwritten.js'),manualSource(manualDocument));
writeFileSync(resolve(folder,'source-syntax.js'),'export const spellCard = ;\n');
writeFileSync(resolve(folder,'source-factory.js'),`export const spellCard=${JSON.stringify(manualDocument)};
export function createSpell(){throw Error('Authored factory failed');}\n`);
writeFileSync(resolve(folder,'source-runtime.js'),manualSource({...manualDocument,id:'runtime-failure'},{fail:true}));
writeFileSync(resolve(folder,'source-fixed.js'),manualSource({...manualDocument,id:'fixed-esm',duration:20},{snapshot:false}));
writeFileSync(resolve(folder,'source-invalid-runner.js'),`export const spellCard=${JSON.stringify(manualDocument)};
export function createSpell(){return{frame:NaN,alive:true,update(){},stop(){}};}\n`);
writeFileSync(resolve(folder,'source-async-runner.js'),`export const spellCard=${JSON.stringify(manualDocument)};
export function createSpell(){return{frame:0,alive:true,async update(){this.frame++;},stop(){this.alive=false;}};}\n`);
writeFileSync(resolve(folder,'source-stuck-runner.js'),`export const spellCard=${JSON.stringify(manualDocument)};
export function createSpell(){return{frame:0,alive:true,update(){},stop(){this.alive=false;}};}\n`);
writeFileSync(resolve(folder,'source-stop-runner.js'),`export const spellCard=${JSON.stringify(manualDocument)};
export function createSpell(){return{frame:0,alive:true,update(){this.stop();},stop(){this.alive=false;}};}\n`);
writeFileSync(resolve(folder,'source-live-check.js'),`import {createControlledPreview} from '../../tools/spellcard-editor/controller.js';
function check(condition,message){if(!condition)throw Error(message);}
const paths={control:'build/spellcard-check/virtual-source.json',status:'spellcard-check/source-status.json'};
let state={revision:1,documentRevision:1,document:${JSON.stringify(generatedDocument)},modulePath:'./source-generated.js',
  commands:[{id:1,action:'seek',frame:37},{id:2,action:'play'}],input:0};
const host={...tsstg,readText:file=>file===paths.control?JSON.stringify(state):tsstg.readText(file)};
const controller=createControlledPreview(host,paths,{loadModule:path=>import(path)});
let phase=0,id=2,goodFrame=0,ticks=0,done=false;const results={passed:false,checks:[]};
function load(path,commands=[]){state={...state,revision:state.revision+1,documentRevision:state.documentRevision+1,modulePath:path,
  commands:commands.map(command=>({...command,id:++id}))};}
function checked(name){results.checks.push(name);phase++;}
globalThis.__tsstg_game={
  update(){
    if(done)return;if(++ticks>400)throw Error('Native JS authoring fixture did not finish');
    controller.update();const status=controller.snapshot().editor;
    if(phase===0&&status.documentRevision===1&&status.frame>=40){
      check(!status.error&&status.bullets>0&&status.document.id==='generated-esm','Generated ES module must emit actual native bullets');
      goodFrame=status.frame;checked('generated-module');load('./source-syntax.js',[{action:'play'}]);
    }else if(phase===1&&status.error){
      check(status.documentRevision===1&&status.requestedDocumentRevision===2&&status.frame===goodFrame,'Syntax failure changed the last good scene');
      check(/source-syntax\\.js:1(?::|\\b)/.test(status.error),'Syntax error must identify the edited source file and line');
      checked('syntax-retains-scene');load('./source-factory.js',[{action:'play'}]);
    }else if(phase===2&&status.error&&status.requestedDocumentRevision===3){
      check(/Authored factory failed/.test(status.error)&&/source-factory.js/.test(status.error),'Factory error stack is missing');
      check(status.documentRevision===1&&status.frame===goodFrame,'Failed factory destroyed the last good scene');
      checked('factory-transaction');load('./source-handwritten.js',[{action:'seek',frame:12},{action:'play'}]);
    }else if(phase===3&&status.documentRevision===4&&status.frame>=25){
      check(!status.error&&status.document.events.length===0&&status.bullets>0,'Handwritten JS was not executed');
      check(controller.snapshot().preview.timeline.emissions===5,'Handwritten custom runner snapshot must be retained');
      results.handwritten=controller.snapshot().preview;
      checked('handwritten-bullets');load('./source-runtime.js',[{action:'play'}]);
    }else if(phase===4&&status.error&&status.documentRevision===5){
      check(status.frame===3&&!status.playing&&/Authored update failed/.test(status.error)&&/source-runtime.js/.test(status.error),'Runtime error did not pause at the authored source');
      checked('runtime-error');load('./source-fixed.js',[{action:'seek',frame:5},{action:'play'}]);
    }else if(phase===5&&status.documentRevision===6&&status.completed){
      check(!status.error&&status.frame===20,'Editing a runtime error must recover through a fresh module');
      const snapshot=controller.snapshot().preview.timeline;check(snapshot.frame===20&&snapshot.alive===false,'Optional snapshot fallback is invalid');
      checked('edit-recovers-and-completes');load('./source-invalid-runner.js',[{action:'play'}]);
    }else if(phase===6&&status.error&&status.requestedDocumentRevision===7){
      check(status.documentRevision===6&&status.frame===20&&/runner requires/.test(status.error),'Invalid runner was activated');
      checked('invalid-runner-retains-scene');load('./source-async-runner.js',[{action:'play'}]);
    }else if(phase===7&&status.error&&status.documentRevision===8){
      check(/update must be synchronous/.test(status.error)&&!status.playing,'Async runner was allowed to escape the frame clock');
      checked('synchronous-update-contract');load('./source-stuck-runner.js',[{action:'seek',frame:10}]);
    }else if(phase===8&&status.error&&status.documentRevision===9){
      check(/advance frame by exactly one/.test(status.error)&&!status.seeking,'Stuck frame counter left seek running forever');
      checked('fixed-frame-contract');load('./source-stop-runner.js',[{action:'play'}]);
    }else if(phase===9&&status.documentRevision===10&&status.completed){
      check(!status.error&&status.frame===0,'A runner may stop without advancing its frame');
      checked('stop-without-advance');results.passed=true;done=true;controller.destroy();
    }
  },render:()=>[],snapshot:()=>results,
};
`);
const liveResults=[];
for(const backend of ['quickjs','v8']){
  const output=resolve(folder,`${backend}-source-live.json`);
  const result=spawnSync(resolve(root,'build/Release/ts-stg.exe'),['build/spellcard-check/source-live-check.js','--root',root,
    '--backend',backend,'--headless','--frames','400','--snapshot',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.status,0,result.stderr||result.error?.message);liveResults.push(JSON.parse(readFileSync(output,'utf8')));
}
assert.deepEqual(liveResults[0],liveResults[1],'QuickJS/V8 native edited-module lifecycle parity');
assert.equal(liveResults[0].passed,true);
assert.equal(liveResults[0].checks.length,10);
console.log('PASS: native generated/handwritten ES modules, transactional reload, syntax/runtime recovery, completion on QuickJS/V8');
