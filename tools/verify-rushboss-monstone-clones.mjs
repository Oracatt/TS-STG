import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/rushboss/monstone-clones');
const scratch=path.join(root,'build/rushboss-monstone-clones'),binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['games/rushboss/src/monstone.js','games/rushboss/src/runtime.js','games/rushboss/src/projectiles.js',
  'games/rushboss/src/portrait-application.js','games/rushboss/src/boss-artwork.js','packages/thlib/src/world.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,hash(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
for(const scene of [
  {name:'natural-stage-timeout',frames:2634,natural:true,headless:true},
  {name:'natural-practice-timeout',frames:2580,natural:true,headless:true,practice:true},
  {name:'before-timeout',frames:180},
  {name:'timeout-frame',frames:181},
  {name:'next-card-preparation',frames:241},
  {name:'practice-escape',frames:241,practice:true},
]){
  const entry=path.join(scratch,scene.name+'.js');
  fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const scene=${JSON.stringify(scene)};
const game=createRushPortraitGame(tsstg,{store:new SaveStore(),startBoss:'monstone',phaseIndex:7,
  mode:scene.practice?'spell':'stage',invincible:true,skipDialogue:true,seed:13});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const battle=game.battle,deadline=scene.natural?2400:181,trace=[];let frame=0,ghosts=[];
const sample=()=>({frame,phase:battle.phase.key,phaseFrame:battle.phaseFrame,clones:ghosts.filter(e=>e.alive).length,
  cloneFrames:ghosts.map(e=>e.frame),spawned:battle.statistics.spawned,
  bullets:battle.world.entities.concat(battle.world.pending).filter(e=>e.alive&&e.group==='bullet').length,
  entry:battle.phaseEntry?.clock.frame??null,escaping:!!battle.escaping,escaped:!!battle.escaped});
globalThis.__tsstg_game={update(){
  game.update(0);frame++;
  if(frame===76)ghosts=battle.world.entities.filter(e=>e.kind==='Monstone');
  if(!scene.natural&&frame===180){battle.phaseFrame=2399;battle.playerAdapter.spell.age.set(2399);}
  if([deadline-1,deadline,deadline+60,deadline+160].includes(frame))trace.push(sample());
},render:()=>game.render(),snapshot:()=>({trace,current:sample(),results:battle.results,
  cloneBodies:game.graphics.bossArtwork.snapshot().actors.length,
  state:game.application.game.state,revision:game.exportReplay().config.revision})};
`);
  const runs=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,backend+'-'+scene.name),args=[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(scene.frames),'--snapshot',prefix+'.json',...(scene.headless?['--headless']:['--benchmark','--screenshot',prefix+'.png'])];
    const result=spawnSync(binary,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    fs.writeFileSync(prefix+'.log',(result.stdout??'')+(result.stderr??''));if(result.error)throw result.error;
    assert.equal(result.status,0,`${backend}/${scene.name}: ${result.stderr}`);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    assert.equal(state.revision,14);assert.equal(state.trace[0].clones,4);
    if(scene.name!=='before-timeout'){
      assert.equal(state.results.length,1);assert.equal(state.results[0].key,'Monstone_SC_8');
      assert.equal(state.results[0].reason,'timeout');assert.equal(state.results[0].captured,true);
      const ended=state.trace[1];assert.equal(ended.clones,0,'all bodies retire in the deadline update');
      assert.equal(state.current.clones,0);assert.deepEqual(state.current.cloneFrames,ended.cloneFrames);
      assert.equal(state.current.spawned,ended.spawned,'no terminated clone produces a projectile');
      if(scene.practice)assert.ok(ended.bullets>0,'practice leaves ordinary bullets on their source escape path');
      else assert.equal(state.current.phase,'Monstone_SC_9');
      if(!scene.headless)assert.equal(state.cloneBodies,scene.practice&&scene.frames>181?0:1,'renderer retains only the actual Boss');
    }else assert.equal(state.cloneBodies,5);
    runs.push({backend,state,...(!scene.headless?{pngSha256:hash(prefix+'.png')}:{})});
  }
  assert.deepEqual(runs[0].state,runs[1].state,scene.name+': backend state mismatch');
  if(!scene.headless)assert.equal(runs[0].pngSha256,runs[1].pngSha256,scene.name+': backend pixels mismatch');
  results.push({scene,runs});console.log('PASS '+scene.name);
}
assert.deepEqual(hashes(),sourceHashes,'Source changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,binarySha256:hash(binary),results,
  scope:'Actual portrait application. Natural headless cases run the complete 40-second card and its exit. GPU cases advance 180 real frames to create active clones, then seek the deadline clock to isolate retirement. V8 and QuickJS run serially. No original executable run.'},null,2)+'\n');
