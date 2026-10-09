// Production Rush portrait lasers are drawn by the public source field.
// A draw-only ANM destination-factor override supplies the alpha control.
// Original executables are not run; --prepare writes fixtures without launch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',output='reports/rushboss/laser-blend',prepareOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--prepare')prepareOnly=true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend),'Use v8 or quickjs');
const out=resolve(root,output),scratch=join(root,'build/rushboss-laser-blend');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?sourceFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([
  ...sourceFiles('packages/thlib/dist'),...sourceFiles('games/rushboss/src'),
  'packages/thlib/assets/reference-common/manifest.json','packages/thlib/assets/touhou-common/manifest.json',
].map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=sourceHashes(),states={},files={},fixtures=[];
const frames=60;

function fixtureSource(blend){return `
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {TOUHOU_OWNER_PRIORITIES} from '@ts-stg/thlib/touhou';
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',phaseIndex:0,mode:'stage',difficulty:3,
  character:0,invincible:true,skipDialogue:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const battle=game.battle,shared=battle.presentation.shared,field=battle.projectiles.debris;
battle.world.clear();
for(const charge of shared.charges)charge.destroy();shared.charges.length=0;battle.presentation.charges.length=0;
battle.phase={...battle.phase,hp:1500,time:60,update(){}};
Object.assign(battle.boss,{x:0,y:170,vx:0,vy:0,fx:0,fy:0,moving:false,hp:1500,maxHp:1500});
battle.playerAdapter.health.set(1500,false);battle.phaseFrame=1200;
battle.laser({x:-150,y:20},0,3,{length:300,width:7,checking:true,cleanOnOutOfRange:false});
battle.laser({x:10,y:-145},Math.PI/2,7,{length:280,width:6,checking:true,cleanOnOutOfRange:false});
battle.laser({x:-135,y:85},-.55,5,{curve:75,speed:120,width:24,checking:true,cleanOnOutOfRange:false});
battle.spawn('XiaoYu',{x:30,y:100},{x:0,y:0},3,{delay:15,checking:false,cleanOnOutOfRange:false});
let laserDraws=[],frame=0,currentPriority=null,cancellation=null;
const queue=game.graphics.queue,enqueue=queue.enqueuePriority.bind(queue);
queue.enqueuePriority=(priority,callback,options)=>enqueue(priority,draw=>{
  const old=currentPriority;currentPriority=priority;try{return callback(draw);}finally{currentPriority=old;}
},options);
const drawField=field.draw.bind(field);
field.draw=(draw,view,options)=>{
  if(draw.enqueuePriority)return drawField(draw,view,options);
  const previous=field.lasers.map(l=>[l.animation,l.animation?.B(0x499)]),start=draw.commands.length;
  if(${JSON.stringify(blend)}==='alpha')for(const [vm]of previous)vm?.B(0x499,0);
  try{return drawField(draw,view,options);}finally{
    for(const [vm,value]of previous)vm?.B(0x499,value);
    laserDraws.push({priority:currentPriority,commands:draw.commands.slice(start)});
  }
};
const fieldState=()=>({...field.snapshot(),driven:field.lasers.map(l=>!!l.driven),
  sourceBodyBlend:field.lasers.map(l=>l.animation?.B(0x499)),originCount:field.lasers.filter(l=>l.origin?.alive).length});
function bankState(bank){return{rng:{state:bank.rng.state,last:bank.rng.last,modulus:bank.rng.modulus},
  roots:bank.instances.filter(vm=>vm.alive&&!vm.parent).map(vm=>vm.snapshot())};}
globalThis.__tsstg_game={update(){game.update(0);frame++;
  if(frame===40){const before=fieldState(),count=battle.projectiles.cancel(0,204,24,0,0,true,{bullets:false});
    cancellation={frame,before,count,after:fieldState()};}
},render(){laserDraws=[];return game.render();},snapshot(){return{
  game:game.snapshot(),frame,laserDraws,laserPriority:TOUHOU_OWNER_PRIORITIES.laser,cancellation,field:fieldState(),
  actors:battle.world.entities.map(entity=>entity.snapshot()),presentation:battle.presentation.snapshot(),
  sourceBanks:Object.fromEntries(Object.entries(battle.presentation.banks).map(([name,bank])=>[name,bankState(bank)])),
  playerBanks:Object.fromEntries(Object.entries(battle.touhouResources.banks).filter(([,bank])=>bank).map(([name,bank])=>[name,bankState(bank)])),
};}};
`;}

for(const blend of ['add','alpha']){
  const entry=join(scratch,`${backend}-${blend}.js`),prefix=join(out,`${backend}-${blend}`);
  writeFileSync(entry,fixtureSource(blend));fixtures.push(relative(root,entry));
  if(prepareOnly)continue;
  const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,
    '--frames',String(frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
  if(run.error)throw run.error;assert.equal(run.status,0,`${blend}: ${run.stderr}`);
  states[blend]=JSON.parse(readFileSync(`${prefix}.json`));files[blend]=`${prefix}.png`;
}
assert.deepEqual(sourceHashes(),before,'Production source/assets changed during verification');
if(prepareOnly){
  writeFileSync(join(scratch,`${backend}-prepared.json`),JSON.stringify({backend,fixtures,sourceHashes:before},null,2)+'\n');
  console.log(`Prepared ${fixtures.length} fixtures; no native process started`);
}else{
  const {laserDraws:addDraws,...addState}=states.add,{laserDraws:alphaDraws,...alphaState}=states.alpha;
  assert.deepEqual(addState,alphaState,'Draw-only blend control must not affect gameplay, original ANM or RNG state');
  assert.equal(addState.frame,frames);assert.equal(addDraws.length,1);assert.equal(alphaDraws.length,1);
  assert.equal(addDraws[0].priority,addState.laserPriority);assert.equal(alphaDraws[0].priority,addState.laserPriority);
  assert.ok(addState.cancellation.count>0);assert.ok(addState.cancellation.after.driven.some(value=>!value),'Bomb must create source-owned debris');
  assert.ok(addState.field.sourceBodyBlend.every(value=>value===1),'public source body remains additive after drawing');
  const addCommands=addDraws[0].commands,alphaCommands=alphaDraws[0].commands;
  assert.equal(addCommands.length,alphaCommands.length);let changedFactors=0;
  for(let index=0;index<addCommands.length;index++){
    const add=structuredClone(addCommands[index]),alpha=structuredClone(alphaCommands[index]);
    if(add[0]==='statefulQuad'&&add[17][2]!==alpha[17][2]){
      assert.equal(add[17][1],'srcAlpha');assert.equal(add[17][2],'one');assert.equal(alpha[17][2],'oneMinusSrcAlpha');
      alpha[17][2]='one';changedFactors++;
    }else if(add[0]==='blendFactors'&&add[2]!==alpha[2]){
      assert.equal(add[1],'srcAlpha');assert.equal(add[2],'one');assert.equal(alpha[2],'oneMinusSrcAlpha');
      alpha[2]='one';changedFactors++;
    }
    assert.deepEqual(add,alpha,'The public geometry, UVs, alpha and non-body blend state must be identical');
  }
  assert.ok(changedFactors>=3,'At least straight, curved, and split source laser bodies must be compared');
  const curveMeshes=addCommands.filter(c=>c[0]==='mesh'&&c[2].length>8);
  assert.equal(curveMeshes.length,1,'the whole live curve is one public mesh, not independent Rush Parts');
  const curve=addState.field.lasers.find(l=>l.kind===2);
  assert.equal(curveMeshes[0][2].length,curve.samples.length*2);
  assert.equal(curveMeshes[0][3].length,(curve.samples.length-1)*6);
  const add=decodeRgbaPng(readFileSync(files.add)),alpha=decodeRgbaPng(readFileSync(files.alpha));
  assert.deepEqual([add.width,add.height],[alpha.width,alpha.height]);
  const roi={x:48,y:24,width:576,height:672};
  let brighterPixels=0,darkerPixels=0,changedOutside=0,totalRgbGain=0,maxChannelGain=0;
  for(let y=0;y<add.height;y++)for(let x=0;x<add.width;x++){
    const at=(y*add.width+x)*4;let brighter=false,darker=false;
    for(let channel=0;channel<3;channel++){
      const gain=add.rgba[at+channel]-alpha.rgba[at+channel];
      brighter||=gain>0;darker||=gain<0;totalRgbGain+=gain;maxChannelGain=Math.max(maxChannelGain,gain);
    }
    if(brighter)brighterPixels++;if(darker)darkerPixels++;
    if((brighter||darker)&&!(x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height))changedOutside++;
  }
  assert.ok(brighterPixels>1000,'Additive production lasers must be measurably brighter');
  assert.equal(darkerPixels,0,'Changing the destination factor to ONE must not darken any pixel');
  assert.equal(changedOutside,0,'Lasers remain clipped to the original playfield');
  const pixels={roi,brighterPixels,darkerPixels,changedOutside,totalRgbGain,maxChannelGain};
  writeFileSync(join(out,`report-${backend}.json`),JSON.stringify({format:'ts-stg-rushboss-laser-blend-v2',backend,
    passed:true,sourceHashes:before,binarySha256:hash(readFileSync(join(root,'build/Release/ts-stg.exe'))),
    originalExecutableRun:false,pixelEquivalentToOriginalClaimed:false,
    scope:'Production portrait application uses public driven TouhouLaserField owners for source ANM straight beams, one source mesh per whole curve, source origins, hit/graze and cancellation/debris. Draw-only body ANM B(499) control changes RGB destination factor ONE to ONE_MINUS_SRC_ALPHA and restores memory before snapshots. Simulation and source bank RNG/ANM state are identical. Actual original executable is not run.',
    frames,field:addState.field,cancellation:addState.cancellation,changedBodyBlendFactors:changedFactors,sourceLaserPriority:addState.laserPriority,identicalGeometryAndSimulation:true,pixels,
    pngSha256:Object.fromEntries(Object.entries(files).map(([blend,path])=>[blend,hash(readFileSync(path))])),
  },null,2)+'\n');
  console.log(`PASS ${backend}: public straight/curve/Bomb-debris geometry; ${brighterPixels} brighter pixels; no darker/outside pixels; all gameplay/ANM/RNG states identical`);
}
