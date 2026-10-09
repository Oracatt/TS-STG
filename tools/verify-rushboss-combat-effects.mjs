// Native evidence through the real portrait application. Test setup fixes one
// source-like Boss/phase and disables only its private attack update. Controls
// omit selected drawSelf submissions; they never change update, RNG, health,
// animation lifetime, birth timing or cancellation state.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',output='reports/rushboss/combat-effects',chosen=null,prepareOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i].split(',');
  else if(args[i]==='--prepare')prepareOnly=true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend),'Use v8 or quickjs');

// Add further production actions here rather than creating a second renderer.
// The default suite uses fifteen processes. A QuickJS charge-release pair can
// be run separately without repeating the complete V8 workload.
const allScenes=[
  {name:'charge-inward',kind:'charge',frames:20,paired:true,component:'charge',minPixels:50},
  {name:'charge-release',kind:'charge',frames:80,paired:true,component:'charge',minPixels:50},
  {name:'fog-birth',kind:'bullet',frames:7,paired:true,component:'bullet',minPixels:20},
  {name:'fog-body',kind:'bullet',frames:16,paired:true,component:'bullet',minPixels:20},
  {name:'bullet-cancel',kind:'cancel',frames:6,paired:true,component:'cancel',minPixels:20},
  {name:'retire-outside',kind:'retire-outside',frames:2,paired:false},
  {name:'retire-expired',kind:'retire-expired',frames:2,paired:false},
  {name:'miss-before',kind:'miss',frames:120,paired:false},
  {name:'miss-death',kind:'miss',frames:132,paired:false},
  {name:'miss-respawn',kind:'miss',frames:230,paired:false},
];
const scenes=allScenes.filter(scene=>!chosen||chosen.includes(scene.name));
assert.ok(scenes.length,'No scenes selected');
if(chosen)assert.ok(chosen.every(name=>allScenes.some(scene=>scene.name===name)),'Unknown scene selected');
const out=resolve(root,output),scratch=join(root,'build/rushboss-combat-effects');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?sourceFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([
  ...sourceFiles('packages/thlib/dist'),...sourceFiles('games/rushboss/src'),
  'packages/thlib/assets/touhou-common/anm/effect.json','packages/thlib/assets/touhou-common/anm/bullet.json',
].map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=sourceHashes(),results=[],fixtures=[];

function fixtureSource(scene,masked){return `
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const scene=${JSON.stringify(scene)},masked=${masked};
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',phaseIndex:scene.kind==='miss'?1:0,
  mode:'stage',difficulty:3,character:0,invincible:scene.kind!=='miss',skipDialogue:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const battle=game.battle,shared=battle.presentation.shared,player=battle.sharedPlayer;
// Keep all reusable owner/update/render paths. Remove private phase setup
// actors and disable private attack generation, then inject the action under
// test through the actual business entry point.
battle.world.clear();
for(const charge of shared.charges)charge.destroy();shared.charges.length=0;
battle.presentation.charges.length=0;
battle.phase={...battle.phase,hp:1500,time:60,update(){}};
Object.assign(battle.boss,{x:0,y:100,vx:0,vy:0,fx:0,fy:0,moving:false,hp:1500,maxHp:1500});
battle.playerAdapter.health.set(1500,!!battle.phase.spell);
battle.phaseFrame=1200;
if(scene.kind==='miss')shared.spell.duration=3600;
const spellEffectAtStart=shared.spell.effect,originalLives=player.lives;
let frame=0,missAccepted=null,lastMarkers=[];
const testBullets=[];
if(scene.kind==='charge')battle.effect('maple',battle.boss,{storetimes:1,blast:true,follow:battle.boss});
else if(scene.kind==='bullet'||scene.kind==='cancel'){
  for(let row=0;row<3;row++)for(let column=0;column<3;column++)testBullets.push(
    battle.spawn('XiaoYu',{x:-70+column*70,y:110-row*70},{x:0,y:0},3,
      {delay:scene.kind==='bullet'?15:0,checking:false,cleanOnOutOfRange:false}));
}else if(scene.kind==='retire-outside')testBullets.push(
  battle.spawn('XiaoYu',{x:battle.bounds.maxX+30,y:0},{x:0,y:0},3,{delay:1,checking:false}));
else if(scene.kind==='retire-expired')testBullets.push(
  battle.spawn('XiaoYu',{x:0,y:80},{x:0,y:0},3,{delay:0,lifetime:2,checking:false}));

// Instrument actual source-VM flush calls, including the owner's captured
// p41 body commands. Offscreen points cannot affect the screenshot. The mask
// changes only draw output, leaving complete animation snapshots identical.
const markers=new Map(),seen=new Set();let markerIndex=0,currentPriority=null;
const queue=game.graphics.queue,enqueuePriority=queue.enqueuePriority.bind(queue),enqueueDrawable=queue.enqueueDrawable.bind(queue);
function atPriority(priority,callback,draw){const previous=currentPriority;currentPriority=priority;
  try{return callback(draw);}finally{currentPriority=previous;}}
queue.enqueuePriority=(priority,callback,options)=>enqueuePriority(priority,draw=>atPriority(priority,callback,draw),options);
queue.enqueueDrawable=(callback,options)=>enqueueDrawable(draw=>atPriority(options?.priority,callback,draw),options);
const geometryKinds=new Set(['quad','statefulQuad','mesh','mesh3d','sprite','spriteRegion','lineStrip']);
function stamp(vm,label,rootScript=vm?.scriptId){
  if(!vm)return;for(const child of vm.children)stamp(child,label,rootScript);
  if(seen.has(vm))return;seen.add(vm);
  const color=(0xe10000ff+(markerIndex++<<8))>>>0,original=vm.drawSelf.bind(vm);
  vm.drawSelf=(draw,view)=>{
    if(draw.enqueueAnm)return original(draw,view);
    if(masked&&label===scene.component)return;
    const start=draw.commands.length;original(draw,view);
    const emitted=draw.commands.slice(start).filter(command=>geometryKinds.has(command[0]));
    if(!emitted.length)return;
    const kindCounts={};for(const command of emitted)kindCounts[command[0]]=(kindCounts[command[0]]??0)+1;
    markers.set(color,{label,script:vm.scriptId,rootScript,layer:vm.effectiveLayer,
      anmPriority:vm.drawPriority,priority:currentPriority,alpha:vm.alpha,sprite:vm.spriteIndex,
      position:vm.worldPosition(),scale:[vm.scaleX,vm.scaleY],kindCounts});
    draw.commands.splice(start,0,['point',-100,-100,color]);
  };
}
function prepare(){
  for(const charge of shared.charges)for(const vm of charge.roots)stamp(vm,'charge');
  for(const visual of battle.bulletVisuals.visuals.values()){
    stamp(visual.animation,visual.ending?'ending':'bullet');stamp(visual.child,visual.ending?'ending':'bullet');
  }
  for(const effect of battle.bulletVisuals.effects)stamp(effect,'cancel');
  for(const visual of player.effects)stamp(visual.animation,'player-death');
  for(const vm of shared.spell.effect?.children??[])stamp(vm,'spell-ring');
  stamp(shared.spell.info[1],'spell-name');
}
function collectMarkers(commands){let target=null;lastMarkers=[];
  for(let command=0;command<commands.length;command++){
    const c=commands[command];if(c[0]==='targetBegin')target=c[1];else if(c[0]==='targetEnd')target=null;
    else if(c[0]==='point'&&c[1]===-100&&markers.has(c[3]))lastMarkers.push({...markers.get(c[3]),target,command});
  }
}
function bankState(bank){return{rng:{state:bank.rng.state,last:bank.rng.last,modulus:bank.rng.modulus},
  roots:bank.instances.filter(vm=>vm.alive&&!vm.parent).map(vm=>vm.snapshot())};}
function exactPresentation(){return{
  presentation:battle.presentation.snapshot(),
  playerBanks:Object.fromEntries(Object.entries(battle.touhouResources.banks).filter(([,bank])=>bank).map(([name,bank])=>[name,bankState(bank)])),
  bossBanks:Object.fromEntries(Object.entries(battle.presentation.banks).map(([name,bank])=>[name,bankState(bank)])),
  bulletVisuals:[...battle.bulletVisuals.visuals.values()].map(visual=>visual.snapshot()),
  bulletEffects:battle.bulletVisuals.effects.map(vm=>vm.snapshot()),
  playerEffects:player.effects.map(effect=>({age:effect.age,animation:effect.animation.snapshot()})),
};}
globalThis.__tsstg_game={update(){
  if(scene.kind==='cancel'&&frame===2)for(const bullet of testBullets)bullet.kill('cancel');
  if(scene.kind==='miss'&&frame===120){player.invulnerability.set(0);missAccepted=battle.miss();}
  game.update(0);frame++;
},render(){prepare();const commands=game.render();collectMarkers(commands);return commands;},snapshot(){return{
  game:game.snapshot(),exactPresentation:exactPresentation(),markers:lastMarkers,
  surfaces:{a:game.graphics.background,b:game.graphics.compositeTarget},proof:{
    hostFrames:frame,missAccepted,originalLives,lives:player.lives,deaths:player.deaths,playerState:player.state,
    phaseIndex:battle.phaseIndex,phaseFrame:battle.phaseFrame,hp:battle.boss.hp,results:battle.results,
    transition:battle.transition,finished:battle.finished,captureFailed:battle.captureFailed,spellBonus:battle.spellBonus,
    spellActive:shared.spell.active,spellCaptureEligible:shared.spell.captureEligible,
    sameSpellEffect:shared.spell.effect===spellEffectAtStart,spellEffectAlive:shared.spell.effect?.alive??false,
    spellEffectScripts:shared.spell.effect?.children.map(vm=>vm.scriptId)??[],spellInfo:shared.spell.info.map(vm=>vm.snapshot()),
    charges:shared.charges.map(charge=>charge.snapshot()),
    bulletVisuals:[...battle.bulletVisuals.visuals.values()].map(visual=>visual.snapshot()),
    bulletEffects:battle.bulletVisuals.effects.map(vm=>vm.snapshot()),
    privateBulletDeaths:testBullets.map(bullet=>({alive:bullet.alive,reason:bullet.destroyReason,frame:bullet.frame,delay:bullet.delay})),
  }};}};
`;}

function compareImages(fullFile,maskedFile){
  const full=decodeRgbaPng(readFileSync(fullFile)),masked=decodeRgbaPng(readFileSync(maskedFile));
  assert.deepEqual([full.width,full.height],[masked.width,masked.height]);
  const roi={x:48,y:24,width:576,height:672};let changedPixels=0,changedOutside=0,maxChannelDifference=0;
  const bounds={left:full.width,top:full.height,right:-1,bottom:-1};
  for(let y=0;y<full.height;y++)for(let x=0;x<full.width;x++){
    const p=(y*full.width+x)*4;let changed=false;
    for(let c=0;c<4;c++){const delta=Math.abs(full.rgba[p+c]-masked.rgba[p+c]);changed||=delta!==0;maxChannelDifference=Math.max(maxChannelDifference,delta);}
    if(!changed)continue;
    if(x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height){
      changedPixels++;bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);
    }else changedOutside++;
  }
  return{roi,changedPixels,changedOutside,maxChannelDifference,bounds:changedPixels?bounds:null};
}
function validateScene(scene,state){
  const proof=state.proof,markers=state.markers,surfaces=state.surfaces;
  assert.equal(proof.hostFrames,scene.frames);assert.equal(proof.phaseFrame,1200+scene.frames);
  assert.equal(proof.finished,false);assert.equal(proof.results.length,0);assert.equal(proof.transition,0);assert.ok(proof.hp>0);
  if(scene.kind==='charge'){
    const charge=proof.charges[0];assert.ok(charge);assert.equal(charge.age,scene.frames);
    assert.equal(charge.emitted,1);assert.equal(charge.released,scene.frames>=70);
    const chargeMarkers=markers.filter(marker=>marker.label==='charge');assert.ok(chargeMarkers.length);
    assert.ok(chargeMarkers.every(marker=>marker.priority===49&&marker.target===surfaces.b),'Attack circle/particle source layer20/p49 uses composited target B');
    assert.ok(!chargeMarkers.some(marker=>[99,108,149,150,151,152].includes(marker.script)),'The attack must not borrow entry/aura geometry');
    assert.ok(chargeMarkers.some(marker=>marker.script===(scene.frames<70?71:88)&&marker.kindCounts.mesh),'Real source shrinking/expanding gradient circle must be submitted');
    assert.ok(chargeMarkers.some(marker=>marker.script===(scene.frames<70?62:77)&&marker.kindCounts.mesh3d),'Real source rotating particles must be submitted');
  }else if(scene.kind==='bullet'){
    assert.equal(proof.bulletVisuals.length,9);assert.equal(proof.bulletEffects.length,0);
    const body=scene.frames>=16;
    assert.ok(proof.bulletVisuals.every(visual=>visual.ready===body&&visual.phase===(body?'active':'birth')));
    assert.ok(proof.bulletVisuals.every(visual=>visual.sprite===(body?67:325)),'Birth uses original palette fog sprite; activation uses the body sprite');
    assert.ok(markers.filter(marker=>marker.label==='bullet').every(marker=>marker.priority===41&&marker.target===surfaces.a),'Embedded source body is owned by bullet callback41, not ANM layer0');
    assert.equal(markers.filter(marker=>marker.label==='bullet').length,9);
  }else if(scene.kind==='cancel'){
    assert.equal(proof.bulletEffects.length,9);assert.ok(proof.privateBulletDeaths.every(b=>!b.alive&&b.reason==='cancel'));
    assert.ok(proof.bulletEffects.every(vm=>vm.scriptId===221),'The palette selects the independent source221 cancellation cohort');
    const cancellation=markers.filter(marker=>marker.label==='cancel');assert.ok(cancellation.length>=9);
    assert.ok(cancellation.some(marker=>marker.script===219)&&cancellation.some(marker=>marker.script===220));
    assert.ok(cancellation.every(marker=>marker.rootScript===221&&
      marker.priority===(marker.script===219?49:marker.script===220?50:-1)&&marker.target===surfaces.b),
      'Source221 is an invisible controller; its globally registered children219/220 retain their layer20/21 callbacks49/50');
  }else if(scene.kind.startsWith('retire-')){
    assert.equal(proof.bulletVisuals.length,0);assert.equal(proof.bulletEffects.length,0);
    assert.ok(proof.privateBulletDeaths.every(b=>!b.alive&&b.reason===(scene.kind==='retire-outside'?'outOfRange':'expired')));
    assert.ok(!markers.some(marker=>marker.label==='bullet'||marker.label==='cancel'),'Natural retirement must not leave fog, body or cancellation submissions');
  }else if(scene.kind==='miss'){
    assert.equal(proof.phaseIndex,1);assert.equal(proof.spellActive,true);assert.equal(proof.sameSpellEffect,true);assert.equal(proof.spellEffectAlive,true);
    assert.deepEqual(proof.spellEffectScripts,[4,5]);assert.equal(proof.spellInfo.length,3);assert.ok(proof.spellInfo.every(vm=>vm.alive));
    const rings=markers.filter(marker=>marker.label==='spell-ring'),name=markers.filter(marker=>marker.label==='spell-name');
    assert.deepEqual(rings.map(marker=>marker.script),[4,5]);assert.ok(rings.every(marker=>marker.priority===13&&marker.target===surfaces.a));
    assert.equal(name.length,1);assert.equal(name[0].priority,81);assert.equal(name[0].target,null);
    if(scene.frames<=120){assert.equal(proof.missAccepted,null);assert.equal(proof.captureFailed,false);assert.equal(proof.spellCaptureEligible,true);}
    else{
      assert.equal(proof.missAccepted,true);assert.equal(proof.captureFailed,true);assert.equal(proof.spellCaptureEligible,false);assert.equal(proof.spellBonus,0);
      assert.equal(proof.deaths,1);assert.equal(proof.lives,proof.originalLives-1);
      if(scene.frames>=230){assert.equal(proof.playerState,1);assert.ok(proof.hp<1500,'Shared respawn retaliation still damages the live Boss');}
      else assert.ok(markers.some(marker=>marker.label==='player-death'),'Real player hit/death source ANM is visibly submitted');
    }
  }
}

for(const scene of scenes){
  const states={},paths={};
  for(const variant of scene.paired?['full','masked']:['full']){
    const entry=join(scratch,`${backend}-${scene.name}-${variant}.js`),prefix=join(out,`${scene.name}-${variant}`);
    writeFileSync(entry,fixtureSource(scene,variant==='masked'));fixtures.push(relative(root,entry));
    if(prepareOnly)continue;
    const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(scene.frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
    if(run.error)throw run.error;assert.equal(run.status,0,`${scene.name}/${variant}: ${run.stderr}`);
    states[variant]=JSON.parse(readFileSync(`${prefix}.json`));paths[variant]=`${prefix}.png`;
  }
  if(prepareOnly)continue;
  validateScene(scene,states.full);let pixels=null;
  if(scene.paired){
    assert.deepEqual(states.full.game,states.masked.game,`${scene.name}: draw-only control changed the complete production snapshot`);
    assert.deepEqual(states.full.exactPresentation,states.masked.exactPresentation,`${scene.name}: draw-only control changed source ANM or bank RNG state`);
    assert.deepEqual(states.full.proof,states.masked.proof,`${scene.name}: draw-only control changed lifetimes/readiness/health`);
    pixels=compareImages(paths.full,paths.masked);assert.ok(pixels.changedPixels>=scene.minPixels,`${scene.name}: source effect must change visible playfield pixels`);
    assert.equal(pixels.changedOutside,0,`${scene.name}: target effect must remain in the source playfield`);
  }
  results.push({...scene,proof:states.full.proof,markers:states.full.markers,surfaces:states.full.surfaces,
    pixels,pairedSimulationIdentical:scene.paired?true:null,
    pngSha256:Object.fromEntries(Object.entries(paths).map(([variant,path])=>[variant,hash(readFileSync(path))]))});
  console.log(`PASS ${scene.name}: ${pixels?`${pixels.changedPixels} visible pixels; complete ANM/RNG/game states identical`:'production lifecycle and source render submissions checked'}`);
}
assert.deepEqual(sourceHashes(),before,'Production source/assets changed during this verification');
if(prepareOnly){
  writeFileSync(join(scratch,`${backend}-prepared.json`),JSON.stringify({backend,fixtures,scenes,sourceHashes:before},null,2)+'\n');
  console.log(`Prepared ${fixtures.length} fixtures; no native process started`);
}else{
  const missBefore=results.find(scene=>scene.name==='miss-before'),missRespawn=results.find(scene=>scene.name==='miss-respawn');
  if(missBefore&&missRespawn){
    assert.ok(missRespawn.proof.phaseFrame>missBefore.proof.phaseFrame);
    assert.equal(missBefore.proof.hp,1500);assert.ok(missRespawn.proof.hp<missBefore.proof.hp);
    assert.equal(missBefore.proof.phaseIndex,missRespawn.proof.phaseIndex);
  }
  writeFileSync(join(out,'report.json'),JSON.stringify({format:'ts-stg-rushboss-combat-effects-v1',backend,sourceHashes:before,
    binarySha256:hash(readFileSync(join(root,'build/Release/ts-stg.exe'))),passed:true,
    scope:'Production portrait renderer and reusable source ANM assets. Test-only setup disables private phase attack generation. Paired controls suppress only selected drawSelf commands; complete production snapshots, source animation state and bank RNG state stay equal. Miss scenes retain the same spell/rings/title while shared player death and retaliation run.',
    originalExecutableRun:false,pixelEquivalentToOriginalClaimed:false,results},null,2)+'\n');
  console.log(`PASS ${results.length} native combat-effect scenes (${backend}); production source hashes stable`);
}
