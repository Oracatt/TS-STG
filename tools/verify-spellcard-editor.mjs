import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

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
