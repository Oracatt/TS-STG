import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createSpellMetadata} from './spellcard-editor/metadata.js';

// Windows integration test: real native file opens race Node's atomic rename.
// The preview factory is deliberately lightweight; no graphics, game resources,
// fault injection or changes to the user's editor process are involved.
const root=path.resolve(import.meta.dirname,'..');
const folder=`build/spellcard-transport/${process.pid}`,reportFolder=path.join(root,'reports/spellcard-editor-transport');
const durationMs=10000,stepCount=64;
await mkdir(path.join(root,folder),{recursive:true});await mkdir(reportFolder,{recursive:true});

function entrySource(paths){
  return `import {createControlledPreview} from '../../../tools/spellcard-editor/controller.js';
const paths=${JSON.stringify(paths)},stepCount=${stepCount};
function check(value,message){if(!value)throw Error(message);}
const stats={ticks:0,reads:0,readFailures:0,cannotReadFailures:0,controlParseFailures:0,writes:0,writeFailures:0,
  factories:0,resets:0,steps:0,playUpdates:0,heldFailures:0,errors:[]};
let failedRead=false,finished=false,quiet=0,preview;
const host={...tsstg,
  readText(file){
    let text;
    try{text=tsstg.readText(file);stats.reads++;}
    catch(error){failedRead=true;stats.readFailures++;if(String(error).includes('Cannot read:'))stats.cannotReadFailures++;
      if(stats.errors.length<5)stats.errors.push(String(error));throw error;}
    try{finished=JSON.parse(text).finished===true;}catch{stats.controlParseFailures++;}
    return text;
  },
  writeText(file,text){try{tsstg.writeText(file,text);stats.writes++;}catch(error){stats.writeFailures++;
    if(stats.errors.length<5)stats.errors.push(String(error));throw error;}},
};
const controller=createControlledPreview(host,paths,{loadModule:file=>import(file),factory(_host,document,options){
  stats.factories++;
  preview={runner:options.createSpell({}),invincible:options.invincible,exited:false,settling:false,
    game:{paused:false,bullets:{bullets:[]},lasers:{lasers:[]},player:{x:0,y:400}},
    reset(){stats.resets++;throw Error('Transport failure unexpectedly reset the spell');},
    setSilent(){},render:()=>[],snapshot(){return{frame:this.runner.frame,alive:this.runner.alive};},
    update(mask){if(mask===0)stats.steps++;else if(mask===64)stats.playUpdates++;else throw Error('Unexpected input');this.runner.update();},
    destroy(){this.runner.stop();},
  };return preview;
}});
const started=Date.now();
globalThis.__tsstg_game={update(){
  failedRead=false;const before=controller.snapshot().editor;
  controller.update();const after=controller.snapshot().editor;stats.ticks++;
  check(!after.error,'Transport became a source error: '+after.error);
  check(stats.steps<=stepCount,'A step command ran more than once');
  check(stats.factories<=1&&stats.resets===0,'Transport replaced the last working runner');
  if(failedRead){
    check(after.frame===before.frame,'An unread control message must hold simulation');
    check(after.playing===before.playing,'A read failure lost the play intent');
    if(before.playing)stats.heldFailures++;
  }
  if(finished&&!failedRead)quiet++;else quiet=0;
  if(quiet>=24||Date.now()-started>14000)tsstg.quit();
},render:()=>[],snapshot:()=>({...stats,quiet,elapsedMs:Date.now()-started,editor:controller.snapshot().editor}),
destroy:()=>controller.destroy()};
`;
}

async function runBackend(backend){
  const control=`${folder}/${backend}-control.json`,status=`spellcard-transport/${process.pid}/${backend}-status.json`;
  const entry=`${folder}/${backend}.js`,moduleName=`${backend}-spell.js`,snapshot=`${folder}/${backend}-result.json`;
  const document={...createSpellMetadata(),id:`transport-${backend}`,duration:36000};
  const state={revision:0,documentRevision:1,document,modulePath:`./${moduleName}`,invincible:false,input:64,commands:[],finished:false};
  const stats={backend,publishes:0,renameRetries:0,nodeStatusReads:0,nodeStatusReadFailures:0,nodeStatusParseFailures:0};
  const controlFile=path.join(root,control),statusFile=path.join(root,'userdata',status);
  await mkdir(path.dirname(statusFile),{recursive:true});await writeFile(controlFile,JSON.stringify(state));
  await writeFile(path.join(root,folder,moduleName),`export const spellCard=${JSON.stringify(document)};
export function createSpell(){return{frame:0,alive:true,update(){this.frame++;},stop(){this.alive=false;}};}
`);
  await writeFile(path.join(root,entry),entrySource({control,status}));
  const child=spawn(path.join(root,'build/Release/ts-stg.exe'),[entry,'--root',root,'--backend',backend,
    '--headless','--frames','1000000','--snapshot',path.join(root,snapshot)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let done=false,log='';child.stdout.on('data',text=>{log+=text;});child.stderr.on('data',text=>{log+=text;});
  const exited=new Promise((resolve,reject)=>{child.once('error',error=>{done=true;reject(error);});child.once('exit',code=>{done=true;resolve(code);});});
  const timeout=setTimeout(()=>child.kill(),18000);
  // Same publication policy as desktop.mjs: no deletion gap and no swallowed
  // write/rename errors. Retry only the known short-lived Windows lock errors.
  async function publish(){
    const temporary=`${controlFile}.tmp`;await writeFile(temporary,JSON.stringify(state));
    for(let attempt=0;;attempt++)try{await rename(temporary,controlFile);stats.publishes++;return;}catch(error){
      if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=12)throw error;
      stats.renameRetries++;await new Promise(resolve=>setTimeout(resolve,10+attempt*5));
    }
  }
  const publisher=(async()=>{
    const started=Date.now();
    while(!done&&Date.now()-started<durationMs){
      // Repeated snapshots retain all unacknowledged commands. Fast publishers
      // may skip revisions, but must neither lose nor replay a command.
      if(state.commands.length<stepCount)state.commands.push({id:state.commands.length+1,action:'step'});
      else if(state.commands.length===stepCount)state.commands.push({id:stepCount+1,action:'play'});
      state.revision++;await publish();
    }
    if(!done){state.revision++;state.finished=true;await publish();}
  })();
  // Observe the real native truncating status writer just as Electron does.
  // Partial telemetry is counted, not treated as a valid acknowledgement.
  const observer=(async()=>{while(!done){
    let text;try{text=await readFile(statusFile,'utf8');stats.nodeStatusReads++;}catch(error){
      if(!['ENOENT','EPERM','EACCES','EBUSY'].includes(error.code))throw error;stats.nodeStatusReadFailures++;
    }
    if(text!==undefined)try{JSON.parse(text);}catch{stats.nodeStatusParseFailures++;}
    await new Promise(resolve=>setImmediate(resolve));
  }})();
  // Any unexpected publisher/observer failure terminates only this test's
  // child; Promise.all still reports the original failure to the test runner.
  publisher.catch(()=>child.kill());observer.catch(()=>child.kill());
  let code;
  try{[code]=await Promise.all([exited,publisher,observer]);}finally{clearTimeout(timeout);if(!done)child.kill();}
  assert.equal(code,0,log);
  const native=JSON.parse(await readFile(path.join(root,snapshot),'utf8'));
  const result={...stats,native,naturalReadFailureObserved:native.readFailures>0};
  await writeFile(path.join(reportFolder,`${backend}.json`),JSON.stringify(result,null,2));
  assert.equal(state.finished,true,'Publisher must finish the contention phase');
  assert.equal(native.controlParseFailures,0,'Atomic control messages must remain complete JSON');
  assert.equal(native.factories,1);assert.equal(native.resets,0);
  assert.equal(native.steps,stepCount,'Every step must execute exactly once');
  assert.ok(native.playUpdates>0,'Play must survive control polling');
  assert.equal(native.editor.frame,native.steps+native.playUpdates);
  assert.equal(native.editor.commandId,stepCount+1);assert.equal(native.editor.documentRevision,1);
  assert.equal(native.editor.error,null);assert.equal(native.editor.playing,true);
  assert.equal(native.editor.waitingForControl,false);assert.equal(native.editor.transportWarning,null);
  assert.ok(native.quiet>=24,'Controller must recover after publication stops');
  console.log(`PASS ${backend}: ${native.readFailures} natural read failures (${native.cannotReadFailures} Cannot read), ${native.heldFailures} held during play; ${native.steps} steps exactly once, ${native.playUpdates} play frames, no reset/source error`);
  if(!result.naturalReadFailureObserved)console.log(`NOTE ${backend}: Windows did not expose a read failure in this run; no failure was injected.`);
  return result;
}

const results=[];for(const backend of ['quickjs','v8'])results.push(await runBackend(backend));
await writeFile(path.join(reportFolder,'verification.json'),JSON.stringify({passed:true,durationMs,stepCount,results,
  note:'Real Windows native reads and Node atomic replacement; contention frequency depends on scheduling. No injected failures or GPU.'},null,2));
