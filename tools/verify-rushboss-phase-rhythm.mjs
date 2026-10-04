// Native evidence for the actual damage-pass handoff and the following authored
// nonspell. Old spell trajectory is silenced only to isolate its defeat frame.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/phase-rhythm'),scratch=path.join(root,'build/rushboss-phase-rhythm');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['games/rushboss/src/runtime.js','games/rushboss/src/shared-presentation.js','games/rushboss/src/artia.js',
  'games/rushboss/src/boss-phase-timing.js','packages/thlib/src/touhou/boss-phase-timeline.js','packages/thlib/src/touhou/boss-presentation.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
for(const scene of [
  {name:'defeat-frame',boss:'sunny',index:1,offset:0,first:180},
  {name:'before-hud',boss:'sunny',index:1,offset:118,first:180},
  {name:'hud-visible',boss:'sunny',index:1,offset:119,first:180},
  {name:'attack-charge',boss:'sunny',index:1,offset:160,first:180},
  {name:'before-first-bullet',boss:'sunny',index:1,offset:179,first:180},
  {name:'first-bullet',boss:'sunny',index:1,offset:180,first:180},
  {name:'attack-running',boss:'sunny',index:1,offset:210,first:180},
  {name:'artia-short-preparation',boss:'artia',index:1,offset:120,first:120},
  {name:'artia-move-preparation',boss:'artia',index:3,offset:240,first:240},
]){
  const entry=path.join(scratch,`${scene.name}.js`);
  fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)};
const game=createRushPortraitGame(tsstg,{startBoss:scene.boss,phaseIndex:scene.index,mode:'stage',
  invincible:true,skipDialogue:true,store:new SaveStore(),createBattle:(phases,options)=>new RushBattle(
    phases.map((p,i)=>i===scene.index?{...p,update(){}}:p),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const b=game.battle;let frame=0,handoff=null,firstBullet=null,hudVisible=null;
globalThis.__tsstg_game={update(){
  if(frame===90){
    // Scripted pre-damage leaves one HP; the final hit still passes through
    // the real capped player batch and normal in-update phase handoff.
    b.damage((b.boss.hp-1)*7);b.playerAdapter.syncBoss();
    b.playerAdapter.damage.add(b.playerAdapter.proxy,70,{x:b.boss.x,y:224-b.boss.y});
  }
  game.update(0);
  if(frame===90)handoff={phase:b.phaseIndex,age:b.phaseFrame,clock:b.phaseTimeline.frame,protection:b.boss.damageInvulnerability.current,transition:b.transition,hp:b.boss.hp,max:b.boss.maxHp};
  if(handoff){
    if(hudVisible===null&&b.presentation.shared.hud.panels[0].animations.length)hudVisible=b.phaseFrame;
    if(firstBullet===null&&b.statistics.spawned>0)firstBullet=b.phaseFrame;
  }
  frame++;
},render:()=>game.render(),snapshot:()=>({scene:scene.name,frame,handoff,firstBullet,hudVisible,
  timeline:b.phaseTimeline.snapshot(),phase:b.phaseIndex,phaseFrame:b.phaseFrame,protection:b.boss.damageInvulnerability.current,
  hp:b.boss.hp,max:b.boss.maxHp,spawned:b.statistics.spawned,ringAnimations:b.presentation.shared.hud.panels[0].animations.length,
  hud:b.presentation.shared.hud.snapshot(),charges:b.presentation.shared.charges.map(c=>({age:c.age,color:c.color,released:c.released,roots:c.roots.map(vm=>vm.scriptId)}))})};
`);
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${scene.name}`);
    const child=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(91+scene.offset),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,(child.stdout??'')+(child.stderr??''));if(child.error)throw child.error;assert.equal(child.status,0,child.stderr);
    const state=JSON.parse(fs.readFileSync(`${prefix}.json`,'utf8'));
    assert.deepEqual(state.handoff,{phase:scene.index+1,age:0,clock:0,protection:119,transition:0,hp:state.max,max:state.max});
    assert.equal(state.phaseFrame,scene.offset);assert.equal(state.timeline.frame,scene.offset);assert.equal(state.hp,state.max);
    assert.equal(state.protection,Math.max(0,119-scene.offset));
    assert.equal(state.hudVisible,scene.offset<119?null:119);assert.equal(state.ringAnimations,scene.offset<119?0:7);
    assert.equal(state.firstBullet,scene.offset<scene.first?null:scene.first);
    if(scene.offset>=160)assert.equal(state.hud.panels[0].fraction,1);
    variants.push({backend,state,pngSha256:sha(`${prefix}.png`)});
  }
  assert.deepEqual(variants[0].state,variants[1].state,`${scene.name}: V8/QuickJS state parity`);
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,`${scene.name}: V8/QuickJS image parity`);
  results.push({scene,state:variants[0].state,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
  console.log(`PASS ${scene.name}: same-frame handoff, source preparation and native parity`);
}
assert.deepEqual(hashes(),sourceHashes,'Production files changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,results,originalExecutableRun:false,
  scope:'Source-reviewed phase timing in the actual Rush portrait application. Native V8/QuickJS parity; not original-executable pixel comparison.'},null,2)+'\n');
