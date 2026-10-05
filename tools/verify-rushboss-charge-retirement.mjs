// Private demo: old attack cancellation and the next nonspell's own preparation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/charge-retirement');
const entry=path.join(root,'build/charge-retirement-native.js'),binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.dirname(entry),{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['games/rushboss/src/runtime.js','games/rushboss/src/shared-presentation.js',
  'games/rushboss/src/boss-phase-timing.js','packages/thlib/src/touhou/boss-presentation.js'];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
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
b.endPhase('defeated');
const next=b.phaseCharges[0],handoff={phase:b.phaseIndex,frame:b.phaseFrame,
  oldStopped:old.display.stopped,oldEntityAlive:old.effect.alive,
  oldParticlesAlive:particles.some(vm=>vm.alive),nextScripts:next.roots.map(vm=>vm.scriptId)};
let frame=0;
globalThis.__tsstg_game={update(){frame++;game.update(0);},render:()=>game.render(),
 snapshot(){return{frame,handoff,phase:b.phaseIndex,phaseFrame:b.phaseFrame,
   old:{stopped:old.display.stopped,released:old.display.released,emitted:old.display.emitted,
     alive:old.display.alive,particlesAlive:particles.some(vm=>vm.alive)},
   next:{stopped:next.stopped,released:next.released},
   currentScripts:b.presentation.shared.charges.flatMap(c=>c.roots.map(vm=>vm.scriptId))};},
 destroy(){game.destroy();}};
`);
for(const frames of [1,60,100]){
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${frames}`);
    const child=spawnSync(binary,[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(frames),'--benchmark','--snapshot',prefix+'.json','--screenshot',prefix+'.png'],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(prefix+'.log',(child.stdout??'')+(child.stderr??''));
    if(child.error)throw child.error;assert.equal(child.status,0,child.stderr);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    assert.deepEqual(state.handoff,{phase:2,frame:0,oldStopped:true,oldEntityAlive:false,oldParticlesAlive:true,nextScripts:[68]});
    assert.equal(state.frame,frames);assert.equal(state.phaseFrame,frames);assert.equal(state.phase,2);
    assert.equal(state.old.stopped,true);assert.equal(state.old.released,false);assert.equal(state.old.emitted,1);
    if(frames===1)assert.equal(state.old.particlesAlive,true);
    assert.equal(state.next.stopped,false);assert.equal(state.next.released,frames>=90);
    variants.push({backend,state,pngSha256:sha(prefix+'.png')});
  }
  assert.deepEqual(variants[0].state,variants[1].state,'Backend state parity');
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,'Backend image parity');
  results.push({frames,variants});console.log('PASS charge retirement +'+frames);
}
assert.deepEqual(hashes(),sourceHashes,'Production source changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,binarySha256:sha(binary),results,
  scope:'Early Sunny spell defeat: old attack events stop; existing ANM tails and next nonspell preparation survive. V8/QuickJS state and image parity; no original executable run.'},null,2)+'\n');
