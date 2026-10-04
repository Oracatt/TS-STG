import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/damage-protection'),scratch=path.join(root,'build/rushboss-damage-protection');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['packages/thlib/src/touhou/damage.js','packages/thlib/src/touhou/enemy.js','packages/thlib/src/touhou/boss-hud.js',
  'games/rushboss/src/runtime.js','games/rushboss/src/boss-health-profile.js','games/rushboss/src/shared-presentation.js','games/rushboss/src/portrait-application.js'];
const sourceHashes=()=>Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const before=sourceHashes(),results=[];
for(const scene of [
  {name:'group-protected',index:2,frames:119,hit:true},
  {name:'group-expiry',index:2,frames:120,hit:true},
  {name:'group-first-damage',index:2,frames:121,hit:true},
  {name:'standalone-protected',index:6,frames:19,hit:true},
  {name:'standalone-first-damage',index:6,frames:21,hit:true},
  {name:'shared-spell-handoff',index:0,frames:121},
  {name:'practice-full',index:1,frames:90,practice:true},
]){
  const source=`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)};
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',mode:scene.practice?'spell':'stage',phaseIndex:scene.index,
 invincible:true,skipDialogue:true,store:new SaveStore(),
 createBattle:(phases,options)=>new RushBattle(phases.map(p=>({...p,update(){},init(b){
   Object.assign(b.boss,{x:0,y:100,vx:0,vy:0,moving:false});b.state.tick=0;
 }})),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const b=game.battle;let frame=0,handoff=null;
globalThis.__tsstg_game={update(){
  if(scene.hit){b.playerAdapter.syncBoss();b.playerAdapter.damage.add(b.playerAdapter.proxy,70,{x:0,y:124});}
  if(scene.name==='shared-spell-handoff'&&frame===120){
    b.damage(b.boss.hp*7+1);handoff={hp:b.boss.hp,max:b.boss.maxHp,index:b.phaseIndex,age:b.phaseFrame};
  }
  game.update(0);frame++;
},render:()=>game.render(),snapshot:()=>({scene:scene.name,frame,handoff,battle:b.snapshot(),
 hp:b.boss.hp,max:b.boss.maxHp,protection:b.boss.damageInvulnerability.current,
 recordedDamage:b.playerAdapter.health.damageTotal,scaledHp:b.playerAdapter.health.scaledHp,
 ringAnimations:b.presentation.shared.hud.panels[0].animations.length,hud:b.presentation.shared.hud.snapshot()})};
`;
  const entry=path.join(scratch,`${scene.name}.js`);fs.writeFileSync(entry,source);const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,`${backend}-${scene.name}`);
    const p=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(scene.frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,(p.stdout??'')+(p.stderr??''));if(p.error)throw p.error;assert.equal(p.status,0,p.stderr);
    const state=JSON.parse(fs.readFileSync(`${prefix}.json`,'utf8')),panel=state.hud.panels[0];
    if(scene.name==='group-protected'||scene.name==='standalone-protected'){
      assert.equal(state.protection,1);assert.equal(state.hp,state.max);assert.equal(state.ringAnimations,0);
      assert.ok(state.recordedDamage>0);assert.ok(state.battle.score>0);
    }else if(scene.name==='group-expiry'){
      assert.equal(state.protection,0);assert.equal(state.hp,state.max);assert.equal(state.ringAnimations,7);
      assert.equal(panel.target,1);assert.equal(panel.fraction,Math.fround(.025));
    }else if(scene.name==='group-first-damage'||scene.name==='standalone-first-damage'){
      assert.equal(state.protection,0);assert.equal(state.battle.player.state,1);
      assert.equal(state.hp,state.max-(scene.index===2?70:10));
    }else if(scene.name==='shared-spell-handoff'){
      assert.deepEqual(state.handoff,{hp:3000,max:3000,index:1,age:0});
      assert.equal(state.hp,3000);assert.equal(panel.target,Math.fround(3000/23000));
      assert.equal(panel.fraction,Math.fround(3000/23000));
      assert.deepEqual(panel.markers,[Math.fround(3000/23000),0,0,0]);
    }else{
      assert.equal(state.hp,state.max);assert.equal(panel.fraction,1);assert.equal(panel.target,1);
      assert.deepEqual(panel.markers,[0,0,0,0]);
    }
    variants.push({backend,state,pngSha256:sha(`${prefix}.png`)});
  }
  assert.deepEqual(variants[0].state,variants[1].state,`${scene.name}: native state parity`);
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,`${scene.name}: native image parity`);
  results.push({scene,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
  console.log(`PASS ${scene.name}: V8/QuickJS state and screenshot parity`);
}
assert.deepEqual(sourceHashes(),before,'Production files changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes:before,results,
  originalExecutableRun:false,scope:'Actual public HP/HUD plus Rush adapter; private trajectories disabled. Source rules and backend parity, not original-executable pixel comparison.'},null,2)+'\n');
