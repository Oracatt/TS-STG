// Private demo: old attack cancellation and the next nonspell's own preparation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import net from 'node:net';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/charge-retirement');
const entry=path.join(root,'build/charge-retirement-native.js'),binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.dirname(entry),{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['games/rushboss/src/runtime.js','games/rushboss/src/shared-presentation.js',
  'games/rushboss/src/boss-phase-timing.js','packages/thlib/src/touhou/boss-presentation.js'];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
const pipe=`\\\\.\\pipe\\ts-stg-charge-retirement-${process.pid}`,sockets=new Set();
const server=net.createServer(socket=>{sockets.add(socket);socket.on('data',()=>{});socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
function runNative(args){return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd:root,windowsHide:true});let stdout='',stderr='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('Native charge verification timed out'));},60000);
  child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',status=>{clearTimeout(timer);resolve({status,stdout,stderr});});
});}
fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../games/rushboss/src/portrait-application.js';
const host={...tsstg,playSound(){},playMusic:id=>tsstg.playMusic(id,0),setMusicVolume:id=>tsstg.setMusicVolume(id,0)};
const game=createRushPortraitGame(host,{store:new SaveStore(),startBoss:'sunny',phaseIndex:1,
  mode:'stage',skipDialogue:true,invincible:true});
// Place the directly selected Boss inside the field so the early-cancel
// captures show the particles instead of the skipped dialogue's entry edge.
game.battle.boss.x=0;game.battle.boss.y=96;
for(let i=0;i<5;i++)game.update(0);
const b=game.battle,old=b.presentation.charges[0],particles=old.display.roots.flatMap(vm=>vm.children);
const chargeEvents=[],sounds=[],bank=b.presentation.banks.effect,create=bank.create.bind(bank),request=game.resources.audio.request.bind(game.resources.audio);
bank.create=(script,...args)=>{if([68,72,79,89].includes(script))chargeEvents.push({script,phase:b.phaseIndex,frame:b.phaseFrame});return create(script,...args);};
game.resources.audio.request=(id,...args)=>{if([54,6].includes(id))sounds.push({id,phase:b.phaseIndex,frame:b.phaseFrame});return request(id,...args);};
b.endPhase('defeated');
const handoff={phase:b.phaseIndex,frame:b.phaseFrame,
  oldStopped:old.display.stopped,oldEntityAlive:old.effect.alive,
  oldParticlesAlive:particles.some(vm=>vm.alive),nextScripts:b.phaseCharges.flatMap(c=>c.roots.map(vm=>vm.scriptId))};
let frame=0;
globalThis.__tsstg_game={update(){frame++;game.update(0);},render:()=>game.render(),
 snapshot(){const next=b.phaseCharges[0];return{frame,handoff,phase:b.phaseIndex,phaseFrame:b.phaseFrame,
   old:{stopped:old.display.stopped,released:old.display.released,emitted:old.display.emitted,
     alive:old.display.alive,particlesAlive:particles.some(vm=>vm.alive)},
   next:next?{stopped:next.stopped,released:next.released}:null,
   chargeEvents:chargeEvents.filter(e=>e.phase===2),sounds:sounds.filter(e=>e.phase===2),
   currentScripts:b.presentation.shared.charges.flatMap(c=>c.roots.map(vm=>vm.scriptId))};},
 destroy(){game.destroy();}};
`);
const quick=process.argv.includes('--quick');
try{for(const frames of quick?[1,120,180]:[1,100,120,160,180]){
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${frames}`);
    const child=await runNative([path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(frames),'--benchmark','--frame-stream',pipe,'--snapshot',prefix+'.json','--screenshot',prefix+'.png']);
    fs.writeFileSync(prefix+'.log',(child.stdout??'')+(child.stderr??''));
    assert.equal(child.status,0,child.stderr);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    assert.deepEqual(state.handoff,{phase:2,frame:0,oldStopped:true,oldEntityAlive:false,oldParticlesAlive:true,nextScripts:[]});
    assert.equal(state.frame,frames);assert.equal(state.phaseFrame,frames);assert.equal(state.phase,2);
    assert.equal(state.old.stopped,true);assert.equal(state.old.released,false);assert.equal(state.old.emitted,1);
    if(frames===1)assert.equal(state.old.particlesAlive,true);
    assert.deepEqual(state.next,frames<120?null:{stopped:false,released:frames>=180});
    assert.deepEqual(state.chargeEvents,[...(frames>=120?[{script:72,phase:2,frame:120}]:[]),...(frames>=180?[{script:89,phase:2,frame:180}]:[])]);
    assert.deepEqual(state.sounds,[...(frames>=120?[{id:54,phase:2,frame:120}]:[]),...(frames>=180?[{id:6,phase:2,frame:180}]:[])]);
    variants.push({backend,state,pngSha256:sha(prefix+'.png')});
  }
  assert.deepEqual(variants[0].state,variants[1].state,'Backend state parity');
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,'Backend image parity');
  results.push({frames,variants});console.log('PASS charge retirement +'+frames);
}}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
assert.deepEqual(hashes(),sourceHashes,'Production source changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,quick,sourceHashes,binarySha256:sha(binary),results,
  scope:'Early Sunny spell defeat: old attack events stop and existing ANM tails retire; omitted blue/magenta handoff has no animation or sound, retained green/yellow attack charge stays at120/180. Hidden GPU capture with V8/QuickJS state and image parity; no original executable run.'},null,2)+'\n');
