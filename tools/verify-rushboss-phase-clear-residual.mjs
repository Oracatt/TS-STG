// Actual portrait Demo evidence for phase retirement. Native runs are serial.
// The original executable is never run; images compare V8 with QuickJS only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/phase-clear-residual',selected=null,prepare=false;
for(let index=0;index<args.length;index++){
  if(args[index]==='--out')output=args[++index];
  else if(args[index]==='--scenes')selected=new Set(args[++index].split(','));
  else if(args[index]==='--prepare')prepare=true;
  else throw new Error(`Unknown argument: ${args[index]}`);
}
const out=path.resolve(root,output),scratch=path.join(root,'build/rushboss-phase-clear-residual');
const binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['games/rushboss/src/runtime.js','games/rushboss/src/projectiles.js','games/rushboss/src/artia.js',
  'games/rushboss/src/sunny.js','games/rushboss/src/portrait-application.js',
  'packages/thlib/src/touhou/lasers.js','packages/thlib/src/touhou/laser-cancellation.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,hash(path.join(root,file))]));
const sourceHashes=hashes(),results=[],fixtures=[];
const cases=[
  {id:'sunny-delay75',boss:'sunny',index:5,clock:75,kind:'waiting'},
  {id:'sunny-ready90',boss:'sunny',index:5,clock:90,kind:'waiting'},
  {id:'artia-mirror150',boss:'artia',index:7,clock:150,kind:'mirror'},
  {id:'artia-natural-timeout',boss:'artia',index:7,clock:2640,natural:true,kind:'waiting'},
];
const scenes=cases.flatMap(value=>['before','cleared','after60'].map(point=>({...value,point,name:value.id+'-'+point})));
if(selected)for(const name of selected)assert.ok(cases.some(scene=>scene.id===name)||scenes.some(scene=>scene.name===name),`Unknown scene ${name}`);
for(const scene of scenes.filter(scene=>!selected||selected.has(scene.id)||selected.has(scene.name))){
  const entry=path.join(scratch,scene.name+'.js');
  fs.writeFileSync(entry,`
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const scene=${JSON.stringify(scene)};
const game=createRushPortraitGame(tsstg,{store:new SaveStore(),startBoss:scene.boss,phaseIndex:scene.index,
  mode:'stage',difficulty:1,invincible:true,skipDialogue:true,seed:13});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const battle=game.battle,phaseKey=battle.phase.key;
let frame=0,frozen=false,triggered=false,ended=false,after=0,heads=[],oldBullets=[];
const trace=[];
const entities=()=>battle.world.entities.concat(battle.world.pending);
const residual=entity=>entity.alive&&!(entity.kind==='laser'&&!entity.curve&&entity.length===0);
const sample=()=>({frame,phase:battle.phase.key,phaseFrame:battle.phaseFrame,patternFrame:battle.patternFrame,
  patternClock:battle.state.clock??battle.state.tick??null,elapsed:battle.phaseTimeElapsed,
  oldActive:oldBullets.filter(residual).length,oldHeadActive:heads.filter(residual).length,
  oldHeadsAlive:heads.filter(head=>head.alive).length,
  oldZeroLengthBeams:heads.filter(head=>head.alive&&!head.curve&&head.length===0).length,
  oldCurveSamples:entities().filter(entity=>entity.alive&&heads.includes(entity.laserHead)).length,
  heads:heads.map(head=>({id:head.id,alive:head.alive,curve:head.curve,delay:head.delay,frame:head.frame,
    width:head.width,length:head.length,segments:head.segments})),
  // Offscreen detached fragments created by the source eraser are reported,
  // but they are not mistaken for a living attack emitter.
  detached: battle.projectiles.debris.lasers.filter(laser=>laser.alive&&!laser.driven).map(laser=>({type:laser.type,
    state:laser.state,x:laser.position.x,y:laser.position.y,angle:laser.angle,width:laser.width,length:laser.length,count:laser.p.count})),
  spawned:battle.statistics.spawned,entry:battle.phaseEntry?.clock.frame??null});
const captureBefore=()=>{
  heads=entities().filter(entity=>entity.alive&&entity.kind==='laser');
  oldBullets=entities().filter(entity=>entity.alive&&entity.group==='bullet');
  triggered=true;trace.push({point:'before',...sample()});
};
const captureEnd=()=>{ended=true;after=0;trace.push({point:'cleared',...sample()});if(scene.point==='cleared')frozen=true;};
globalThis.__tsstg_game={update(){
  if(frozen)return;
  const wasEnded=ended;
  game.update(0);frame++;
  if(!triggered&&battle.phase.key===phaseKey){
    // Test the authored pattern clock, not a guessed application frame or a
    // preparation timeline. The natural case never seeks the deadline clock.
    const clock=scene.natural?battle.phaseTimeElapsed:(battle.state.clock??battle.state.tick);
    if(clock===(scene.natural?scene.clock-1:scene.clock)){
      captureBefore();
      if(scene.point==='before'){frozen=true;return;}
      if(!scene.natural){battle.endPhase('defeated');captureEnd();}
    }
  }
  if(scene.natural&&triggered&&!ended&&battle.results.some(result=>result.key===phaseKey))captureEnd();
  if(wasEnded&&++after===60){trace.push({point:'after60',...sample()});frozen=true;}
},render:()=>game.render(),snapshot:()=>({scene:scene.name,triggered,ended,after,frozen,trace,current:sample(),
  results:battle.results,revision:game.exportReplay().config.revision})};
`);
  // Allow startup cover/preparation to vary, then freeze at the requested
  // semantic checkpoint. Extra host frames render exactly that same state.
  const frames=scene.clock+240+(scene.point==='after60'?60:0),runs=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,backend+'-'+scene.name),command=[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(frames),'--benchmark','--screenshot',prefix+'.png','--snapshot',prefix+'.json'];
    fixtures.push({scene:scene.name,backend,binary,args:command});
    if(prepare)continue;
    const child=spawnSync(binary,command,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});
    fs.writeFileSync(prefix+'.log',(child.stdout??'')+(child.stderr??''));
    if(child.error)throw child.error;
    assert.equal(child.status,0,`${backend}/${scene.name}: ${child.stderr}`);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    assert.equal(state.triggered,true,'authored attack checkpoint was never reached');
    assert.equal(state.frozen,true,'requested semantic snapshot was never reached');
    const before=state.trace[0];
    assert.equal(before.point,'before');assert.ok(before.heads.length>0);
    if(scene.kind==='mirror'){
      assert.equal(before.heads.length,18);
      assert.ok(before.heads.every(head=>head.length>0&&head.length<16));
    }else assert.ok(before.heads.some(head=>head.curve&&head.frame===0),'waiting curves must exist before the clear');
    if(scene.point!=='before'){
      assert.equal(state.ended,true);assert.equal(state.results.length,1);
      assert.equal(state.results[0].reason,scene.natural?'timeout':'defeated');
      if(scene.natural)assert.equal(state.results[0].frames,2640,'natural timeout did not run the complete 44-second phase');
      for(const point of state.trace.slice(1)){
        assert.equal(point.oldActive,0,`${point.point}: visible old projectile or waiting emitter survived`);
        assert.equal(point.oldCurveSamples,0,`${point.point}: old curve produced new trail samples`);
        if(scene.kind==='mirror')assert.equal(point.oldHeadsAlive,0,'mirror children must retire with their owner');
      }
      assert.equal(state.current.oldActive,0);assert.equal(state.current.oldCurveSamples,0);
      if(scene.point==='after60')assert.equal(state.after,60);
    }
    runs.push({backend,state,pngSha256:hash(prefix+'.png')});
  }
  if(prepare)continue;
  assert.deepEqual(runs[0].state,runs[1].state,scene.name+': backend state mismatch');
  assert.equal(runs[0].pngSha256,runs[1].pngSha256,scene.name+': backend image mismatch');
  results.push({scene,runs});console.log('PASS '+scene.name);
}
assert.deepEqual(hashes(),sourceHashes,'Production source changed during verification');
fs.writeFileSync(path.join(out,prepare?'fixtures.json':'report.json'),JSON.stringify(prepare?{sourceHashes,fixtures}:{
  passed:true,sourceHashes,binarySha256:hash(binary),results,originalExecutableRun:false,
  scope:'Actual portrait application/resources. Semantic before/clear/+60 frame captures of delayed curves and short mirror edges; natural case runs the full 44-second phase. V8 and QuickJS run serially. Zero-length infinite-laser owners and detached source fragments are not classified as attack residuals. Backend image parity is not original-executable pixel equivalence.'},null,2)+'\n');
