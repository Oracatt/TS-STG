// Actual native acceptance of the public audio pack at production spell timeout.
// Mutations below are fixture clocks only; all ending, death-delay, UI, ANM and
// audio loading/playback paths are the production application's own operations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BOSSES} from '../games/rushboss/src/catalog.js';
import {RUSH_PORTRAIT_SPELLS} from '../games/rushboss/src/portrait-application.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let output='reports/rushboss/timeout-audio-native',binary=process.env.TSSTG_BINARY??'build/Release/ts-stg.exe',chosen=null;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--exe'&&args[i+1])binary=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
const out=resolve(root,output),fixtures=join(root,'build/rushboss-timeout'),exe=resolve(root,binary);
assert.ok(existsSync(exe),'Build the native TS-STG host first');
mkdirSync(out,{recursive:true});mkdirSync(fixtures,{recursive:true});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sources=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?
  sources(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const files=[...sources('packages/thlib/src'),...sources('games/rushboss/src'),'tools/verify-rushboss-timeout.mjs',
  'packages/thlib/assets/touhou-common/manifest.json','packages/thlib/assets/touhou-common/audio/manifest.json'].sort();
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,hash(join(root,file))]));
const before=sourceHashes(),binarySha256=hash(exe);
const stable=()=>{assert.deepEqual(sourceHashes(),before,'Production sources or common pack changed during native acceptance');assert.equal(hash(exe),binarySha256);};
const audio=JSON.parse(readFileSync(join(root,'packages/thlib/assets/touhou-common/audio/manifest.json'),'utf8'));
const audioEvidence=[46,69].map(id=>{
  const definition=audio.definitions.find(row=>row.id===id);assert.ok(definition,`Missing source sound ${id}`);
  const file=audio.files[definition.fileIndex],sha256=hash(join(root,'packages/thlib/assets/touhou-common',file.path));
  assert.equal(sha256,file.sha256);return{id,...definition,file:file.name,sha256};
});
const phase=BOSSES[0].phases[1];
const scenes=[{name:'v8-sunny-natural-timeout',backend:'v8',natural:true,bossIndex:0,phaseIndex:1,
  key:phase.key,time:phase.time,survival:false,frames:Math.round(phase.time*60)+120},
  ...['v8','quickjs'].flatMap(backend=>RUSH_PORTRAIT_SPELLS.map(card=>{
    const p=BOSSES[card.bossIndex].phases[card.phaseIndex];
    return{name:`${backend}-${card.key}`,backend,natural:false,bossIndex:card.bossIndex,phaseIndex:card.phaseIndex,
      key:card.key,time:p.time,survival:!!p.survival,deathDelay:p.finalSpell||p.final?p.deathDelay??60:0,
      frames:(p.deathDelay??60)+210};
  }))].filter(scene=>!chosen||scene.name===chosen);
assert.ok(scenes.length,'Unknown --scene');
const results=[];
const report=()=>writeFileSync(join(out,chosen?`${chosen}-report.json`:'report.json'),JSON.stringify({
  scope:'Production Rush portrait application, actual native audio load/play and GPU rendering; no original executable run',
  fixtureLimits:'Boundary cases advance only phaseFrame to the last authored frame; the natural case advances all frames from zero. Invincible player with no input. Sound volume zero still loads and plays native sound resources.',
  sourceStable:true,sourceHashes:before,nativeBinarySha256:binarySha256,audioEvidence,results,passed:results.length===scenes.length},null,2)+'\n');

for(const scene of scenes){
  stable();const entry=join(fixtures,`${scene.name}.js`),prefix=join(out,scene.name);
  const options={startBoss:scene.bossIndex,phaseIndex:scene.phaseIndex,mode:scene.natural?'stage':'spell',difficulty:1,
    character:0,invincible:true,skipDialogue:true};
  writeFileSync(entry,`import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const handles=new Map(),loads=[],plays=[],requests=[],trace=[];
let frame=0,flushes=0,renderCount=0,observedResults=0;
const host={...tsstg,loadSound(path){const id=tsstg.loadSound(path);handles.set(id,path);loads.push({frame,path});return id;},
 playSound(id,...args){plays.push({frame,path:handles.get(id),arguments:args});return tsstg.playSound(id,...args);}};
const game=createRushPortraitGame(host,{...${JSON.stringify(options)},store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
if(!game.resources.audio)throw new Error('Native common audio adapter is absent');
const audio=game.resources.audio,request=audio.request.bind(audio),flush=audio.flush.bind(audio);
audio.request=(id,x)=>{requests.push({frame,id});return request(id,x);};
audio.flush=()=>{flushes++;return flush();};
const initial={phaseFrame:game.battle.phaseFrame,phaseKey:game.battle.phase.key,phaseTime:game.battle.phase.time};
${scene.natural?'':`game.battle.phaseFrame=Math.round(game.battle.phase.time*60)-1;`}
globalThis.__tsstg_game={update(){
 game.update(0);frame++;
 const b=game.battle;
 if(b.results.length!==observedResults){observedResults=b.results.length;trace.push({frame,phaseIndex:b.phaseIndex,phaseFrame:b.phaseFrame,
  result:{...b.results.at(-1)},sharedResult:{...b.presentation.shared.spell.result}});}
},render(){renderCount++;return game.render();},postFrame(now){return game.postFrame(now);},snapshot(){return{
 hostFrames:frame,renderCount,flushes,initial,trace,loads,plays,requests,
 battle:{phaseIndex:game.battle.phaseIndex,phaseFrame:game.battle.phaseFrame,finished:game.battle.finished,
  results:game.battle.results,bossAlive:game.battle.boss.alive,dying:game.battle.dying??null},
 session:{state:game.application.game.state,completed:game.application.game.completed},state:game.snapshot()};}};
`);
  const started=Date.now(),child=spawn(exe,[relative(root,entry).replaceAll('\\','/'),'--root',root,'--backend',scene.backend,
    '--profile-warmup','0','--frames',String(scene.frames),'--benchmark','--snapshot',`${prefix}.json`,
    '--screenshot',`${prefix}.png`,'--profile',`${prefix}-profile.json`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
  let status;try{status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
  finally{clearTimeout(timer);}
  writeFileSync(`${prefix}-output.txt`,stdout+stderr);
  assert.equal(timedOut,false,`${scene.name}: native run exceeded four minutes`);
  assert.equal(status,0,`${scene.name}: native process failed\n${stdout}\n${stderr}`);stable();
  const state=JSON.parse(readFileSync(`${prefix}.json`,'utf8')),profile=JSON.parse(readFileSync(`${prefix}-profile.json`,'utf8'));
  assert.equal(state.hostFrames,scene.frames);assert.equal(state.renderCount,scene.frames);assert.equal(state.flushes,scene.frames);
  assert.equal(profile.headless,false);assert.equal(profile.renderFrames,scene.frames);assert.equal(profile.simulationFrames,scene.frames);
  assert.equal(state.initial.phaseFrame,0);assert.equal(state.initial.phaseKey,scene.key);assert.equal(state.initial.phaseTime,scene.time);
  assert.equal(state.battle.results.length,1);assert.equal(state.trace.length,1);
  const result=state.battle.results[0];assert.equal(result.key,scene.key);assert.equal(result.reason,'timeout');
  assert.equal(result.captured,scene.survival);assert.equal(state.trace[0].sharedResult.captured,scene.survival);
  assert.equal(state.trace[0].sharedResult.timeout,!scene.survival);
  const requested=id=>state.requests.filter(row=>row.id===id);
  const played=name=>state.plays.filter(row=>row.path?.replaceAll('\\','/').endsWith(`/audio/${name}`));
  assert.equal(requested(69).length,scene.survival?0:1);assert.equal(played('se_fault.wav').length,scene.survival?0:1);
  assert.equal(requested(46).length,scene.survival?1:0);assert.equal(played('se_cardget.wav').length,scene.survival?1:0);
  assert.ok(state.plays.length>0,'Native sound playback must actually occur');
  assert.ok(state.plays.every(row=>Math.abs(row.arguments[0]-0.00001)<1e-12),'Muted tests must still call the native sound adapter');
  if(scene.natural){
    assert.equal(state.trace[0].frame,Math.round(scene.time*60));assert.equal(state.battle.phaseIndex,2);
    assert.equal(state.battle.finished,false);assert.equal(state.battle.bossAlive,true);assert.equal(state.session.state,'combat');
    assert.ok(state.battle.phaseFrame>0,'Next phase must advance');
  }else{
    assert.equal(state.trace[0].frame,1+scene.deathDelay);assert.equal(state.battle.finished,true);
    assert.equal(state.battle.bossAlive,false);assert.equal(state.battle.dying,null);assert.equal(state.session.state,'result');
  }
  results.push({...scene,elapsedMs:Date.now()-started,passed:true,pngSha256:hash(`${prefix}.png`),snapshotSha256:hash(`${prefix}.json`),
    profileSha256:hash(`${prefix}-profile.json`),fixtureSha256:hash(entry),result,trace:state.trace,
    sound69:{requests:requested(69),plays:played('se_fault.wav')},sound46:{requests:requested(46),plays:played('se_cardget.wav')},
    flushes:state.flushes,nativeSoundLoads:state.loads.length,nativeSoundPlays:state.plays.length,
    finalPhaseIndex:state.battle.phaseIndex,finalSession:state.session.state});
  report();console.log(`PASS ${scene.name}: ${scene.frames} GPU frames, ${state.flushes} real audio flushes, final ${state.session.state}`);
}
console.log(`PASS ${results.length} serial native timeout cases; no interactive process remains. Report: ${out}`);
