// Private Demo acceptance through the production application and native GPU.
// The controls remove only the business portrait drawing method after creation.
// This checks composition/state isolation, not original-EXE pixel equivalence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Keys,SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../games/rushboss/src/portrait-application.js';
import {RUSH_BOSS_PORTRAIT_ASSETS} from '../games/rushboss/src/boss-portraits.js';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let output='reports/rushboss/artwork-portraits',executable=process.env.TSSTG_BINARY??'build/Release/ts-stg.exe';
let locateOnly=false,chosen=null,normalOnly=false,kind=null,character=0,speaker='right';
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--exe'&&args[i+1])executable=args[++i];
  else if(args[i]==='--pair'&&args[i+1])chosen=args[++i];
  else if(args[i]==='--locate-only')locateOnly=true;
  else if(args[i]==='--normal-only')normalOnly=true;
  else if(args[i]==='--kind'&&args[i+1])kind=args[++i];
  else if(args[i]==='--character'&&args[i+1])character=Number(args[++i]);
  else if(args[i]==='--speaker'&&args[i+1])speaker=args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
assert.ok(character===0||character===1,'--character must be 0 (Reimu) or 1 (Marisa)');
assert.ok(kind===null||kind==='dialogue'||kind==='cutin','--kind must be dialogue or cutin');
assert.ok(speaker==='left'||speaker==='right','--speaker must be left or right after the Boss portrait appears');
const out=resolve(root,output),fixtures=join(root,'build/rushboss-artwork-portraits'),exe=resolve(root,executable);
mkdirSync(out,{recursive:true});mkdirSync(fixtures,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashFile=file=>hash(readFileSync(file));
const sources=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?sources(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const files=[...sources('packages/thlib/src'),...sources('games/rushboss/src'),
  'tools/verify-rushboss-artwork-portraits.mjs'].sort();
const codeHashes=()=>Object.fromEntries(files.map(file=>[file,hashFile(join(root,file))]));
const before=codeHashes(),binarySha256=existsSync(exe)?hashFile(exe):null;
const stable=()=>{
  assert.deepEqual(codeHashes(),before,'Production source changed during portrait acceptance');
  if(binarySha256!==null)assert.equal(hashFile(exe),binarySha256,'Native binary changed during portrait acceptance');
};

// This adapter reads the full production packs and runs the real application,
// dialogue, ANMs and private drawing paths. Platform services only are mocked;
// it locates fixed input/frame schedules before the native GPU run.
function locatorHost(){
  let next=0;const handle=()=>++next,noop=()=>{};
  return {readText:file=>readFileSync(resolve(root,file),'utf8'),
    loadTexture:handle,createTexture:handle,createRenderTarget:handle,createShader:handle,
    loadMusic:handle,loadSound:handle,unloadTexture:noop,unloadShader:noop,unloadMusic:noop,unloadSound:noop,
    playMusic:noop,stopMusic:noop,setMusicLoop:noop,seekMusic:noop,playSound:noop,stopSound:noop,
    hasSystemFont:()=>false,encodeText:text=>new Uint8Array(Array.from(text).reduce((n,ch)=>n+(ch.codePointAt(0)>127?2:1),0)),
    rasterizeBitmapText:(_text,options)=>({width:options.width,height:options.height,
      pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)}),updateTextureRegion:noop};
}
const options=boss=>({startBoss:boss,character,difficulty:3,mode:'stage',invincible:true});
const locators=[];
for(const boss of ['sunny','monstone','artia']){
  const game=createRushPortraitGame(locatorHost(),{...options(boss),store:new SaveStore()});
  let focusFrames=0;
  const reached=()=>game.application.game.dialogue?.current?.portraits?.right?.present&&game.application.game.dialogue.current.speaker===speaker;
  while(!reached()&&focusFrames<2000){
    game.update(Keys.FOCUS);game.render();focusFrames++;
  }
  const dialogue=game.application.game.dialogue;
  assert.ok(reached(),`${boss}: no ${speaker}-speaking step after the right portrait event`);
  const firstRightIndex=dialogue.index;
  for(let frame=0;frame<40;frame++){game.update(0);game.render();}
  assert.equal(game.application.game.dialogue?.index,firstRightIndex,`${boss}: dialogue advanced while settling portrait`);
  const settled=game.application.game.dialogue.snapshot();
  assert.equal(settled.active,true);
  locators.push({boss,focusFrames,settleFrames:40,frames:focusFrames+40,
    dialogueIndex:settled.index,dialogueAge:settled.age,speaker:settled.speaker,text:settled.text,
    emotion:game.application.game.dialogue.current.portraits.right.emotion,
    rightPortrait:game.application.game.dialogue.current.portraits.right});
  game.destroy();
}
stable();
writeFileSync(join(out,'dialogue-frame-locations.json'),JSON.stringify({
  scope:'Actual production application and source packs; mock platform services, no GPU',locators},null,2)+'\n');
console.log(`LOCATED ${locators.map(row=>`${row.boss}=${row.focusFrames}+40`).join(', ')}`);
if(locateOnly)process.exit(0);
assert.ok(existsSync(exe),'Build the native TS-STG host before GPU acceptance');

const scenes=[...locators.map(row=>({name:`${row.boss}-dialogue`,kind:'dialogue',boss:row.boss,
  frames:row.frames,focusFrames:row.focusFrames,options:options(row.boss),locator:row})),
  ...['sunny','monstone','artia'].map(boss=>({name:`${boss}-cutin`,kind:'cutin',boss,frames:24,focusFrames:0,
    options:{...options(boss),phaseIndex:1,mode:'spell',skipDialogue:true}}))]
  .filter(scene=>(!chosen||chosen===scene.name)&&(!kind||kind===scene.kind));
assert.ok(scenes.length,'Unknown pair');
const results=[];

async function nativeCapture(scene,variant){
  stable();
  const entry=join(fixtures,`${scene.name}-${variant}.js`),prefix=join(out,`${scene.name}-${variant}`);
  writeFileSync(entry,`// Generated portrait-only control; production code is never changed.
import {Keys,SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const game=createRushPortraitGame(tsstg,{...${JSON.stringify(scene.options)},store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
${variant==='without-portrait'?'game.graphics.drawBossPortrait=()=>{};':''}
let frame=0,renderCount=0,portraitCalls=[];
const original=game.graphics.drawBossPortrait.bind(game.graphics);
game.graphics.drawBossPortrait=(draw,name,options)=>{
  portraitCalls.push({name,x:options.x,y:options.y,width:options.width,height:options.height,color:options.color,view:options.view,clip:options.clip});
  return original(draw,name,options);
};
globalThis.__tsstg_game={update(){game.update(frame<${scene.focusFrames}?Keys.FOCUS:0);frame++;},
 render(){portraitCalls=[];renderCount++;return game.render();},postFrame(now){return game.postFrame(now);},
 snapshot(){return{hostFrames:frame,renderCount,portraitCalls,
  // The entire session is compared, without excluding any gameplay fields.
  session:game.application.game.snapshot(),application:game.application.snapshot(),
  state:game.snapshot(),sharedPresentation:game.battle.presentation.snapshot()};}};
`);
  const child=spawn(exe,[relative(root,entry).replaceAll('\\','/'),'--root',root,'--backend','v8',
    '--profile-warmup','0','--frames',String(scene.frames),'--benchmark','--snapshot',`${prefix}.json`,
    '--screenshot',`${prefix}.png`,'--profile',`${prefix}-profile.json`],
    {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);
  const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
  let status;try{status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
  finally{clearTimeout(timer);}
  writeFileSync(`${prefix}-output.txt`,stdout+stderr);
  assert.equal(timedOut,false,`${scene.name}/${variant}: native capture exceeded three minutes`);
  assert.equal(status,0,`${scene.name}/${variant}: ${stdout}\n${stderr}`);
  stable();
  const snapshot=JSON.parse(readFileSync(`${prefix}.json`,'utf8')),
    profile=JSON.parse(readFileSync(`${prefix}-profile.json`,'utf8'));
  assert.equal(snapshot.hostFrames,scene.frames);assert.equal(snapshot.renderCount,scene.frames);
  assert.equal(profile.headless,false);assert.equal(profile.renderFrames,scene.frames);
  assert.equal(profile.simulationFrames,scene.frames);
  assert.equal(snapshot.state.screen,'battle');assert.equal(snapshot.session.bossIndex,['sunny','monstone','artia'].indexOf(scene.boss));
  assert.deepEqual(snapshot.state.graphics.viewport,{x:48,y:24,width:576,height:672});
  if(scene.kind==='dialogue'){
    assert.equal(snapshot.session.state,'before');assert.equal(snapshot.session.battle.combatStarted,false);
    assert.equal(snapshot.session.dialogue.active,true);assert.equal(snapshot.session.dialogue.index,scene.locator.dialogueIndex);
    assert.equal(snapshot.session.dialogue.age,scene.locator.dialogueAge);
  }else{
    assert.equal(snapshot.session.state,'combat');assert.equal(snapshot.sharedPresentation.shared.spell.age,24);
    assert.ok(snapshot.sharedPresentation.shared.openingScripts.includes(13));
    assert.ok(snapshot.sharedPresentation.shared.effectScripts.some(id=>id===4||id===5));
    assert.deepEqual(snapshot.sharedPresentation.shared.auraScripts,[99,108]);
    assert.equal(snapshot.sharedPresentation.shared.distortion.columns,17);
  }
  const expected=scene.kind==='cutin'?[RUSH_BOSS_PORTRAIT_ASSETS[scene.boss].cutin]:
    scene.boss==='sunny'?['src_sunnyface_bs',RUSH_BOSS_PORTRAIT_ASSETS.sunny.expressions[scene.locator.emotion]].filter(Boolean):
      [scene.boss==='monstone'?'src_monstone_ct':RUSH_BOSS_PORTRAIT_ASSETS.artia.expressions[scene.locator.emotion]??RUSH_BOSS_PORTRAIT_ASSETS.artia.body];
  assert.deepEqual(snapshot.portraitCalls.map(call=>call.name),expected,`${scene.name}: actual source portrait selection`);
  if(scene.kind==='dialogue')for(const call of snapshot.portraitCalls){
    const left=scene.locator.speaker==='right'?248:280,top=scene.locator.speaker==='right'?120:128;
    assert.deepEqual(call.view,{x:0,y:0,scale:1,screenScale:1.5},'Portrait uses source full-screen coordinate system');
    assert.equal(call.clip,false,'Source UI portrait is not cropped to the playfield');
    assert.ok(Math.abs(call.x-call.width/2-left)<.001);assert.ok(Math.abs(call.y-call.height/2-top)<.001);
    assert.ok(call.width<=220.001&&call.height<=360.001,'Private skin stays in the source right body frame');
  }
  const loaded=snapshot.state.graphics.rushArtwork;
  if(variant==='normal')for(const name of expected)assert.ok(loaded.includes(name),`${scene.name}: actual portrait texture not loaded`);
  else for(const name of expected)assert.ok(!loaded.includes(name),`${scene.name}: control unexpectedly loaded a portrait image`);
  return {snapshot,image:`${prefix}.png`,snapshotFile:`${prefix}.json`,profileFile:`${prefix}-profile.json`,
    profile,pngSha256:hashFile(`${prefix}.png`)};
}

function comparePixels(normal,control,region,kind){
  const a=decodeRgbaPng(readFileSync(normal)),b=decodeRgbaPng(readFileSync(control));
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  assert.equal(a.width,960);assert.equal(a.height,720);
  const stats={region,regionPixels:region.width*region.height,changedPixels:0,obviousPixels:0,
    maximumRgbDifference:0,sumRgbDifference:0,changedOutsideRegion:0,changedOutsideViewport:0,bounds:null};
  let minX=a.width,minY=a.height,maxX=-1,maxY=-1;
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
    const offset=(y*a.width+x)*4,inside=x>=region.x&&x<region.x+region.width&&y>=region.y&&y<region.y+region.height;
    const delta=Math.max(...[0,1,2].map(channel=>Math.abs(a.rgba[offset+channel]-b.rgba[offset+channel])));
    if(!delta)continue;
    if(x<48||x>=624||y<24||y>=696)stats.changedOutsideViewport++;
    if(!inside){stats.changedOutsideRegion++;continue;}
    stats.changedPixels++;if(delta>=16)stats.obviousPixels++;
    stats.maximumRgbDifference=Math.max(stats.maximumRgbDifference,delta);
    stats.sumRgbDifference+=delta;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(maxX>=0)stats.bounds={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1};
  assert.ok(stats.obviousPixels>1000,`Portrait must visibly affect ${region.width}x${region.height} region: ${stats.obviousPixels} obvious pixels`);
  assert.equal(stats.changedOutsideRegion,0,'Portrait changes must stay inside its independent source frame');
  if(kind==='cutin')assert.equal(stats.changedOutsideViewport,0,'Spell cut-in retains game viewport clipping');
  return stats;
}

const artifact=result=>({image:relative(root,result.image).replaceAll('\\','/'),snapshot:relative(root,result.snapshotFile).replaceAll('\\','/'),
  profile:relative(root,result.profileFile).replaceAll('\\','/'),pngSha256:result.pngSha256,commandCount:result.profile.metrics.commandCount});

for(const scene of scenes){
  // Serial GPU work: each native process exits before the next starts.
  const normal=await nativeCapture(scene,'normal');
  if(normalOnly){
    results.push({name:scene.name,boss:scene.boss,character,kind:scene.kind,frames:scene.frames,
      ...(scene.locator?{locator:scene.locator}:{spellAge:24}),portraits:normal.snapshot.portraitCalls,
      artifacts:{normal:artifact(normal)},capturePassed:true});
    console.log(`CAPTURE ${scene.name}: ${scene.frames} actual GPU frames`);continue;
  }
  const control=await nativeCapture(scene,'without-portrait');
  assert.deepEqual(normal.snapshot.session,control.snapshot.session,`${scene.name}: complete gameplay session changed`);
  assert.deepEqual(normal.snapshot.application,control.snapshot.application,`${scene.name}: complete application state changed`);
  assert.deepEqual(normal.snapshot.sharedPresentation,control.snapshot.sharedPresentation,`${scene.name}: public Boss effects changed`);
  for(const field of ['frame','format','screen','selection','replay','profile'])
    assert.deepEqual(normal.snapshot.state[field],control.snapshot.state[field],`${scene.name}: ${field} changed`);
  // Geometry oracle is source st01enm:12 root x496 and body:10's active
  // (0,240) / inactive(64,256), all scaled by1.5/2. It does not come from
  // production draw calls or the former 260x360 fit/playfield layout.
  const sourceLeft=scene.locator?.speaker==='left'?280:248,sourceTop=scene.locator?.speaker==='left'?128:120;
  const region=scene.kind==='dialogue'?{x:sourceLeft*1.5,y:sourceTop*1.5,width:220*1.5,height:Math.min(360*1.5,720-sourceTop*1.5)}:
    {x:48,y:24,width:576,height:672};
  const pixels=comparePixels(normal.image,control.image,region,scene.kind);
  results.push({name:scene.name,boss:scene.boss,character,kind:scene.kind,frames:scene.frames,
    ...(scene.locator?{locator:scene.locator}:{spellAge:24}),fullGameplaySessionIdentical:true,
    publicBossPresentationIdentical:true,pixels,
    portraits:normal.snapshot.portraitCalls,
    artifacts:{normal:artifact(normal),withoutPortrait:artifact(control)},passed:true});
  console.log(`PASS ${scene.name}: full session/public effects identical; ${pixels.obviousPixels} visibly changed source-frame pixels`);
}
stable();
writeFileSync(join(out,chosen?`${chosen}${normalOnly?'-normal':''}-report.json`:normalOnly?'normal-report.json':'report.json'),JSON.stringify({
  format:'ts-stg-rushboss-artwork-portraits-v1',scope:'Production portrait Demo, native V8/GPU, private right portraits and age24 spell cut-ins; the control disables only graphics.drawBossPortrait after game creation',
  backend:'v8',character,speaker,controlCompared:!normalOnly,originalExecutableRun:false,pixelEqualityToOriginalExe:false,
  locatorScope:'Full production application/ANM packs with mock platform adapter, followed by matching fixed-frame native runs',
  sourceStable:true,sourceHashes:before,nativeBinarySha256:binarySha256,results,passed:true},null,2)+'\n');
console.log(`${normalOnly?'CAPTURE':'PASS'} ${results.length} serial portrait ${normalOnly?'scenes':'pairs'}: ${out}`);
