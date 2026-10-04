// Isolate a public driven curve in the normal portrait renderer. This verifies
// native backend equivalence and lifetime/history, not original-game pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/curve-natural-exit',prepare=false;
for(let index=0;index<args.length;index++){
  if(args[index]==='--out')output=args[++index];
  else if(args[index]==='--prepare')prepare=true;
  else throw new Error(`Unknown argument ${args[index]}`);
}
const out=path.resolve(root,output),scratch=path.join(root,'build/rushboss-curve-natural-exit');
const binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['games/rushboss/src/runtime.js','games/rushboss/src/projectiles.js',
  'games/rushboss/src/portrait-application.js','packages/thlib/src/touhou/lasers.js',
  'packages/thlib/src/touhou/laser-cancellation.js','packages/thlib/src/world.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,hash(path.join(root,file))]));
const sourceHashes=hashes(),fixtures=[],results=[];
for(const age of [27,40,70]){
  const scene=`curve-${age}`,entry=path.join(scratch,scene+'.js');
  fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const game=createRushPortraitGame(tsstg,{store:new SaveStore(),startBoss:'sunny',phaseIndex:0,
  mode:'stage',difficulty:1,invincible:true,skipDialogue:true,seed:13,
  createBattle:(phases,options)=>new RushBattle(phases.map(phase=>({...phase,init(){},update(){}})),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const battle=game.battle;let frame=0,head=null;
globalThis.__tsstg_game={update(){
  game.update(0);frame++;
  if(frame===130)head=battle.laser({x:0,y:100},0,4,{curve:30,speed:480,width:12});
},render:()=>game.render(),snapshot(){
  const entities=battle.world.entities.concat(battle.world.pending),state=battle.projectiles.lasers.get(head);
  return{frame,age:frame-130,phase:battle.phase.key,head:head?{alive:head.alive,x:head.x,y:head.y,frame:head.frame,
    cleanOnOutOfRange:head.cleanOnOutOfRange,segments:head.segments}:null,
    parts:entities.filter(entity=>entity.alive&&entity.laserHead===head).map(entity=>({x:entity.x,y:entity.y,frame:entity.frame})),
    publicAlive:!!state?.alive,publicCount:battle.projectiles.debris.lasers.filter(laser=>laser.alive).length,
    samples:state?.samples?.map(sample=>({x:sample.position.x,y:sample.position.y,hasActor:!!sample.actor,
      actorAlive:sample.actor?.alive??false,speed:sample.speed}))??[],
    count:state?.p.count??0,revision:game.exportReplay().config.revision};
}};
`);
  const runs=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,backend+'-'+scene),command=[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(130+age),'--benchmark','--screenshot',prefix+'.png','--snapshot',prefix+'.json'];
    fixtures.push({scene,backend,binary,args:command});
    if(prepare)continue;
    const child=spawnSync(binary,command,{cwd:root,encoding:'utf8',windowsHide:true,timeout:90000});
    fs.writeFileSync(prefix+'.log',(child.stdout??'')+(child.stderr??''));
    if(child.error)throw child.error;
    assert.equal(child.status,0,`${backend}/${scene}: ${child.stderr}`);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    assert.equal(state.age,age);assert.equal(state.head.cleanOnOutOfRange,true);
    if(age<70){
      assert.equal(state.head.alive,true);assert.equal(state.publicAlive,true);
      assert.equal(state.publicCount,1);assert.equal(state.count,30);assert.equal(state.samples.length,30);
      assert.ok(state.head.x>192,'head must have left the playfield');
      assert.ok(state.samples.some(sample=>sample.x<192),'a real part of the tail must remain on screen');
      assert.equal(state.head.x,age*8);assert.equal(state.head.y,100);
      if(age===40){
        assert.equal(state.parts.length,30);
        assert.ok(state.samples.every(sample=>sample.hasActor&&sample.actorAlive&&sample.x>0),
          'filled history must contain real actors, with no pull back to the birth point');
        for(let index=1;index<state.samples.length;index++)assert.equal(state.samples[index-1].x-state.samples[index].x,8,
          'history spacing must retain the authored 480/60 velocity');
      }
    }else{
      assert.equal(state.head.alive,false);assert.equal(state.parts.length,0);
      assert.equal(state.publicAlive,false);assert.equal(state.publicCount,0);assert.equal(state.samples.length,0);
    }
    runs.push({backend,state,pngSha256:hash(prefix+'.png')});
  }
  if(prepare)continue;
  assert.deepEqual(runs[0].state,runs[1].state,scene+': backend state mismatch');
  assert.equal(runs[0].pngSha256,runs[1].pngSha256,scene+': backend image mismatch');
  results.push({age,runs});console.log('PASS '+scene);
}
assert.deepEqual(hashes(),sourceHashes,'Production source changed during verification');
fs.writeFileSync(path.join(out,prepare?'fixtures.json':'report.json'),JSON.stringify(prepare?{sourceHashes,fixtures}:{
  passed:true,sourceHashes,binarySha256:hash(binary),results,originalExecutableRun:false,
  scope:'Actual portrait application/resources, empty authored attack to isolate a 30-sample curve at (0,100), speed 480, width 12. Default natural culling remains enabled. Captures at curve ages 27/40/70 verify whole-history exit and native V8/QuickJS pixel parity.'},null,2)+'\n');
