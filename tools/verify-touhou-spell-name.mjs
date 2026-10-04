// Native GPU regression for the original same-layer spell-name registration.
// The counterfactual changes only the title VM's renderOrder. It retains both
// plates, the complete name bitmap, source animation, and battle simulation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',output='reports/rushboss/spell-name-order',chosen=null;
for(let i=0;i<args.length;i++){
  if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i].split(',');
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend),'Supported backends: v8, quickjs');
const out=resolve(root,output),scratch=join(root,'build/spell-name-order');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?jsFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([...jsFiles('packages/thlib/src'),...jsFiles('games/rushboss/src')].map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=sourceHashes(),results=[];

// Markers are offscreen and record actual flush calls, not enqueue order.
// An invisible VM must not produce a marker. The marker is inserted immediately
// before commands emitted by the unmodified production drawSelf implementation.
const markerCode=`
const tracked=new WeakSet(),markerData=new Map();let nextMarker=0,lastMarkers=[];
function stamp(vm,label){
  if(!vm||tracked.has(vm))return;tracked.add(vm);
  const color=(0xe10000ff+(nextMarker++<<8))>>>0,original=vm.drawSelf.bind(vm);
  vm.drawSelf=(draw,view)=>{
    if(draw.enqueueAnm)return original(draw,view);
    const start=draw.commands.length,result=original(draw,view);
    if(draw.commands.length>start){
      markerData.set(color,{label,bank:vm.bank.data.name,script:vm.scriptId,layer:vm.effectiveLayer,
        priority:vm.drawPriority,renderOrder:vm.renderOrder,renderSecondary:!!vm.renderSecondary,
        vertices:anmSpriteVertices(vm,view).map(vertex=>vertex.slice(0,2)),state:vm.snapshot()});
      draw.commands.splice(start,0,['point',-100,-100,color]);
    }
    return result;
  };
}
function extractMarkers(commands){
  let target=null,clip=null;lastMarkers=[];
  for(let i=0;i<commands.length;i++){
    const command=commands[i];
    if(command[0]==='targetBegin')target=command[1];else if(command[0]==='targetEnd')target=null;
    else if(command[0]==='scissor')clip=command.slice(1);else if(command[0]==='scissorEnd')clip=null;
    else if(command[0]==='point'&&command[1]===-100&&markerData.has(command[3]))
      lastMarkers.push({...markerData.get(command[3]),target,clip,command:i});
  }
}
function prepareInfo(info,oldOrder){
  const [plate,title,record]=info;
  if(oldOrder&&plate&&title)title.renderOrder=plate.renderOrder-1;
  stamp(plate,'plate');stamp(title,'name');stamp(record,'record');
}
function registrations(info){return info.map((vm,index)=>({label:['plate','name','record'][index],
  bank:vm.bank.data.name,script:vm.scriptId,layer:vm.effectiveLayer,priority:vm.drawPriority,
  renderOrder:vm.renderOrder,alpha:vm.alpha,visible:vm.visible,
  eligible:!!(vm.alive&&vm.visible&&((vm.U(0x490)|vm.U(0x494))&0xff000000)),
  vertices:anmSpriteVertices(vm,{x:336,y:24,scale:1,screenScale:1.5}).map(vertex=>vertex.slice(0,2))}));}
`;

function runEntry(label,source,frames){
  const prefix=join(out,label),entry=join(scratch,`${backend}-${label}.js`);
  writeFileSync(entry,source);
  const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,'--frames',String(frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));
  if(run.error)throw run.error;
  assert.equal(run.status,0,`${label}: ${run.stderr}`);
  return{state:JSON.parse(readFileSync(`${prefix}.json`)),png:`${prefix}.png`,prefix};
}

const expectedRoots=[['plate','ascii_960',0],['name','text',22],['record','ascii_960',1]];
function assertMarkers(markers,oldOrder,label,roots){
  const expected=oldOrder?[expectedRoots[1],expectedRoots[0],expectedRoots[2]]:expectedRoots;
  assert.equal(roots.length,3,`${label}: all three info roots exist`);
  assert.deepEqual(roots.map(m=>[m.label,m.bank,m.script]),expectedRoots,`${label}: actual source info roots`);
  assert.ok(roots.every(m=>m.layer===32&&m.priority===81),`${label}: all registered roots have same source layer32 / priority81`);
  assert.deepEqual(roots.slice().sort((a,b)=>a.renderOrder-b.renderOrder).map(m=>[m.label,m.bank,m.script]),expected,`${label}: source same-priority registration order`);
  const submitted=expected.filter(([name])=>roots.find(m=>m.label===name).eligible);
  assert.deepEqual(markers.map(m=>[m.label,m.bank,m.script]),submitted,`${label}: actual flush submits eligible roots in registration order`);
  assert.ok(markers.every(m=>m.layer===32&&m.priority===81&&m.target===null),`${label}: all roots stay on source layer32 / priority81 / backbuffer`);
  assert.ok(markers.every(m=>JSON.stringify(m.clip)===JSON.stringify([48,24,576,672])),`${label}: original name viewport remains active`);
  assert.ok(markers.every((m,i)=>i===0||markers[i-1].command<m.command),`${label}: increasing actual command indices`);
  assert.ok(markers.every((m,i)=>i===0||markers[i-1].renderOrder<m.renderOrder),`${label}: actual queue follows registration order`);
}
function bounds(vertices){return{x:Math.min(...vertices.map(v=>v[0])),y:Math.min(...vertices.map(v=>v[1])),
  right:Math.max(...vertices.map(v=>v[0])),bottom:Math.max(...vertices.map(v=>v[1]))};}
function activePlateOverlap(roots){const plate=roots.find(m=>m.label==='plate'),name=roots.find(m=>m.label==='name');
  if(!plate.eligible||plate.alpha===0||!name.eligible||name.alpha===0)return false;
  const a=bounds(plate.vertices),b=bounds(name.vertices);return Math.max(a.x,b.x,48)<Math.min(a.right,b.right,624)&&
    Math.max(a.y,b.y,24)<Math.min(a.bottom,b.bottom,696);}
function roiForName(markers,width,height){
  const vertices=markers.find(m=>m.label==='name').vertices;
  const x=Math.max(48,Math.floor(Math.min(...vertices.map(v=>v[0])))),y=Math.max(24,Math.floor(Math.min(...vertices.map(v=>v[1]))));
  const right=Math.min(width,624,Math.ceil(Math.max(...vertices.map(v=>v[0])))),bottom=Math.min(height,696,Math.ceil(Math.max(...vertices.map(v=>v[1]))));
  assert.ok(right>x&&bottom>y,'The actual animated name intersects the playfield');
  return{x,y,width:right-x,height:bottom-y};
}
const inside=(x,y,roi)=>x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height;
function comparePng(fixedPath,oldPath,markers){
  const fixed=decodeRgbaPng(readFileSync(fixedPath)),old=decodeRgbaPng(readFileSync(oldPath));
  assert.equal(fixed.width,old.width);assert.equal(fixed.height,old.height);
  const roi=roiForName(markers,fixed.width,fixed.height);
  let changed=0,outside=0,brighter=0,darker=0,signedRgb=0,positiveRgb=0,negativeRgb=0,maxDifference=0;
  let fixedRgb=0,oldRgb=0,fixedGreen=0,oldGreen=0,greenBrighter=0;
  let minX=fixed.width,minY=fixed.height,maxX=0,maxY=0;
  for(let y=0;y<fixed.height;y++)for(let x=0;x<fixed.width;x++){
    const offset=(y*fixed.width+x)*4;
    const difference=Array.from({length:4},(_,c)=>fixed.rgba[offset+c]-old.rgba[offset+c]);
    if(inside(x,y,roi)){
      const f=fixed.rgba[offset]+fixed.rgba[offset+1]+fixed.rgba[offset+2],o=old.rgba[offset]+old.rgba[offset+1]+old.rgba[offset+2];
      fixedRgb+=f;oldRgb+=o;fixedGreen=Math.max(fixedGreen,fixed.rgba[offset+1]);oldGreen=Math.max(oldGreen,old.rgba[offset+1]);
      if(difference[1]>2)greenBrighter++;
      if(difference.some(d=>d!==0)){
        changed++;const delta=f-o;signedRgb+=delta;positiveRgb+=Math.max(0,delta);negativeRgb+=Math.max(0,-delta);
        if(delta>2)brighter++;if(delta<-2)darker++;
        for(const d of difference)maxDifference=Math.max(maxDifference,Math.abs(d));
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
    }else if(difference.some(d=>d!==0))outside++;
  }
  return{fixed,old,pixels:{roi,changedPixels:changed,changedOutsideNameQuad:outside,brighterPixels:brighter,darkerPixels:darker,
    signedRgbDifference:signedRgb,positiveRgbDifference:positiveRgb,negativeRgbDifference:negativeRgb,maxChannelDifference:maxDifference,
    meanRgbIntensity:{fixed:fixedRgb/(roi.width*roi.height*3),oldOrder:oldRgb/(roi.width*roi.height*3)},
    maxGreen:{fixed:fixedGreen,oldOrder:oldGreen},greenBrighterPixels:greenBrighter,
    differenceBounds:changed?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null}};
}

// Minimal PNG writer is only for evidence crops/differences, never game assets.
const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4);length.writeUInt32BE(data.length);let crc=0xffffffff;
  for(const byte of Buffer.concat([name,data]))crc=crcTable[(crc^byte)&255]^(crc>>>8);
  const tail=Buffer.alloc(4);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,name,data,tail]);}
function savePng(path,width,height,rgba){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)rows.set(rgba.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));}
function writeCrops(prefix,images){
  const {fixed,old,pixels:{roi}}=images,pair=new Uint8Array(roi.width*2*roi.height*4),diff=new Uint8Array(roi.width*roi.height*4);
  for(let y=0;y<roi.height;y++)for(let x=0;x<roi.width;x++){
    const source=((roi.y+y)*fixed.width+roi.x+x)*4,left=(y*roi.width*2+x)*4,right=left+roi.width*4,to=(y*roi.width+x)*4;
    pair.set(fixed.rgba.subarray(source,source+4),left);pair.set(old.rgba.subarray(source,source+4),right);
    for(let c=0;c<3;c++)diff[to+c]=Math.min(255,Math.abs(fixed.rgba[source+c]-old.rgba[source+c])*3);diff[to+3]=255;
  }
  savePng(`${prefix}-name-pair.png`,roi.width*2,roi.height,pair);savePng(`${prefix}-name-difference.png`,roi.width,roi.height,diff);
}

const allScenes=[
  {name:'sunny-24',boss:'sunny',phase:1,frames:24},
  {name:'sunny-60',boss:'sunny',phase:1,frames:60},
  {name:'sunny-120',boss:'sunny',phase:1,frames:120},
  {name:'sunny-300',boss:'sunny',phase:1,frames:300},
  {name:'monstone-300',boss:'monstone',phase:7,frames:300},
  {name:'artia-300',boss:'artia',phase:11,frames:300},
];
const scenes=allScenes.filter(scene=>!chosen||chosen.includes(scene.name));
assert.ok(scenes.length,'No known scenes selected');
if(chosen)assert.ok(chosen.every(name=>allScenes.some(scene=>scene.name===name)),'Unknown scene requested');
for(const scene of scenes){
  const renders={};
  for(const variant of ['fixed','old-order'])renders[variant]=runEntry(`${scene.name}-${variant}`,`
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {SaveStore} from '@ts-stg/thlib';
import {anmSpriteVertices} from '../../packages/thlib/src/touhou/anm-render.js';
const game=createRushPortraitGame(tsstg,{startBoss:${JSON.stringify(scene.boss)},phaseIndex:${scene.phase},difficulty:3,
  mode:'spell',invincible:true,skipDialogue:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
${markerCode}
let frame=0;
globalThis.__tsstg_game={update(){game.update(0);frame++;},render(){
  prepareInfo(game.battle.presentation.shared.spell.info,${variant==='old-order'});
  const commands=game.render();extractMarkers(commands);return commands;
},snapshot(){return{hostFrames:frame,markers:lastMarkers,production:game.snapshot(),
  info:game.battle.presentation.shared.spell.info.map(vm=>vm?.snapshot()??null),
  registrations:registrations(game.battle.presentation.shared.spell.info),
  cardName:game.battle.presentation.shared.spell.name};}};
`,scene.frames);
  const fixed=renders.fixed,old=renders['old-order'];
  assert.deepEqual(fixed.state.production,old.state.production,`${scene.name}: complete production snapshot identical`);
  assert.deepEqual(fixed.state.info,old.state.info,`${scene.name}: title/plate/record state identical`);
  assert.equal(fixed.state.cardName,old.state.cardName);assert.ok(fixed.state.cardName);
  assertMarkers(fixed.state.markers,false,`${scene.name}/fixed`,fixed.state.registrations);
  assertMarkers(old.state.markers,true,`${scene.name}/old-order`,old.state.registrations);
  const images=comparePng(fixed.png,old.png,fixed.state.markers),pixels=images.pixels;
  writeCrops(join(out,scene.name),images);
  const plateOverlap=activePlateOverlap(fixed.state.registrations);
  if(plateOverlap){
    assert.ok(pixels.changedPixels>100,`${scene.name}: changing only registration order must expose plate occlusion`);
    assert.ok(pixels.brighterPixels>100&&pixels.signedRgbDifference>1000,`${scene.name}: glyph region must be brighter with source order`);
  }else assert.equal(pixels.changedPixels,0,`${scene.name}: source timeline has no active plate/name overlap`);
  assert.equal(pixels.changedOutsideNameQuad,0,`${scene.name}: only pixels inside the unchanged title quad may differ`);
  results.push({...scene,cardName:fixed.state.cardName,simulationIdentical:true,allInfoStatesIdentical:true,activePlateOverlap:plateOverlap,pixels,
    registrations:{fixed:fixed.state.registrations,oldOrder:old.state.registrations},
    markers:{fixed:fixed.state.markers,oldOrder:old.state.markers},
    pngSha256:{fixed:hash(readFileSync(fixed.png)),oldOrder:hash(readFileSync(old.png))}});
  console.log(`PASS ${scene.name}: ${pixels.changedPixels} changed name pixels; ${pixels.brighterPixels} brighter; RGB +${pixels.signedRgbDifference}`);
}

// A real-bank contrasting texel oracle isolates the occlusion from stage
// backgrounds, bullets and spell skins. Its name atlas region is an explicitly
// controlled opaque green swatch; the original plate pixels, ANM geometry and
// blend are untouched. Production scenes above always use their full real name.
const oracle={};
for(const variant of ['fixed','old-order'])oracle[variant]=runEntry(`bank-oracle-${variant}`,`
import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
import {anmSpriteVertices} from '../../packages/thlib/src/touhou/anm-render.js';
const resources=createTouhouResources(tsstg),plate=resources.banks.ascii_960.create(0),
  title=resources.createNameAnimation('Order ABC',{color:0x00ff00,shadowColor:0xff000000}),
  record=resources.banks.ascii_960.create(1),info=[plate,title,record];
for(let i=0;i<300;i++)for(const vm of info)vm.update();
const glyphSprite=title.bank.data.sprites[title.spriteIndex],contrast=new Uint8Array(glyphSprite.width*glyphSprite.height*4);
for(let p=0;p<contrast.length;p+=4){contrast[p+1]=255;contrast[p+3]=255;}
tsstg.updateTextureRegion(title.bank.texture(glyphSprite.entry),glyphSprite.x,glyphSprite.y,
  glyphSprite.width,glyphSprite.height,contrast);
// Choose the oracle mask from source texture bytes before any screenshot is
// produced. Erode swatch interiors and original plate coverage so bilinear
// edges cannot affect the prediction: correct order is green, old must dim it.
const oracleView={x:336,y:24,scale:1,screenScale:1.5};
function sourceFor(vm){const sprite=vm.bank.data.sprites[vm.spriteIndex];return{sprite,
  image:tsstg.readTexturePixels(vm.bank.texture(sprite.entry)),vertices:anmSpriteVertices(vm,oracleView)};}
const glyphSource=sourceFor(title),plateSource=sourceFor(plate),glyphSamples=[];
function sourcePoint(source,x,y){const [tl,tr,bl]=source.vertices;return{
  x:Math.floor(source.sprite.x+(x+.5-tl[0])/(tr[0]-tl[0])*source.sprite.width),
  y:Math.floor(source.sprite.y+(y+.5-tl[1])/(bl[1]-tl[1])*source.sprite.height)};}
function eroded(source,point,accept){
  for(let y=point.y-2;y<=point.y+2;y++)for(let x=point.x-2;x<=point.x+2;x++){
    if(x<0||y<0||x>=source.image.width||y>=source.image.height)return false;
    if(!accept(source.image.pixels.subarray((y*source.image.width+x)*4,(y*source.image.width+x)*4+4)))return false;
  }return true;
}
for(let y=24;y<54;y++)for(let x=48;x<624;x++){
  const glyph=sourcePoint(glyphSource,x,y),under=sourcePoint(plateSource,x,y);
  if(eroded(glyphSource,glyph,c=>c[0]===0&&c[1]===255&&c[2]===0&&c[3]===255)&&
    eroded(plateSource,under,c=>c[1]<=128&&c[3]>=128))glyphSamples.push({x,y,glyph,plate:under});
}
${markerCode}
globalThis.__tsstg_game={update(){},render(){
  prepareInfo(info,${variant==='old-order'});const draw=new DrawList(),queue=new TouhouRenderQueue();
  draw.clear(0x101010ff).scissor(48,24,576,672);
  for(const vm of info)vm.draw(queue,oracleView);
  queue.flush(draw);draw.scissorEnd();extractMarkers(draw.commands);return draw.commands;
},snapshot(){return{markers:lastMarkers,info:info.map(vm=>vm.snapshot()),registrations:registrations(info),color:0x00ff00,glyphSamples,
  plateBlendMode:plate.B(0x499)};}};
`,2);
assert.deepEqual(oracle.fixed.state.info,oracle['old-order'].state.info,'Real-bank oracle animations unchanged');
assert.deepEqual(oracle.fixed.state.glyphSamples,oracle['old-order'].state.glyphSamples,'Source-derived glyph mask unchanged');
assertMarkers(oracle.fixed.state.markers,false,'bank-oracle/fixed',oracle.fixed.state.registrations);
assertMarkers(oracle['old-order'].state.markers,true,'bank-oracle/old-order',oracle['old-order'].state.registrations);
const oracleImages=comparePng(oracle.fixed.png,oracle['old-order'].png,oracle.fixed.state.markers),oraclePixels=oracleImages.pixels;
writeCrops(join(out,'bank-oracle'),oracleImages);
assert.equal(oracle.fixed.state.plateBlendMode,0,'Real source plate uses alpha compositing');
const glyphSamples=oracle.fixed.state.glyphSamples;
assert.ok(glyphSamples.length>=3,'Independent source textures contain covered opaque contrast texels');
const pixelAt=(image,x,y)=>Array.from(image.rgba.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));
const assertions=glyphSamples.map(sample=>({...sample,fixed:pixelAt(oracleImages.fixed,sample.x,sample.y),
  oldOrder:pixelAt(oracleImages.old,sample.x,sample.y),expectedFixedRgb:[0,255,0],maximumOldGreen:192}));
for(const sample of assertions){
  assert.deepEqual(sample.fixed.slice(0,3),sample.expectedFixedRgb,`Original registration retains opaque contrast at ${sample.x},${sample.y}`);
  assert.ok(sample.oldOrder[1]<=sample.maximumOldGreen,`Old registration dims independently source-selected contrast at ${sample.x},${sample.y}`);
}
assert.equal(oraclePixels.changedOutsideNameQuad,0,'Oracle differences are inside the unchanged title quad');
assert.deepEqual(sourceHashes(),before,'Production source changed during GPU verification');
const report={format:'ts-stg-touhou-spell-name-order-v1',backend,sourceHashes:before,
  scope:'Actual production paired native GPU renders: only title.renderOrder changes. All plates, name pixels, animations and complete production snapshots remain identical. Independent real-bank opaque green atlas-region oracle, with sample positions selected from original plate bytes before rendering.',
  originalExecutableRun:false,pixelEquivalentToOriginalClaimed:false,passed:true,results,
  oracle:{pixels:oraclePixels,statesIdentical:true,sourceTextureContrastAssertions:assertions,
    markers:{fixed:oracle.fixed.state.markers,oldOrder:oracle['old-order'].state.markers}}};
writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS real-bank contrasting texel oracle: ${assertions.length} independently source-selected GPU pixel assertions`);
console.log(`PASS ${results.length} paired production scenes (${backend}); source hashes stable`);
