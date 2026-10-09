// Native acceptance through the production portrait application and public
// TouhouGame. Paired controls suppress only the selected ANM drawSelf calls;
// they retain all gameplay, audio, ANM clocks, source RNG and registration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';
import {invalidTouhouSpellTime} from '../packages/thlib/dist/touhou/spell.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
let output='reports/rushboss/end-feedback-native',binary='build/Release/ts-stg.exe',backend=null,chosen=null,prepareOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--exe'&&args[i+1])binary=args[++i];
  else if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i].split(',');
  else if(args[i]==='--prepare')prepareOnly=true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
if(backend)assert.ok(['v8','quickjs'].includes(backend),'Use v8 or quickjs');
const actionFrame=120,allScenes=[
  ...['capture','timeout','failed-defeat','life'].flatMap(kind=>[
    {name:`${kind}-notice`,kind,after:60,paired:true,component:'notice'},
    {name:`${kind}-tail`,kind,after:210,paired:false,tail:true},
  ]),
  {name:'boss-death-burst',kind:'boss-death',after:68,paired:true,component:'inversion'},
  {name:'boss-death-second-ring',kind:'boss-death',after:85,paired:true,component:'inversion'},
  {name:'boss-death-fade',kind:'boss-death',after:110,paired:true,component:'inversion'},
  {name:'boss-death-tail',kind:'boss-death',after:270,paired:false,tail:true},
  {name:'ordinary-death',kind:'ordinary',after:8,paired:true,component:'inversion'},
  {name:'ordinary-death-tail',kind:'ordinary',after:210,paired:false,tail:true},
].map(scene=>({...scene,frames:actionFrame+scene.after}));
const scenes=allScenes.filter(scene=>!chosen||chosen.includes(scene.name));
assert.ok(scenes.length,'No scenes selected');
if(chosen)assert.ok(chosen.every(name=>allScenes.some(scene=>scene.name===name)),'Unknown scene selected');
const out=resolve(root,output),scratch=join(root,'build/rushboss-end-feedback'),exe=resolve(root,binary);
assert.ok(existsSync(exe),'Build the native engine first');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?
  sourceFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([...sourceFiles('packages/thlib/dist'),...sourceFiles('games/rushboss/src'),
  'games/rushboss/main.js',
  'packages/thlib/assets/touhou-common/anm/effect.json','packages/thlib/assets/touhou-common/anm/front.json',
  'packages/thlib/assets/touhou-common/anm/ascii_960.json','packages/thlib/assets/touhou-common/audio/manifest.json',
  'tools/verify-rushboss-end-feedback.mjs'].sort().map(file=>[file,hash(join(root,file))]));
const before=sourceHashes(),binarySha256=hash(exe),results=[],prepared=[];
const stable=()=>{assert.deepEqual(sourceHashes(),before,'Production source/assets changed during acceptance');assert.equal(hash(exe),binarySha256);};
const manifest=JSON.parse(readFileSync(join(root,'packages/thlib/assets/touhou-common/audio/manifest.json'),'utf8'));
const audioEvidence=[5,17,37,46,69].map(id=>{
  const definition=manifest.definitions.find(row=>row.id===id);assert.ok(definition,`Missing source sound ${id}`);
  const file=manifest.files[definition.fileIndex],sha256=hash(join(root,'packages/thlib/assets/touhou-common',file.path));
  assert.equal(sha256,file.sha256);return{id,...definition,file:file.name,sha256};
});

function fixtureSource(scene,masked){return `
import {SaveStore} from '@ts-stg/thlib';
import {TouhouGame,createTouhouResources} from '@ts-stg/thlib/touhou';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const scene=${JSON.stringify(scene)},masked=${masked},actionFrame=${actionFrame};
let frame=0,flushes=0,renders=0,clockReads=0,missAccepted=null,item=null,death=null;
const handles=new Map(),loads=[],plays=[],requests=[],notices=[],events=[],markers=[],seen=new Set();
const host={...tsstg,loadSound(path){const id=tsstg.loadSound(path);handles.set(id,path);loads.push({frame,path});return id;},
 playSound(id,...args){plays.push({frame,path:handles.get(id),arguments:args});return tsstg.playSound(id,...args);}};
let game,resources,battle,shared,player,hud,banks,enemy,queue,initialLives;
if(scene.kind==='ordinary'){
 resources=createTouhouResources(host,{audioVolume:0});
 game=new TouhouGame({banks:resources.banks,font:resources.font,sht:resources.shots[0],styles:resources.styles,
  renderTarget:host.createRenderTarget(960,720),compositeTarget:host.createRenderTarget(960,720),
  renderBackground(draw){for(let y=0;y<720;y+=48)for(let x=0;x<960;x+=48)
   draw.rect(x,y,48,48,((x/48+y/48)%2?0x284f74ff:0xa69b65ff));},
  onSound:(id,x)=>resources.audio.request(id,x),onEvent:(name,data)=>events.push({frame,name})});
 player=game.player;hud=game.hud;shared=game.bossPresentation;banks=game.banks;queue=game.renderQueue;
 enemy=game.spawnEnemy({script:0,x:0,y:120,hp:10,damageInvulnerability:0});
}else{
 game=createRushPortraitGame(host,{startBoss:0,phaseIndex:scene.kind==='boss-death'?6:scene.kind==='life'?0:1,
  mode:'stage',difficulty:1,character:0,invincible:scene.kind!=='failed-defeat',skipDialogue:true,store:new SaveStore(),
  clock:()=>{clockReads++;return frame/60;}});
 game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
 resources=game.resources;battle=game.battle;shared=battle.presentation.shared;player=battle.sharedPlayer;
 hud=game.application.game.hud;banks=game.application.game.banks;queue=game.graphics.queue;
 // Disable only private authored attack generation, preserving common owners.
 battle.world.clear();for(const charge of shared.charges)charge.destroy();shared.charges.length=0;
 battle.presentation.charges.length=0;battle.phase={...battle.phase,update(){}};battle.phaseFrame=1200;battle.playerAdapter.spell.age.set(1200);
 Object.assign(battle.boss,{x:0,y:100,vx:0,vy:0,fx:0,fy:0,moving:false,checking:true,invulnerable:false,immuneDamage:false});
 const notify=battle.onHudNotice;
 battle.onHudNotice=(type,value)=>{notices.push({frame,type,value});return notify?.(type,value);};
 const emit=battle.playerAdapter.context.onEvent;
 battle.playerAdapter.context.onEvent=(name,data)=>{events.push({frame,name,type:data?.item?.type});return emit?.(name,data);};
}
initialLives=player.lives;
if(!resources.audio)throw new Error('Native audio adapter absent');
const audio=resources.audio,request=audio.request.bind(audio),flush=audio.flush.bind(audio);
audio.request=(id,x)=>{requests.push({frame,id});return request(id,x);};audio.flush=()=>{flushes++;return flush();};
const geometry=new Set(['quad','statefulQuad','mesh','mesh3d','sprite','spriteRegion','lineStrip']);
let priority=null,lastMarkers=[];
const enqueuePriority=queue.enqueuePriority.bind(queue),enqueueDrawable=queue.enqueueDrawable.bind(queue);
const at=(p,callback,draw)=>{const old=priority;priority=p;try{return callback(draw);}finally{priority=old;}};
queue.enqueuePriority=(p,callback,options)=>enqueuePriority(p,draw=>at(p,callback,draw),options);
queue.enqueueDrawable=(callback,options)=>enqueueDrawable(draw=>at(options?.priority,callback,draw),options);
function stamp(vm,label,rootScript=vm?.scriptId){
 if(!vm)return;for(const child of vm.children)stamp(child,label,rootScript);if(seen.has(vm))return;seen.add(vm);
 const drawSelf=vm.drawSelf.bind(vm);
 vm.drawSelf=(draw,view)=>{if(draw.enqueueAnm)return drawSelf(draw,view);
  if(masked&&label===scene.component)return;
  const start=draw.commands.length;drawSelf(draw,view);
  if(draw.commands.slice(start).some(command=>geometry.has(command[0])))markers.push({label,script:vm.scriptId,rootScript,
   priority,blend:vm.B(0x499),alpha:vm.alpha,position:vm.worldPosition(),layer:vm.effectiveLayer});};
}
function prepare(){
 for(const bank of new Set([...Object.values(banks),...Object.values(battle?.presentation?.banks??{}),...Object.values(battle?.touhouResources?.banks??{})])){
  for(const vm of bank?.instances??[]){
   if(vm.bank.data.name==='effect'&&vm.scriptId===25)stamp(vm,'inversion');
  }
 }
 // Bank names are owned externally and need not be stored in parsed data.
 for(const bank of [banks.effect,battle?.presentation?.banks.effect,battle?.touhouResources?.banks.effect])
  for(const vm of bank?.instances??[])if(vm.scriptId===25)stamp(vm,'inversion');
 for(const vm of banks.front?.instances??[])if([49,50,53,84].includes(vm.scriptId))stamp(vm,'notice');
 for(const vm of banks.ascii_960?.instances??[])if(vm.scriptId>=4&&vm.scriptId<=13)stamp(vm,'notice');
 for(const vm of enemy?.effects??[])stamp(vm,'ordinary-death');
}
function allBankState(){return Object.fromEntries([...Object.entries(banks).map(([name,bank])=>['session/'+name,bank]),
 ...Object.entries(battle?.presentation?.banks??{}).map(([name,bank])=>['boss/'+name,bank]),
 ...Object.entries(battle?.touhouResources?.banks??{}).map(([name,bank])=>['player/'+name,bank])]
 .filter(([,bank])=>bank).map(([name,bank])=>[name,{rng:{state:bank.rng.state,last:bank.rng.last,modulus:bank.rng.modulus},
 roots:bank.instances.filter(vm=>vm.alive&&!vm.parent).map(vm=>vm.snapshot())}]));}
globalThis.__tsstg_game={update(){
 if(frame===actionFrame){
  if(scene.kind==='ordinary')enemy.damage(100,{x:0,y:300},game.context);
  else if(scene.kind==='life')item=battle.playerAdapter.items.spawn({type:5,x:player.x,y:player.y,speed:0});
  else if(scene.kind==='timeout'){battle.phaseFrame=Math.round(battle.phase.time*60)-1;battle.playerAdapter.spell.age.set(battle.phaseFrame);}
  else if(scene.kind==='failed-defeat'){player.invulnerability.set(0);missAccepted=battle.miss();}
  else battle.damage(1000000,'fixture-shot');
 }
 if(scene.kind==='failed-defeat'&&frame===actionFrame+12)battle.damage(1000000,'fixture-shot');
 game.update(0);if(scene.kind==='ordinary')audio.flush();frame++;
},render(){prepare();markers.length=0;renders++;const commands=game.render();lastMarkers=markers.slice();return commands;},
 // The production application owns automatic postFrame invocation through
 // its injected clock. The native wrapper exposes only update and render.
 snapshot(){return{
 frame,renders,flushes,clockReads,loads,plays,requests,notices,events,markers:lastMarkers,
 game:game.snapshot(),hud:hud.snapshot(),presentation:shared?.snapshot(),banks:allBankState(),
 proof:{initialLives,lives:player.lives,missAccepted,item:item?{type:item.type,state:item.state}:null,
  results:battle?.results??[],bossAlive:battle?.boss.alive??null,finished:battle?.finished??null,
  session:game.application?.game.state??null,paused:game.application?.game.paused??game.paused,
  endingFeedbackActive:game.application?.game.endingFeedbackActive??false,
  hasDeathEffects:shared?.hasDeathEffects??false,enemy:enemy?.snapshot()??null,
  ordinaryEffects:enemy?.effects.map(vm=>vm.snapshot())??[]}
 };}};
`;}

function compareImages(fullFile,maskedFile){
  const full=decodeRgbaPng(readFileSync(fullFile)),masked=decodeRgbaPng(readFileSync(maskedFile));
  assert.deepEqual([full.width,full.height],[masked.width,masked.height]);
  const roi={x:48,y:24,width:576,height:672};let changedPixels=0,changedOutside=0,invertedPixels=0,maxDifference=0;
  for(let y=0;y<full.height;y++)for(let x=0;x<full.width;x++){
    const p=(y*full.width+x)*4;let delta=0,inverted=true;
    for(let c=0;c<3;c++){delta=Math.max(delta,Math.abs(full.rgba[p+c]-masked.rgba[p+c]));inverted&&=Math.abs(full.rgba[p+c]+masked.rgba[p+c]-255)<=8;}
    if(!delta)continue;maxDifference=Math.max(maxDifference,delta);
    if(x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height){changedPixels++;if(inverted&&delta>=20)invertedPixels++;}
    else changedOutside++;
  }
  return{roi,changedPixels,changedOutside,invertedPixels,maxDifference};
}
function validate(scene,state){
  assert.equal(state.frame,scene.frames);assert.equal(state.renders,scene.frames);assert.equal(state.flushes,scene.frames);
  if(scene.kind!=='ordinary')assert.equal(state.clockReads,scene.frames,'Production application must read the injected frame clock');
  assert.ok(state.plays.length>0,'Actual native sound playback must occur');
  assert.ok(state.plays.every(row=>Math.abs(row.arguments[0]-.00001)<1e-12),'Audio remains muted through native playback');
  const request=id=>state.requests.filter(row=>row.id===id&&row.frame>=actionFrame),played=name=>state.plays.filter(row=>row.frame>=actionFrame&&row.path.replaceAll('\\','/').endsWith(`/audio/${name}`));
  if(['capture','timeout','failed-defeat'].includes(scene.kind)){
    const result=state.proof.results[0];assert.ok(result);assert.equal(result.captured,scene.kind==='capture');
    assert.equal(result.reason,scene.kind==='timeout'?'timeout':'defeated');
    const type=scene.kind==='capture'?0:1;assert.ok(state.notices.some(row=>row.type===type));
    assert.equal(request(46).length,scene.kind==='capture'?1:0);assert.equal(played('se_cardget.wav').length,scene.kind==='capture'?1:0);
    assert.equal(request(69).length,scene.kind==='timeout'?1:0);assert.equal(played('se_fault.wav').length,scene.kind==='timeout'?1:0);
    if(scene.kind==='failed-defeat'){assert.equal(state.proof.missAccepted,true);assert.ok(state.notices.every(row=>row.frame>=actionFrame+12),'Miss forfeits capture eligibility, with failure notice at the phase end');}
    if(!scene.tail){
      assert.ok(state.markers.some(row=>row.label==='notice'&&row.script===(type===0?49:50)),'Original front notice must submit visible geometry');
      assert.ok(state.hud.time&&!invalidTouhouSpellTime(state.hud.time.encodedTime),'Production app must supply the source real-time clock instead of displaying its invalid 999.99 sentinel');
    }
  }else if(scene.kind==='life'){
    assert.equal(state.proof.lives,state.proof.initialLives+1);assert.deepEqual(state.proof.item,{type:5,state:0});
    assert.ok(state.events.some(row=>row.name==='itemCollect'&&row.type===5));assert.ok(state.notices.some(row=>row.type===4));
    assert.equal(request(17).length,1);assert.equal(played('se_extend.wav').length,1);assert.ok(request(37).length>=1);assert.ok(played('se_item00.wav').length>=1);
    if(!scene.tail)assert.ok(state.markers.some(row=>row.label==='notice'&&row.script===53),'Original Extend ANM must be visibly submitted');
  }else if(scene.kind==='boss-death'){
    assert.equal(state.proof.results[0]?.captured,true);
    const deathSoundFrames=[...new Set(request(5).map(row=>row.frame))];
    assert.equal(deathSoundFrames.length,2);assert.equal(played('se_enep01.wav').length,2);
    assert.equal(deathSoundFrames[0],actionFrame);assert.ok([59,60].includes(deathSoundFrames[1]-actionFrame));
    if(scene.tail){assert.equal(state.presentation.deaths.length,0);assert.equal(state.proof.hasDeathEffects,false);assert.ok(!state.markers.some(row=>row.label==='inversion'));}
    else{
      assert.equal(state.proof.session,'ending');assert.equal(state.proof.paused,false);assert.equal(state.proof.endingFeedbackActive,true);assert.equal(state.proof.hasDeathEffects,true);
      assert.ok(state.markers.some(row=>row.label==='inversion'&&row.rootScript===25&&row.blend===4&&row.priority===50),'Boss death must actually submit original layer21 / priority50 invert geometry');
    }
  }else{
    assert.equal(state.proof.enemy.alive,false);assert.ok(!state.markers.some(row=>row.label==='inversion'));
    assert.equal(state.presentation.deaths.length,0);
    if(scene.tail)assert.equal(state.proof.ordinaryEffects.length,0);
    else assert.ok(state.markers.some(row=>row.label==='ordinary-death'&&row.rootScript===37));
  }
  if(scene.tail){
    assert.equal(state.hud.notices.filter(row=>row.alive).length,0,'Notice animation must retire after the complete source lifetime');
    assert.equal(state.hud.activeNotice,false,'Notice digits and elapsed-time animation must also retire');
  }
}
async function runNative(entry,prefix,engine,frames){
  const start=Date.now(),child=spawn(exe,[relative(root,entry).replaceAll('\\','/'),'--root',root,'--backend',engine,
    '--profile-warmup','0','--frames',String(frames),'--benchmark','--snapshot',`${prefix}.json`,
    '--screenshot',`${prefix}.png`,'--profile',`${prefix}-profile.json`],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
  let status;try{status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timer);}
  writeFileSync(`${prefix}-output.txt`,stdout+stderr);assert.equal(timedOut,false,'Native case timed out');
  assert.equal(status,0,`Native case failed: ${prefix}\n${stdout}\n${stderr}`);stable();
  const profile=JSON.parse(readFileSync(`${prefix}-profile.json`,'utf8'));
  assert.equal(profile.headless,false);assert.equal(profile.renderFrames,frames);assert.equal(profile.simulationFrames,frames);
  return{state:JSON.parse(readFileSync(`${prefix}.json`,'utf8')),elapsedMs:Date.now()-start,pngSha256:hash(`${prefix}.png`)};
}
const writeReport=()=>writeFileSync(join(out,`${backend??'both'}${chosen?'-'+chosen.join('_'):''}-report.json`),JSON.stringify({
  format:'ts-stg-rushboss-end-feedback-v1',passed:results.length===scenes.length*(backend?1:2),sourceHashes:before,binarySha256,audioEvidence,
  scope:'Production portrait application, original shared ANM and native muted sound load/play. Ordinary enemy comparison uses public TouhouGame and a fixture checkerboard.',
  fixtureLimits:'Disable private attack generation and set an existing phase clock to 1200, then trigger actual damage, timeout, hit or item spawn/collection. Fixed 60 Hz platform clock for deterministic source time labels. Paired controls omit only selected ANM drawSelf submissions.',
  originalExecutableRun:false,pixelEquivalentToOriginalClaimed:false,results},null,2)+'\n');
for(const engine of backend?[backend]:['v8','quickjs'])for(const scene of scenes){
  const cases={};for(const variant of scene.paired?['full','masked']:['full']){
    const name=`${engine}-${scene.name}-${variant}`,entry=join(scratch,`${name}.js`),prefix=join(out,name);
    writeFileSync(entry,fixtureSource(scene,variant==='masked'));prepared.push(relative(root,entry));
    if(!prepareOnly){stable();cases[variant]={...await runNative(entry,prefix,engine,scene.frames),prefix,fixtureSha256:hash(entry)};}
  }
  if(prepareOnly)continue;
  validate(scene,cases.full.state);let pixels=null;
  if(scene.paired){
    for(const field of ['game','banks','hud','presentation','proof','notices','events','requests','plays','loads'])
      assert.deepEqual(cases.full.state[field],cases.masked.state[field],`${scene.name}: draw-only control changed ${field}`);
    pixels=compareImages(`${cases.full.prefix}.png`,`${cases.masked.prefix}.png`);
    if(scene.kind==='ordinary')assert.equal(pixels.changedPixels+pixels.changedOutside,0,'Ordinary death must contain no invert draw');
    else assert.ok(pixels.changedPixels>=20,`${scene.name}: selected source animation must change visible playfield pixels`);
    if(scene.kind==='boss-death'){
      assert.equal(pixels.changedOutside,0,'Boss inversion is clipped to the playfield');
      if(scene.after<100)assert.ok(pixels.invertedPixels>=100,'Actual image must include inverse-color pixels, not merely an effect object');
    }
  }
  results.push({...scene,backend:engine,passed:true,pixels,proof:cases.full.state.proof,hud:cases.full.state.hud,
    presentation:cases.full.state.presentation,markers:cases.full.state.markers,notices:cases.full.state.notices,
    sounds:cases.full.state.requests.filter(row=>row.frame>=actionFrame),
    captures:Object.fromEntries(Object.entries(cases).map(([variant,row])=>[variant,{elapsedMs:row.elapsedMs,pngSha256:row.pngSha256,fixtureSha256:row.fixtureSha256}]))});
  writeReport();console.log(`PASS ${engine} ${scene.name}: ${scene.frames} GPU/audio frames${pixels?`, ${pixels.changedPixels} visible pixels, ${pixels.invertedPixels} inverse pixels`:''}`);
}
if(prepareOnly){writeFileSync(join(scratch,'prepared.json'),JSON.stringify({prepared,scenes,sourceHashes:before},null,2)+'\n');console.log(`Prepared ${prepared.length} fixtures; no native process launched`);}
else{
  if(!backend)for(const scene of scenes){const pair=results.filter(row=>row.name===scene.name);assert.equal(pair[0].captures.full.pngSha256,pair[1].captures.full.pngSha256,`${scene.name}: backend images differ`);}
  stable();writeReport();console.log(`PASS ${results.length} scenes; no interactive process remains. Report: ${out}`);
}
