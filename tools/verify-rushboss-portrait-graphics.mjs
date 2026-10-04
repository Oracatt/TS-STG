// Private demo acceptance: actual QuickJS host + GPU, original public presets.
// This proves runtime composition and captures, not original-EXE pixel equality.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
let output='reports/rushboss/portrait-graphics',executable=process.env.TSSTG_BINARY??'build/Release/ts-stg.exe';
let chosen,backend='quickjs',warmup=60;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--exe'&&args[i+1])executable=args[++i];
  else if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--warmup'&&args[i+1])warmup=Number(args[++i]);
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i];
  else if(!args[i].startsWith('-')&&!chosen)chosen=args[i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
assert.ok(['quickjs','v8'].includes(backend),'--backend must be quickjs or v8');
assert.ok(Number.isSafeInteger(warmup)&&warmup>=0,'--warmup requires nonnegative integer');
const out=resolve(root,output),fixtures=join(root,'build/rushboss-portrait-graphics');
const exe=resolve(root,executable);
const battle=(startBoss,phaseIndex,character=0)=>({startBoss,phaseIndex,character,difficulty:3,mode:'spell',invincible:true,skipDialogue:true});
const scenes=[
  {name:'title',frames:300,options:{},screen:'title'},
  {name:'title-confirm',frames:145,options:{},screen:'title',select:0,mask:'frame===132?Keys.CONFIRM:0'},
  {name:'difficulty',frames:166,options:{},screen:'title',select:0,mask:'frame===132?Keys.CONFIRM:frame===160?Keys.RIGHT:0'},
  {name:'character',frames:192,options:{},screen:'title',select:0,mask:'frame===132||frame===162?Keys.CONFIRM:frame===186?Keys.RIGHT:0'},
  {name:'stage-practice',frames:225,options:{},screen:'title',select:2,mask:'frame===132||frame===162||frame===188?Keys.CONFIRM:0'},
  {name:'spell-practice',frames:225,options:{},screen:'title',select:3,mask:'frame===132||frame===162||frame===188?Keys.CONFIRM:0'},
  {name:'options',frames:185,options:{},screen:'title',select:7,mask:'frame===132?Keys.CONFIRM:frame===172?Keys.LEFT:0'},
  {name:'manual',frames:185,options:{},screen:'title',select:8,mask:'frame===132?Keys.CONFIRM:0'},
  {name:'replay',frames:185,options:{},screen:'title',select:4,mask:'frame===132?Keys.CONFIRM:0'},
  {name:'reimu-dialogue',frames:180,options:{startBoss:'sunny',character:0},screen:'battle',dialogue:true},
  {name:'marisa-dialogue',frames:180,options:{startBoss:'sunny',character:1},screen:'battle',dialogue:true},
  {name:'boss-dialogue',frames:200,options:{startBoss:'sunny',character:0},screen:'battle',dialogue:true,mask:'frame<35?Keys.FOCUS:0'},
  {name:'boss-entrance',frames:45,options:{...battle('sunny',0),mode:'stage'},screen:'battle'},
  {name:'sunny-nonspell',frames:300,options:{...battle('sunny',0),mode:'stage'},screen:'battle',bullets:true},
  {name:'monstone-nonspell',frames:300,options:{...battle('monstone',0),mode:'stage'},screen:'battle',bullets:true},
  {name:'artia-nonspell',frames:300,options:{...battle('artia',0),mode:'stage'},screen:'battle',bullets:true},
  {name:'spell-opening',frames:24,options:battle('sunny',1),screen:'battle',spell:true},
  {name:'sunny-sc2',frames:600,options:battle('sunny',1),screen:'battle',spell:true},
  {name:'monstone-sc8',frames:600,options:battle('monstone',7),screen:'battle',spell:true},
  {name:'artia-sc8',frames:500,options:battle('artia',7,1),screen:'battle',spell:true},
  {name:'artia-sc12',frames:500,options:battle('artia',11),screen:'battle',spell:true},
  {name:'artia-sc13',frames:300,options:battle('artia',12,1),screen:'battle',spell:true},
  {name:'reimu-bomb',frames:150,options:battle('sunny',1),screen:'battle',spell:true,mask:'Keys.FOCUS|(frame===120?Keys.BOMB:Keys.SHOOT)'},
  {name:'marisa-bomb',frames:180,options:battle('artia',12,1),screen:'battle',spell:true,mask:'Keys.FOCUS|(frame===120?Keys.BOMB:Keys.SHOOT)'},
  {name:'pause',frames:360,options:battle('sunny',1),screen:'battle',spell:true,paused:true,mask:'frame===300?Keys.PAUSE:Keys.FOCUS|Keys.SHOOT'},
  {name:'result',frames:200,options:battle('sunny',1),screen:'battle',paused:true,result:true,inject:"if(frame===120)game.battle.endPhase('defeated');"},
  {name:'playback',frames:360,options:battle('sunny',1),screen:'battle',spell:true,playback:true,inject:'if(frame===160)game.playReplay(game.saveReplay());',mask:'Keys.FOCUS|Keys.SHOOT'},
].filter(scene=>!chosen||chosen===scene.name);
assert.ok(scenes.length,'Unknown scene');assert.ok(existsSync(exe),'Build native host first');
mkdirSync(out,{recursive:true});mkdirSync(fixtures,{recursive:true});
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const files=['games/rushboss/src','packages/thlib/src','packages/thlib/src/touhou'].flatMap(dir=>
  readdirSync(join(root,dir)).filter(file=>file.endsWith('.js')).map(file=>`${dir}/${file}`));
const codeHashes=()=>Object.fromEntries(files.map(file=>[file,hash(join(root,file))]));
const before=codeHashes(),results=[];
for(const scene of scenes){
  const entry=join(fixtures,`${backend}-${scene.name}.js`),prefix=join(out,scene.name);
  writeFileSync(entry,`import {Keys,SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const game=createRushPortraitGame(tsstg,{...${JSON.stringify(scene.options)},store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
let frame=0;
globalThis.__tsstg_game={update(){
  ${scene.select===undefined?'':`if(frame===132)game.application.menu.selection=${scene.select};`}
  ${scene.inject??''}
  game.update(${scene.mask??'0'});frame++;
},render(){return game.render();},postFrame(now){return game.postFrame(now);},snapshot(){return{hostFrames:frame,...game.snapshot()};}};
`);
  const run=spawnSync(exe,[relative(root,entry),'--root',root,'--backend',backend,'--profile-warmup',String(warmup),'--frames',String(scene.frames),'--benchmark',
    '--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`,'--profile',`${prefix}-profile.json`],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});
  writeFileSync(`${prefix}-output.txt`,(run.stdout??'')+(run.stderr??''));
  if(run.error)throw run.error;assert.equal(run.status,0,`${scene.name}: ${run.stdout}\n${run.stderr}`);
  const state=JSON.parse(readFileSync(`${prefix}.json`)),profile=JSON.parse(readFileSync(`${prefix}-profile.json`));
  assert.equal(state.format,'ts-stg-rushboss-portrait-v1');assert.equal(state.hostFrames,scene.frames);
  assert.equal(state.screen,scene.screen);assert.equal(profile.headless,false);
  assert.equal(profile.renderFrames,scene.frames);assert.equal(profile.simulationFrames,scene.frames);
  assert.deepEqual(state.graphics.viewport,{x:48,y:24,width:576,height:672});
  assert.deepEqual(state.graphics.actorScripts,{sunny:'src_sunnymilk',monstone:'src_monstone',artia:'src_artia'});
  if(scene.screen==='title')assert.deepEqual(state.graphics.rushArtwork,[]);
  if(scene.screen==='battle'){
    const b=state.application.battle,shared=state.graphics.boss.shared;
    assert.equal(state.graphics.background.stage,b.boss);assert.equal(state.graphics.background.shaderAvailable,true);
    const floor={sunny:'src_grassland',monstone:'src_river_ground',artia:'src_snow_ground'}[b.boss];
    assert.ok(state.graphics.rushArtwork.includes(floor),`${scene.name}: stage's actual source ground`);
    if(!scene.dialogue&&!scene.result)assert.ok(state.graphics.rushArtwork.includes(state.graphics.actorScripts[b.boss]),'Actual Boss sheet');
    if(scene.spell)for(const name of [`src_${b.boss==='sunny'?'sunnymilk':b.boss}_cdbg1`,`src_${b.boss==='sunny'?'sunnymilk':b.boss}_cdbg2`])
      assert.ok(state.graphics.rushArtwork.includes(name),`${scene.name}: source spell background ${name}`);
    assert.equal(b.profile,'portrait');assert.equal(b.character,scene.options.character??0);
    assert.equal(b.sharedPlayer.implementation,'@ts-stg/thlib/touhou TouhouPlayer/TouhouShot/TouhouReimuBomb/TouhouMarisaBomb');
    assert.equal(state.application.paused,!!scene.paused);
    if(scene.dialogue){assert.ok(state.application.dialogue.active);assert.equal(b.statistics.spawned,0);assert.equal(b.combatStarted,false);}
    else if(scene.result){assert.equal(state.application.completed,true);assert.equal(state.application.state,'result');assert.equal(state.application.pause.phase,6);}
    else{
      assert.equal(b.combatStarted,true);assert.deepEqual(shared.auraScripts,[99,108]);
      assert.equal(shared.distortion.columns,17);assert.equal(shared.distortion.rows,17);assert.equal(shared.distortion.radius,160);
      assert.deepEqual(state.graphics.boss.entrances,[]);assert.deepEqual(state.graphics.boss.cards,[]);
      if(scene.spell)assert.equal(state.graphics.spellBackground,`${b.boss}:${b.phaseIndex}`);
      if(scene.bullets){assert.ok(b.statistics.spawned>0);assert.ok(b.entities>0);assert.equal(state.graphics.spellBackground,null);}
      if(scene.paused)assert.equal(b.phaseFrame,300);
      if(scene.name.endsWith('-bomb'))assert.ok(b.sharedPlayer.bomb,'Actual shared Bomb must be alive');
      if(scene.name==='spell-opening'){assert.ok(shared.openingScripts.includes(13));assert.ok(shared.effectScripts.some(id=>id===4||id===5));}
      if(scene.playback){assert.equal(state.replay.playing,true);assert.equal(state.replay.complete,true);assert.equal(state.replay.frames,160);}
    }
  }
  assert.deepEqual(codeHashes(),before,'Production source changed during verification');
  results.push({scene:scene.name,frames:scene.frames,screen:state.screen,
    pngSha256:hash(`${prefix}.png`),battlePhase:state.application.battle?.phase??null,
    privateSpellBackground:state.graphics.spellBackground??null,privateArtwork:state.graphics.rushArtwork,
    commandCount:profile.metrics.commandCount,passed:true});
  console.log(`PASS ${scene.name}: ${scene.frames} actual GPU frames`);
}
writeFileSync(join(out,chosen?`${chosen}-report.json`:'report.json'),JSON.stringify({
  scope:`Portrait production application, actual native ${backend} + GPU, original thlib presets with private RushBoss stage and Boss artwork`,backend,
  originalExecutableRun:false,pixelEqualityToOriginalExe:false,sourceStable:true,sourceHashes:before,
  nativeBinarySha256:hash(exe),results,passed:true},null,2)+'\n');
console.log(`PASS: ${results.length} portrait captures in ${out}`);
