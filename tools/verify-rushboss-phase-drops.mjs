// Controlled native scenes exercise production phase handoff, cleanup and
// public item owners; only authored bullet-pattern generation is disabled.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/phase-drops'),scratch=path.join(root,'build/rushboss-phase-drops');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['games/rushboss/src/runtime.js','games/rushboss/src/boss-drop-profile.js','games/rushboss/src/projectiles.js',
  'games/rushboss/src/player-adapter.js','games/rushboss/src/graphics-portrait.js','packages/thlib/src/touhou/items.js','packages/thlib/src/touhou/boss-presentation.js'];
const sourceHashes=Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const results=[];
for(const [scene,frames]of [['nonspell-handoff',121],['spell-drops',121],['spell-drops-flight',151],
  ['ordinary-timeout',121],['practice-defeat',121],['survival-timeout',121]]){
  const source=`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)},spell=scene!=='nonspell-handoff',survival=scene==='survival-timeout';
const game=createRushPortraitGame(tsstg,{startBoss:survival?'monstone':'sunny',mode:scene==='practice-defeat'?'spell':'stage',phaseIndex:survival?7:spell?1:0,
 invincible:true,skipDialogue:true,store:new SaveStore(),
 createBattle:(phases,options)=>new RushBattle(phases.map(p=>({...p,update(){},init(b){
  Object.assign(b.boss,{x:0,y:100,vx:0,vy:0,moving:false});b.state.tick=0;
 }})),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const b=game.battle;let frame=0,handoff=null;
globalThis.__tsstg_game={update(){
 if(frame===120){
  for(let y=-180;y<=180;y+=40)for(let x=-160;x<=160;x+=40)b.spawn('MiDan',{x,y},{},0,{delay:0});
  if(scene.endsWith('timeout'))b.endPhase('timeout');else b.damage(b.boss.hp*7+1);
  const counts={};for(const item of b.playerAdapter.items.items)counts[item.type]=(counts[item.type]??0)+1;
  handoff={phaseIndex:b.phaseIndex,phaseFrame:b.phaseFrame,hp:b.boss.hp,maximumHp:b.boss.maxHp,
   spell:b.playerAdapter.spell.active,transition:b.transition,counts,
   items:b.playerAdapter.items.items.map(i=>({type:i.type,x:i.x,y:i.y,vx:i.vx,vy:i.vy})),
   liveBullets:b.projectiles.entities().filter(e=>e.alive&&e.group==='bullet').length};
 }
 game.update(0);frame++;
},render:()=>game.render(),snapshot:()=>({scene,frame,handoff,hud:b.presentation.shared.hud.snapshot(),
 items:b.playerAdapter.items.items.map(i=>({type:i.type,x:i.x,y:i.y,state:i.state})),battle:b.snapshot()})};
`;
  const entry=path.join(scratch,`${scene}.js`);fs.writeFileSync(entry,source);
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${scene}`),args=[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`];
    const process=spawnSync(path.join(root,'build/Release/ts-stg.exe'),args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,process.stdout+'\n'+process.stderr);if(process.error)throw process.error;
    assert.equal(process.status,0,process.stdout+'\n'+process.stderr);
    const state=JSON.parse(fs.readFileSync(`${prefix}.json`,'utf8')),h=state.handoff;
    assert.equal(h.liveBullets,0);
    if(scene==='nonspell-handoff'){
      assert.equal(h.phaseIndex,1);assert.equal(h.phaseFrame,0);assert.equal(h.hp,h.maximumHp);assert.equal(h.spell,true);assert.equal(h.transition,0);
      assert.deepEqual(h.counts,{});
      assert.equal(state.hud.panels[0].target,Math.fround(3000/23000));
      assert.equal(state.hud.panels[0].fraction,Math.fround(3000/23000));
    }else if(scene==='ordinary-timeout'||scene==='practice-defeat'){
      assert.deepEqual(h.counts,{});assert.equal(h.items.length,0);assert.equal(state.items.length,0);
      if(scene==='practice-defeat')assert.equal(state.battle.finished,true);
    }else{
      const count=scene==='survival-timeout'?40:15;
      assert.deepEqual(h.counts,{1:count,2:count});assert.equal(h.items.length,count*2);
      for(const item of h.items){assert.ok(Math.hypot(item.x,item.y-124)<=64.00002);assert.equal(item.vy,Math.fround(-2.2));}
      assert.equal(state.items.length,count*2);assert.ok(state.items.every(i=>i.state===1));
      assert.ok(state.items.every(i=>Math.abs(i.x)<=64&&i.y<200),'Flight stays near the Boss rather than screen-wide bullet positions');
    }
    variants.push({backend,state,pngSha256:sha(`${prefix}.png`)});
  }
  assert.deepEqual(variants[0].state,variants[1].state,`${scene}: backend state parity`);
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,`${scene}: backend image parity`);
  results.push({scene,frames,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
}
assert.deepEqual(Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))])),sourceHashes,'Production files changed during verification');
const report={passed:true,scope:'Production native handoff and local reward drops, not original executable pixel comparison',sourceHashes,results};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
