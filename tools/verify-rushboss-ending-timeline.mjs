import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/ending-timeline'),scratch=path.join(root,'build/rushboss-ending-timeline');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=['games/rushboss/src/runtime.js','games/rushboss/src/player-adapter.js','games/rushboss/src/projectiles.js',
  'games/rushboss/src/bullet-visuals.js','games/rushboss/src/portrait-application.js','games/rushboss/src/boss-phase-entry.js',
  'games/rushboss/src/dialogue.js','packages/thlib/src/touhou/dialogue.js',
  'packages/thlib/src/touhou/boss-defeat.js','packages/thlib/src/touhou/bullet-clear-wave.js'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,sha(path.join(root,p))])),sourceHashes=hashes(),results=[];
for(const scene of [
  {name:'standalone-entry',kind:'gap',offset:0},
  {name:'before-card-start',kind:'gap',offset:159},
  {name:'card-start',kind:'gap',offset:160},
  {name:'death-start',kind:'death',offset:0},
  {name:'clear-wave',kind:'death',offset:20},
  {name:'before-burst',kind:'death',offset:59},
  {name:'burst',kind:'death',offset:60},
  {name:'before-dialogue',kind:'death',offset:119},
  {name:'dialogue-start',kind:'death',offset:120},
  {name:'dialogue-with-tail',kind:'death',offset:130},
  {name:'before-first-line',kind:'death',offset:153},
  {name:'first-line',kind:'death',offset:154},
  {name:'dialogue-input-ready',kind:'death',offset:158},
  {name:'dialogue-readable',kind:'death',offset:170},
]){
  const entry=path.join(scratch,scene.name+'.js');
  fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)},index=scene.kind==='gap'?5:6;
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',mode:'stage',phaseIndex:index,skipDialogue:true,invincible:true,seed:31,
  store:new SaveStore(),createBattle:(phases,options)=>new RushBattle(phases.map(p=>({...p,update(){},init(b){
    Object.assign(b.boss,{x:0,y:100,moving:false,vx:0,vy:0});
  }})),options)});
// Skip only the initial dialogue; the real authored after-dialogue is retained.
game.application.game.settings={...game.application.game.settings,skipDialogue:false};
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const b=game.battle;let frame=0,trigger=null;
globalThis.__tsstg_game={update(){
  if(frame===180){
    if(scene.kind==='death')for(let y=-220;y<=180;y+=40)for(let x=-180;x<=180;x+=40)
      b.spawn('MiDan',{x,y},{x:0,y:-12},3,{delay:0});
    b.damage((b.boss.hp-1)*7);b.playerAdapter.syncBoss();b.playerAdapter.damage.add(b.playerAdapter.proxy,70,{x:0,y:124});
  }
  game.update(0);
  if(frame===180)trigger={phase:b.phaseIndex,entry:b.phaseEntry?.clock.frame??null,death:b.defeatSequence?.age??null,
    spell:b.playerAdapter.spell.active,results:b.results.length};
  frame++;
},render:()=>game.render(),snapshot:()=>({scene:scene.name,frame,trigger,phase:b.phaseIndex,hp:b.boss.hp,max:b.boss.maxHp,
  protection:b.boss.damageInvulnerability.current,entry:b.phaseEntry?.clock.snapshot()??null,death:b.defeatSequence?.snapshot()??null,
  spell:b.playerAdapter.spell.active,phaseFrame:b.phaseFrame,results:b.results,notice:game.application.game.hud.activeNotice,
  liveBullets:b.projectiles.entities().filter(e=>e.alive&&e.group==='bullet').length,cancelEffects:b.bulletVisuals.effects.length,
  state:game.application.game.state,sessionAge:game.application.game.age,dialogue:!!game.application.game.dialogue,
  dialogueState:game.application.game.dialogue?.snapshot()??null,
  portrait:game.application.game.dialogue?.portraitState('left')??null,
  deathEffects:b.presentation.shared.hasDeathEffects,visuals:b.presentation.shared.deaths.map(d=>({age:d.age,burst:d.burst,roots:d.roots.map(vm=>vm.scriptId)}))})};
`);
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,backend+'-'+scene.name);
    const p=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,'--backend',backend,
      '--benchmark','--frames',String(181+scene.offset),'--snapshot',prefix+'.json','--screenshot',prefix+'.png'],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(prefix+'.log',(p.stdout??'')+(p.stderr??''));if(p.error)throw p.error;assert.equal(p.status,0,p.stderr);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    if(scene.kind==='gap'){
      assert.deepEqual(state.trigger,{phase:6,entry:0,death:null,spell:false,results:1});
      assert.equal(state.protection,179-scene.offset);assert.equal(state.hp,state.max);
      assert.equal(state.spell,scene.offset===160);assert.equal(state.phaseFrame,0);
      assert.equal(state.entry?.frame??null,scene.offset<160?scene.offset:null);
    }else{
      assert.deepEqual(state.trigger,{phase:6,entry:null,death:0,spell:true,results:0});
      assert.equal(state.death.age,Math.min(60,scene.offset));
      assert.equal(state.death.clearWave.radius,16+6*Math.min(60,scene.offset));
      assert.equal(state.spell,scene.offset<60);assert.equal(state.results.length,scene.offset<60?0:1);
      assert.equal(state.notice,scene.offset>=60);assert.equal(state.deathEffects,scene.offset>=60);
      assert.equal(state.dialogue,scene.offset>=120);
      if(scene.offset>=120){
        assert.ok(state.portrait,'source dialogue creates portraits immediately');
        assert.equal(state.dialogueState.boxScript!==null,scene.offset>=154,'first line starts34 frames after dialogue creation');
        assert.deepEqual(state.dialogueState.entrance,{frame:Math.min(38,scene.offset-120),portraits:true,
          speaker:scene.offset>=124,text:scene.offset>=154,inputReady:scene.offset>=158});
        if(scene.offset>120)assert.ok(state.portrait.alpha>0,'portraits animate during the text preparation');
      }
      assert.equal(state.state,scene.offset<60?'combat':scene.offset<120?'ending':'after');
      if(scene.offset>=60)assert.equal(state.liveBullets,0);
      else assert.ok(state.liveBullets>0,'wave must leave distant moving bullets until it reaches them');
    }
    variants.push({backend,state,pngSha256:sha(prefix+'.png')});
  }
  assert.deepEqual(variants[0].state,variants[1].state,scene.name+': native state parity');
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,scene.name+': native image parity');
  results.push({scene,state:variants[0].state,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
  console.log('PASS '+scene.name);
}
assert.deepEqual(hashes(),sourceHashes,'Sources changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,results,originalExecutableRun:false,
  scope:'Real application and common owners, with private trajectories suppressed for controlled source-timing checks. Actual Rush dialogue and native screenshots on both backends.'},null,2)+'\n');
