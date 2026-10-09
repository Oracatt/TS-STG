// Regression evidence for real production visibility, not a self-hash check.
// Paired renders disable exactly one presentation component while every
// simulation input, RNG, actor and animation update remains unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/layers',backend='v8',baseline=false,chosen=null;
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i].split(',');
  else if(args[i]==='--baseline')baseline=true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend));
const out=resolve(root,output),scratch=join(root,'build/rushboss-layer-verification');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?sourceFiles(`${dir}/${e.name}`):e.name.endsWith('.js')?[`${dir}/${e.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([...sourceFiles('packages/thlib/dist'),...sourceFiles('games/rushboss/src')].map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=sourceHashes(),results=[];
const contrast=[];
// Independently specified colored geometry exposes occlusion and stale-capture
// errors without depending on artwork, font readability, or ANM pixel hashes.
// A controlled ten-pixel sample displacement must alter p13, leave p16
// untouched, retain p41 bullets over p27 backgrounds, and retain p81 titles.
for(const warp of [false,true]){
  const label=`contrast-${warp?'warped':'plain'}`,entry=join(scratch,`${backend}-${label}.js`),prefix=join(out,label);
  writeFileSync(entry,`import {DrawList} from '@ts-stg/thlib';
import {TouhouGameplayCompositor,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
const a=tsstg.createRenderTarget(960,720),b=tsstg.createRenderTarget(960,720);
const comp=new TouhouGameplayCompositor({renderTarget:a,compositeTarget:b});
let frame=0,pixels=null;
const expected=[
  ['opening',135,200,${warp?'[0,0,255,255]':'[255,0,0,255]'}],
  ['aura',225,300,[0,255,255,255]],['bullet',110,510,[0,255,0,255]],
  ['name',370,52,[255,0,255,255]],['strict-name-clip',626,70,[32,32,32,255]],
  ['name-field-edge',622,70,[255,0,255,255]],['camera-margin',30,600,[255,255,0,255]],
  ['screen-overlay',700,400,[0,255,0,255]],['HUD',700,100,[255,128,0,255]],
];
globalThis.__tsstg_game={update(){frame++;if(frame===2){
  const screen=tsstg.readTexturePixels();pixels=expected.map(([name,x,y,color])=>{
    const actual=Array.from(screen.pixels.subarray((y*screen.width+x)*4,(y*screen.width+x)*4+4));
    if(actual.some((value,i)=>value!==color[i]))throw new Error(name+': '+JSON.stringify(actual)+' != '+JSON.stringify(color));
    return{name,x,y,color:actual};
  });
}},render(){
  const queue=new TouhouRenderQueue(),draw=new DrawList();
  queue.enqueuePriority(5,d=>d.rect(0,0,960,720,0x202020ff));
  queue.enqueuePriority(13,d=>d.rect(120,180,20,60,0xff0000ff).rect(140,180,40,60,0x0000ffff));
  queue.enqueuePriority(16,d=>d.rect(210,280,30,60,0x00ffffff).rect(240,280,30,60,0xffff00ff));
  queue.enqueuePriority(27,d=>d.rect(80,480,100,80,0x800080ff).rect(350,40,250,40,0x000080ff));
  queue.enqueuePriority(41,d=>d.rect(100,500,20,20,0x00ff00ff).rect(24,590,20,20,0xffff00ff));
  queue.enqueuePriority(64,d=>d.rect(640,24,270,670,0xff8000ff));
  queue.enqueuePriority(81,d=>d.rect(360,48,80,12,0xff00ffff).rect(620,64,16,12,0xff00ffff));
  queue.enqueuePriority(98,d=>d.rect(695,395,20,20,0x00ff00ff));
  comp.draw(draw,queue,${warp?`{drawDistortion:(d,texture)=>d.sampler(texture,'point','clamp','clamp').spriteRegion(texture,130,180,60,60,150,210,60,60)}`:'{}'});
  return draw.commands;
},snapshot(){return{frame,pixels,checked:!!pixels};}};
`);
  const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,'--frames','2','--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
  writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
  if(run.error)throw run.error;assert.equal(run.status,0,`${label}: ${run.stderr}`);
  const state=JSON.parse(readFileSync(`${prefix}.json`));assert.equal(state.checked,true);
  contrast.push({label,...state,pngSha256:hash(readFileSync(`${prefix}.png`))});
  console.log(`PASS ${label}: ${state.pixels.length} independent GPU pixel assertions`);
}
const allScenes=[
  {name:'sunny-nonspell',boss:'sunny',phase:0,frames:300,remove:'bullets'},
  {name:'monstone-nonspell',boss:'monstone',phase:0,frames:300,remove:'bullets'},
  {name:'artia-nonspell',boss:'artia',phase:0,frames:300,remove:'bullets'},
  {name:'artia-nonspell6',boss:'artia',phase:10,frames:500,remove:'bullets'},
  {name:'sunny-spell-name',boss:'sunny',phase:1,frames:300,remove:'name'},
  {name:'monstone-spell-name',boss:'monstone',phase:7,frames:300,remove:'name'},
  {name:'artia-spell-name',boss:'artia',phase:11,frames:300,remove:'name'},
  {name:'spell-opening-layers',boss:'sunny',phase:1,frames:24,remove:'opening'},
];
const scenes=allScenes.filter(scene=>!chosen||chosen.includes(scene.name));
assert.ok(scenes.length,'No known scenes selected');
if(chosen)assert.ok(chosen.every(name=>allScenes.some(scene=>scene.name===name)),'Unknown scene requested');
function compareImages(a,b,roi){
  const left=decodeRgbaPng(readFileSync(a)),right=decodeRgbaPng(readFileSync(b));
  assert.equal(left.width,right.width);assert.equal(left.height,right.height);
  let changedPixels=0,changedOutside=0,maxChannelDifference=0;
  const counts=Array(4).fill(0);
  for(let y=0;y<left.height;y++)for(let x=0;x<left.width;x++){
    const p=(y*left.width+x)*4;
    let changed=false;
    for(let c=0;c<4;c++){const d=Math.abs(left.rgba[p+c]-right.rgba[p+c]);changed||=d!==0;maxChannelDifference=Math.max(maxChannelDifference,d);}
    if(!changed)continue;
    if(x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height){changedPixels++;counts[Math.min(3,Math.floor(4*(y-roi.y)/roi.height))]++;}
    else changedOutside++;
  }
  return{changedPixels,changedOutside,maxChannelDifference,verticalQuartiles:counts,roi};
}
for(const scene of scenes){
  const states={},paths={};
  for(const variant of ['full','masked']){
    const prefix=join(out,`${scene.name}-${variant}`),entry=join(scratch,`${backend}-${scene.name}-${variant}.js`);
    writeFileSync(entry,`import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {SaveStore} from '@ts-stg/thlib';
const game=createRushPortraitGame(tsstg,{startBoss:${JSON.stringify(scene.boss)},phaseIndex:${scene.phase},difficulty:3,mode:${JSON.stringify(scene.remove==='bullets'?'stage':'spell')},invincible:true,skipDialogue:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const masked=${variant==='masked'},component=${JSON.stringify(scene.remove)},seen=new Set(),markers=new Map();
let frame=0,lastMarkers=[],markerIndex=0;
function stamp(vm,label,unusedColor,rootScript=vm?.scriptId){
  if(!vm)return;for(const child of vm.children)stamp(child,label,unusedColor,rootScript);
  if(seen.has(vm))return;seen.add(vm);
  const color=0xe10000ff+(markerIndex++<<8);markers.set(color,{label,script:vm.scriptId,rootScript,layer:vm.effectiveLayer,anmPriority:vm.drawPriority});
  const original=vm.drawSelf.bind(vm);vm.drawSelf=(draw,view)=>{if(!draw.enqueueAnm)draw.point(-100,-100,color);return original(draw,view);};
}
function prepare(){
  const shared=game.battle.presentation.shared;
  for(const vm of shared.aura)stamp(vm,'aura',0x010100ff+vm.scriptId*0x100);
  for(const vm of shared.spell.effect?.children??[])stamp(vm,'opening',0x020200ff+vm.scriptId*0x100);
  stamp(shared.spell.info[1],'name',0x030300ff);
  const bullet=Array.from(game.battle.bulletVisuals.visuals.values()).find(v=>v.b.alive);
  if(bullet)stamp(bullet.animation,'bullet',0x040400ff);
  if(masked&&component==='bullets')game.battle.bulletVisuals.drawBullet=()=>true;
  if(masked&&component==='name'&&shared.spell.info[1])shared.spell.info[1].draw=()=>{};
  if(masked&&component==='opening'&&shared.spell.effect)shared.spell.effect.draw=()=>{};
}
globalThis.__tsstg_game={update(){game.update(0);frame++;},render(){
  prepare();const commands=game.render();let target=null;lastMarkers=[];
  for(let i=0;i<commands.length;i++){
    const c=commands[i];if(c[0]==='targetBegin')target=c[1];else if(c[0]==='targetEnd')target=null;
    else if(c[0]==='point'&&c[1]===-100&&markers.has(c[3]))lastMarkers.push({...markers.get(c[3]),target,command:i});
  }
  return commands;
},snapshot(){return{hostFrames:frame,markers:lastMarkers,surfaces:{a:game.graphics.background,b:game.graphics.compositeTarget},...game.snapshot()};}};
`);
    const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,'--frames',String(scene.frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
    if(run.error)throw run.error;assert.equal(run.status,0,`${scene.name}/${variant}: ${run.stderr}`);
    states[variant]=JSON.parse(readFileSync(`${prefix}.json`));paths[variant]=`${prefix}.png`;
  }
  assert.deepEqual(states.full.application.battle,states.masked.application.battle,`${scene.name}: presentation mask changed simulation`);
  const roi=scene.remove==='name'?{x:48,y:24,width:576,height:50}:{x:48,y:24,width:576,height:672};
  const pixels=compareImages(paths.full,paths.masked,roi);
  const visible=pixels.changedPixels>(scene.remove==='name'?100:500);
  const markers=states.full.markers;
  const surfaces=states.full.surfaces;
  if(!baseline){
    const aura=markers.filter(m=>m.label==='aura');
    assert.deepEqual([...new Set(aura.map(m=>m.rootScript))].sort((a,b)=>a-b),[99,108],`${scene.name}: actual source aura submissions, including render children`);
    for(const marker of aura){
      if(marker.script===106)assert.deepEqual([marker.anmPriority,marker.target],[10,surfaces.a],'Source aura particles enter the first capture');
      else{assert.ok([99,105,107].includes(marker.script));assert.deepEqual([marker.anmPriority,marker.target],[16,surfaces.b],'Source permanent circles remain after the first composition');}
    }
    if(scene.remove==='name'){
      const names=markers.filter(m=>m.label==='name');assert.equal(names.length,1);
      assert.deepEqual(names.map(m=>[m.script,m.anmPriority,m.target]),[[22,81,null]],`${scene.name}: source title must follow final composition`);
    }
    if(scene.remove==='bullets'){
      const bullets=markers.filter(m=>m.label==='bullet');assert.ok(bullets.length>0);
      assert.ok(bullets.every(m=>m.target===surfaces.a),`${scene.name}: embedded bullet must draw into p25..46 target`);
    }
    if(scene.remove==='opening'){
      const opening=markers.filter(m=>m.label==='opening');assert.equal(opening.length,2);
      assert.deepEqual(opening.map(m=>[m.script,m.anmPriority,m.target]),[[4,13,surfaces.a],[5,13,surfaces.a]],'Source spell-opening circles must be part of the pre-distortion capture');
      assert.ok(Math.max(...opening.map(m=>m.command))<Math.min(...aura.filter(m=>m.anmPriority===16).map(m=>m.command)),'Opening capture precedes source p16 aura');
    }
  }
  const result={scene:scene.name,frames:scene.frames,component:scene.remove,pixels,visible,simulationIdentical:true,spawned:states.full.application.battle.statistics.spawned,markers,surfaces,pngSha256:{full:hash(readFileSync(paths.full)),masked:hash(readFileSync(paths.masked))}};
  results.push(result);console.log(`${visible?'PASS':'FAIL'} ${scene.name}: ${pixels.changedPixels} affected ROI pixels`);
}
assert.deepEqual(sourceHashes(),before,'Production source changed during verification');
writeFileSync(join(out,'report.json'),JSON.stringify({format:'ts-stg-rushboss-layer-regression-v1',backend,baseline,sourceHashes:before,scope:'Native GPU independent contrasting-color pass oracle plus paired production renders with selected presentation disabled; exact simulation snapshot comparison. This does not run the original executable.',originalExecutableRun:false,contrast,passed:results.every(r=>r.visible),results},null,2)+'\n');
if(!baseline)assert.ok(results.every(r=>r.visible),'A source component remains visually occluded; see report.json');
