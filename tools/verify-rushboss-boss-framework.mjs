// The real portrait application, public Boss entrance/HUD owners and common
// source ANMs. Only private attack/dialogue content is reduced in these fixtures.
// Paired runs suppress selected drawSelf calls; their complete animation/RNG,
// health, phase-plan and application state must remain identical.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',output='reports/rushboss/boss-framework',chosen=null,prepareOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--backend'&&args[i+1])backend=args[++i];
  else if(args[i]==='--out'&&args[i+1])output=args[++i];
  else if(args[i]==='--scene'&&args[i+1])chosen=args[++i].split(',');
  else if(args[i]==='--prepare')prepareOnly=true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend),'Use v8 or quickjs');
const allScenes=[
  {name:'black-fog-50',kind:'blackFog',age:50,frames:51,masks:['fog']},
  {name:'black-fog-100',kind:'blackFog',age:100,frames:101,masks:['fog']},
  {name:'black-fog-reveal-101',kind:'blackFog',age:101,frames:102,masks:[]},
  {name:'black-fog-tail-130',kind:'blackFog',age:130,frames:131,masks:['fog']},
  {name:'black-fog-finished-192',kind:'blackFog',age:192,frames:193,masks:[]},
  {name:'dialogue-wait-250',kind:'dialogueWait',age:250,frames:251,masks:[]},
  {name:'dialogue-combat-322',kind:'dialogueWait',age:322,frames:323,masks:[]},
  {name:'fly-in-40',kind:'flyIn',frames:40,masks:[]},
  {name:'survival-timer',kind:'survival',frames:90,masks:[]},
  {name:'boss-hud-ready',kind:'hud',frames:90,masks:['stars','ring']},
  {name:'nonspell-last-hit',kind:'transition',frames:100,masks:['ring']},
  {name:'spell-first-frame',kind:'transition',frames:101,masks:['ring']},
];
const scenes=allScenes.filter(scene=>!chosen||chosen.includes(scene.name));
assert.ok(scenes.length,'No scenes selected');
if(chosen)assert.ok(chosen.every(name=>allScenes.some(scene=>scene.name===name)),'Unknown scene selected');
const out=resolve(root,output),scratch=join(root,'build/rushboss-boss-framework');
mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?sourceFiles(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);
const sourceHashes=()=>Object.fromEntries([
  ...sourceFiles('packages/thlib/src'),...sourceFiles('games/rushboss/src'),
  'packages/thlib/assets/touhou-common/anm/effect.json','packages/thlib/assets/touhou-common/anm/front.json',
].map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=sourceHashes(),results=[],fixtures=[];

function fixtureSource(scene,masked){return `
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
const scene=${JSON.stringify(scene)},masked=${JSON.stringify(masked)};
let revealCalls=0;
const game=createRushPortraitGame(tsstg,{startBoss:scene.kind==='survival'?'monstone':'sunny',phaseIndex:scene.kind==='survival'?7:0,mode:scene.kind==='survival'?'spell':'stage',difficulty:3,
  character:0,invincible:true,skipDialogue:!['blackFog','dialogueWait'].includes(scene.kind),store:new SaveStore(),
  // Keep original phase HP, flags, health plan, resistance and transitions.
  // Only private authored attacks, drops and cinematic dialogue are omitted.
  createBattle:(phases,options)=>new RushBattle(phases.map(phase=>({...phase,
    init(){},update(){},end(){},itemDrops:{}})),options),
  createDialogue:(_resources,config)=>({age:0,complete:false,
    update(){this.age++;if(this.age===1){revealCalls++;config.onRevealBoss();}if(this.age===(scene.kind==='dialogueWait'?320:1)){this.complete=true;config.onComplete?.();}},
    draw(){},dispose(){},snapshot(){return{age:this.age,complete:this.complete};}}),
});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const session=game.application.game,battle=game.battle,shared=battle.presentation.shared,hud=shared.hud;
let frame=0,drawRecords=[],bossDraws=0,nameDraws=[],timeline=[];
const seen=new Set(),geometry=new Set(['quad','statefulQuad','mesh','mesh3d','sprite','spriteRegion','lineStrip']);
const bossDraw=game.graphics.bossArtwork.draw.bind(game.graphics.bossArtwork);
game.graphics.bossArtwork.draw=(...args)=>{
  bossDraws++;const start=args[0].commands.length,result=bossDraw(...args);
  // Body callbacks capture a command batch immediately; resolve its final
  // position only after the compositor flushes that batch into the main list.
  drawRecords.push({label:'body',script:-1,priority:18,marker:args[0].commands[start],commands:args[0].commands.length-start});
  return result;
};
const drawName=hud.drawName;
hud.drawName=(draw,name,options,vm)=>{
  nameDraws.push({name,options,position:vm.worldPosition(shared.screenView),alpha:vm.alpha});
  if(drawName)return drawName(draw,name,options,vm);return hud.font.draw(draw,name,options);
};
function stamp(vm,label){
  if(!vm)return;for(const child of vm.children)stamp(child,label);
  if(seen.has(vm))return;seen.add(vm);const original=vm.drawSelf.bind(vm);
  vm.drawSelf=(draw,view)=>{
    if(draw.enqueueAnm)return original(draw,view);
    if(label===masked)return;
    const start=draw.commands.length;original(draw,view);
    const submitted=draw.commands.slice(start).filter(command=>geometry.has(command[0]));
    if(!submitted.length)return;
    const blendOps=[...new Set(submitted.filter(command=>command[0]==='statefulQuad').map(command=>command.at(-1)[3]))];
    drawRecords.push({label,script:vm.scriptId,priority:vm.drawPriority,alpha:vm.alpha,start,
      position:vm.worldPosition(view),blendOps,commands:submitted.length});
  };
}
function prepare(){
  for(const vm of shared.entrance?.roots??[])stamp(vm,'fog');
  for(const vm of shared.entrance?.particles??[])stamp(vm,'fog');
  for(const vm of hud.stars)stamp(vm,'stars');
  for(const vm of hud.retiringStars)stamp(vm,'stars');
  for(const panel of hud.panels)for(const vm of panel.animations)stamp(vm,'ring');
}
function bankState(bank){return{rng:{state:bank.rng.state,last:bank.rng.last,modulus:bank.rng.modulus},
  roots:bank.instances.filter(vm=>vm.alive&&!vm.parent).map(vm=>vm.snapshot())};}
function proof(){return{
  frame,state:session.state,revealCalls,combatStarted:battle.combatStarted,dialogue:battle.dialogue,
  phaseIndex:battle.phaseIndex,phaseFrame:battle.phaseFrame,results:battle.results,
  hp:battle.boss.hp??null,maximumHp:battle.boss.maxHp??null,bossAlive:battle.boss.alive,
  bossVisible:shared.bossVisible,bossEffectsVisible:shared.bossEffectsVisible,entranceReady:shared.entranceReady,
  entrance:shared.entrance?.snapshot()??null,hud:hud.snapshot(),
  phaseSummary:battle.phases.map(phase=>({spell:!!phase.spell,hp:phase.hp})),
  plan:battle.phaseIndex>=0?battle.presentation.phasePlan.hudState(battle.singlePhase?0:battle.phaseIndex,{hp:battle.boss.hp,maximumHp:battle.boss.maxHp}):null,
  namePosition:hud.nameAnimation?.worldPosition(shared.screenView)??null,
  starPositions:hud.stars.filter(Boolean).map(vm=>vm.worldPosition(shared.screenView)),
};}
globalThis.__tsstg_game={update(){
  if(scene.kind==='transition'&&frame===99){battle.phaseFrame=1200;battle.damage(battle.boss.hp-1);}
  if(scene.kind==='transition'&&frame===100)battle.damage(1);
  game.update(0);frame++;
  if(frame>=98||scene.kind==='blackFog'&&frame<=2)timeline.push({frame,state:session.state,
    phaseIndex:battle.phaseIndex,phaseFrame:battle.phaseFrame,hp:battle.boss.hp??null,
    hud:hud.snapshot(),entranceAge:shared.entrance?.age??null,visible:shared.bossVisible,ready:shared.entranceReady});
},render(){
  prepare();drawRecords=[];bossDraws=0;nameDraws=[];const commands=game.render();
  for(const record of drawRecords)if(record.marker){record.start=commands.indexOf(record.marker);delete record.marker;}
  return commands;
},snapshot(){return{
  game:game.snapshot(),proof:proof(),timeline,drawRecords,bossDraws,nameDraws,
  presentation:battle.presentation.snapshot(),
  actors:battle.world.entities.map(entity=>entity.snapshot()),
  sourceBanks:Object.fromEntries(Object.entries(battle.presentation.banks).map(([name,bank])=>[name,bankState(bank)])),
  playerBanks:Object.fromEntries(Object.entries(battle.touhouResources.banks).filter(([,bank])=>bank).map(([name,bank])=>[name,bankState(bank)])),
};}};
`;}

function compareImages(fullFile,maskedFile){
  const full=decodeRgbaPng(readFileSync(fullFile)),masked=decodeRgbaPng(readFileSync(maskedFile));
  assert.deepEqual([full.width,full.height],[masked.width,masked.height]);
  const roi={x:48,y:24,width:576,height:672};let changedPixels=0,changedOutside=0;
  const bounds={left:full.width,top:full.height,right:-1,bottom:-1};
  for(let y=0;y<full.height;y++)for(let x=0;x<full.width;x++){
    const at=(y*full.width+x)*4;let changed=false;
    for(let c=0;c<4;c++)changed||=full.rgba[at+c]!==masked.rgba[at+c];
    if(!changed)continue;changedPixels++;
    bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);
    if(!(x>=roi.x&&y>=roi.y&&x<roi.x+roi.width&&y<roi.y+roi.height))changedOutside++;
  }
  return{roi,changedPixels,changedOutside,bounds:changedPixels?bounds:null};
}
function validate(scene,state){
  const p=state.proof,records=state.drawRecords;
  assert.equal(p.frame,scene.frames);
  if(scene.kind==='dialogueWait'){
    assert.equal(p.entrance.mode,'blackFog');assert.equal(p.bossVisible,true);
    assert.equal(p.entrance.age,Math.min(scene.age,192));assert.equal(p.revealCalls,1);
    assert.equal(p.combatStarted,scene.age>=320);assert.equal(p.bossEffectsVisible,scene.age>=320);
    assert.equal(p.hud.timerVisible,scene.age>=320);
    if(scene.age<320){assert.equal(p.state,'before');assert.equal(p.phaseIndex,-1);assert.equal(p.hud.stars.length,0);}
    else{assert.equal(p.state,'combat');assert.equal(p.phaseIndex,0);}
  }else if(scene.kind==='blackFog'){
    assert.equal(p.revealCalls,1,'The ordinary dialogue must request the entrance exactly once');
    assert.equal(p.entrance.mode,'blackFog');assert.equal(p.entrance.age,scene.age);
    assert.equal(p.bossVisible,scene.age>=101);assert.equal(p.entranceReady,scene.age>=101);
    assert.equal(p.bossEffectsVisible,scene.age>=102,'Source aura/distortion begin one frame after reveal');
    if(scene.age<=100){
      assert.equal(p.state,'entrance');assert.equal(p.combatStarted,false);assert.equal(p.phaseIndex,-1);assert.equal(p.phaseFrame,0);
      assert.equal(p.hud.name,'');assert.equal(p.hud.stars.length,0);assert.equal(state.bossDraws,0,'The body is not submitted behind the gathering fog');
    }else{
      assert.equal(p.state,'combat');assert.equal(p.combatStarted,true);assert.equal(p.phaseIndex,0);
      assert.ok(state.bossDraws>0,'The Boss is visible once the source summon completes');
    }
    if(scene.age===50)assert.equal(p.entrance.particles,800);
    if(scene.age===192){assert.equal(p.entrance.alive,false);assert.equal(p.entrance.particles,0);assert.equal(records.filter(r=>r.label==='fog').length,0);}
    else{
      const fog=records.filter(record=>record.label==='fog');assert.ok(fog.length>0);
      assert.ok(fog.every(record=>[149,150].includes(record.script)));
      assert.ok(fog.every(record=>[16,18,24].includes(record.priority)),'Source summon particles retain original callback layers');
      if(scene.age>=101){
        const body=records.find(record=>record.label==='body');assert.ok(body?.commands>0);
        for(const record of fog)assert.ok(record.priority===16?record.start<body.start:record.start>body.start,
          'Source draw order is rear glow, Boss body, black mist, foreground mist');
      }
      if(scene.age===50){
        assert.ok(fog.some(record=>record.script===149&&record.blendOps.includes('reverseSubtract')));
        assert.ok(fog.some(record=>record.script===150&&record.blendOps.includes('add')));
      }
    }
  }else{
    assert.equal(p.entrance.mode,'flyIn');assert.equal(p.bossVisible,true);assert.equal(p.entranceReady,true);
    assert.equal(p.state,'combat');assert.equal(p.entrance.particles,0);assert.equal(p.revealCalls,0);
    assert.equal(records.filter(record=>record.label==='fog').length,0);
  }
  if(scene.kind==='hud'||scene.kind==='transition'){
    assert.equal(p.hud.name,'Sunny Milk');assert.ok(p.hud.remainingSpells>0);
    assert.equal(p.hud.remainingSpells,p.plan.remainingSpells);
    assert.equal(p.hud.stars.length,p.hud.remainingSpells);
    assert.ok(p.hud.stars.every(star=>star.alpha===255));
    const stars=records.filter(record=>record.label==='stars');assert.equal(stars.length,p.hud.remainingSpells);
    assert.ok(stars.every(record=>record.priority===60&&record.script>=58&&record.script<=67));
    assert.ok(p.starPositions.every(position=>position.y>p.namePosition.y),'Remaining cards appear beneath the Boss name');
    assert.ok(state.nameDraws.some(name=>name.name==='Sunny Milk'&&name.alpha===255));
    assert.equal(p.hud.panels[0].markers[0],p.plan.healthBars[0].markers[0]);
    assert.ok(records.some(record=>record.label==='ring'&&record.script===374));
    if(scene.kind==='hud'){
      assert.equal(p.hud.panels[0].fraction,1);assert.ok(records.some(record=>record.label==='ring'&&record.script===377));
    }else{
      assert.equal(p.phaseIndex,scene.frames===100?0:1);assert.equal(p.results.length,scene.frames===100?0:1);
      if(scene.frames===100)assert.equal(p.hp,1);else assert.equal(p.hp,p.maximumHp);
      assert.ok(p.hud.panels[0].fraction<1,'Starting the spell must not refill the whole ring');
      assert.equal(p.hud.panels[0].fraction,p.hud.panels[0].target);
    }
  }
  if(scene.kind==='survival'){
    assert.equal(p.hud.name,'Monstone');assert.equal(p.hud.timerVisible,true);assert.equal(p.hud.remainingSpells,0);
    assert.equal(records.filter(record=>record.label==='ring').length,0,'Survival hides only the HP ring');
  }
}

for(const scene of scenes){
  const states={},paths={};
  for(const variant of ['full',...scene.masks]){
    const entry=join(scratch,`${backend}-${scene.name}-${variant}.js`),prefix=join(out,`${backend}-${scene.name}-${variant}`);
    writeFileSync(entry,fixtureSource(scene,variant==='full'?null:variant));fixtures.push(relative(root,entry));
    if(prepareOnly)continue;
    const run=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend',backend,
      '--frames',String(scene.frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));if(run.error)throw run.error;
    assert.equal(run.status,0,`${scene.name}/${variant}: ${run.stderr}`);
    states[variant]=JSON.parse(readFileSync(`${prefix}.json`));paths[variant]=`${prefix}.png`;
  }
  if(prepareOnly)continue;
  validate(scene,states.full);const controls={};
  for(const mask of scene.masks){
    const {drawRecords:fullDraw,...fullState}=states.full,{drawRecords:maskedDraw,...maskedState}=states[mask];
    assert.deepEqual(fullState,maskedState,`${scene.name}/${mask}: draw-only masking changed complete gameplay/ANM/RNG state`);
    assert.ok(!maskedDraw.some(record=>record.label===mask));
    controls[mask]=compareImages(paths.full,paths[mask]);
    assert.ok(controls[mask].changedPixels>10,`${scene.name}/${mask} must visibly affect the native screenshot`);
    // Stars and rings are source gameplay owners; large summon particles may
    // intentionally use the source camera's 16-unit margin around the field.
    if(mask==='stars'||mask==='ring')assert.equal(controls[mask].changedOutside,0);
  }
  const aggregate={};for(const record of states.full.drawRecords){const key=`${record.label}:${record.script}:${record.priority}`;aggregate[key]=(aggregate[key]??0)+record.commands;}
  results.push({scene,proof:states.full.proof,timeline:states.full.timeline,controls,renderSubmissions:aggregate,
    pngSha256:Object.fromEntries(Object.entries(paths).map(([variant,path])=>[variant,hash(readFileSync(path))]))});
  console.log(`PASS ${scene.name} (${backend}): source entrance/HUD state and ${scene.masks.length} draw-only control(s)`);
}
if(prepareOnly){
  writeFileSync(join(scratch,`${backend}-prepared.json`),JSON.stringify({backend,fixtures,scenes,sourceHashes:before},null,2)+'\n');
  console.log(`Prepared ${fixtures.length} Boss-framework fixtures; no native process started`);
}else{
  assert.deepEqual(sourceHashes(),before,'Production source/assets changed during verification');
  const beforeSpell=results.find(result=>result.scene.name==='nonspell-last-hit')?.proof,
    afterSpell=results.find(result=>result.scene.name==='spell-first-frame')?.proof;
  if(beforeSpell&&afterSpell){
    assert.equal(beforeSpell.plan.healthBars[0].groupIndex,afterSpell.plan.healthBars[0].groupIndex);
    assert.equal(beforeSpell.plan.healthBars[0].maximum,afterSpell.plan.healthBars[0].maximum);
    assert.ok(afterSpell.hud.panels[0].fraction<=beforeSpell.hud.panels[0].fraction,'Consuming the last nonspell HP continues the same ring');
    assert.equal(afterSpell.hud.remainingSpells,beforeSpell.hud.remainingSpells,'Current-group card is not a future-card star');
  }
  writeFileSync(join(out,`report-${backend}.json`),JSON.stringify({format:'ts-stg-rushboss-boss-framework-v1',backend,passed:true,
    sourceHashes:before,binarySha256:hash(readFileSync(join(root,'build/Release/ts-stg.exe'))),
    originalExecutableRun:false,pixelEquivalentToOriginalClaimed:false,
    scope:'Actual portrait application dialogue/entrance/combat transitions and common Boss owners. Private attack/dialogue bodies are simplified. Paired controls change render submission only; complete application, ANM, bank RNG, actors and phase-plan state are compared.',results},null,2)+'\n');
  console.log(`PASS ${results.length} Boss-framework native scenes (${backend}); production source hashes stable`);
}
