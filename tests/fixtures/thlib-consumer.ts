import {DrawList,Keys,TouhouDialogue as RootDialogue} from '@ts-stg/thlib';
import type {NativeHost} from '@ts-stg/thlib';
import {createTouhouResources,createTouhouLaserOrigin,TouhouApplication,TouhouTitleMenu,TouhouMusicCaption} from '@ts-stg/thlib/touhou';
import type {AnmInstance,TouhouMenuBackground,TouhouStartSelection,TouhouDialogueStep} from '@ts-stg/thlib/touhou';
import {TouhouTitleBackground,titleShade} from '@ts-stg/thlib/touhou/title-background';
import {TouhouStageSelect} from '@ts-stg/thlib/touhou/stage-selection';
import {TouhouDialogue,wrapTouhouDialogue} from '@ts-stg/thlib/touhou/dialogue';
import {TouhouBossPresentation,TouhouBossCharge,TOUHOU_BOSS_CHARGE_PRESETS,TouhouBulletPresentation,TouhouBulletBirth,touhouStyle,TouhouBossDeath,TouhouScreenShake,TouhouHud,TouhouGameplayCompositor as DeathCompositor,TouhouRenderQueue as DeathQueue} from '@ts-stg/thlib/touhou';

declare const host:NativeHost;
host.setMusicVolume(1,.5);
// @ts-expect-error Gain control requires an explicit volume.
host.setMusicVolume(1);
// @ts-expect-error Native gain accepts a number, not text.
host.setMusicVolume(1,'0.5');
const resources=createTouhouResources(host,{basePath:'assets/touhou-common'});
const draw=new DrawList();
const musicCaption=new TouhouMusicCaption({host,text:'A user supplied song',codePage:936});
musicCaption.update().draw(draw);const captionText:string=musicCaption.snapshot().text;musicCaption.destroy();
// @ts-expect-error Music captions require text supplied by the application.
new TouhouMusicCaption({host,text:42});
const view={x:336,y:24,scale:1.5,screenScale:1};
const target=host.createRenderTarget(960,720);
const bossEffects=new TouhouBossPresentation({banks:{effect:resources.createBank('effect'),front:resources.createBank('front'),ascii_960:resources.createBank('ascii_960')}});
bossEffects.drawBody(new DeathQueue(),(target,bodyView)=>target.rect(bodyView.x??0,bodyView.y??0,32,32,0xffffffff));
// @ts-expect-error External Boss body callbacks use numeric ANM layers.
bossEffects.drawBody(draw,()=>{},{layer:'foreground'});
const bossCharge:TouhouBossCharge=bossEffects.beginCharge({x:0,y:128,color:'green',releaseColor:'yellow',repeatCount:2,repeatInterval:24,releaseFrame:84});
const chargeScript:number=TOUHOU_BOSS_CHARGE_PRESETS.green.chargeScript;
bossCharge.stop();bossCharge.destroy();
const bossDeath:TouhouBossDeath=bossEffects.beginDeath({x:0,y:128,delayFrames:0,follow:null,
 sound(id,x){const sound:number=id;const pan:number=x;},onBurst(effect){const alive:boolean=effect.alive;}});
const deathActive:boolean=bossEffects.hasDeathEffects;
const shake=new TouhouScreenShake({duration:30,from:12,to:0});shake.update();
const compositor=new DeathCompositor({renderTarget:target});
compositor.draw(draw,new DeathQueue(),{cameraOffset:bossEffects.cameraOffset});
bossDeath.destroy();
const feedback=new TouhouHud({bank:resources.createBank('front'),textBank:resources.createBank('ascii_960'),font:resources.font!});
feedback.notice(0,123456,{spell:bossEffects.spell});feedback.notice(4);
const noticeActive:boolean=feedback.activeNotice;feedback.destroy();
const bulletEffect=new TouhouBulletPresentation({bank:resources.createBank('bullet'),style:touhouStyle(resources.styles,8,1),birthKind:TouhouBulletBirth.NORMAL});
bulletEffect.update({x:10,y:100});bulletEffect.draw(draw);bulletEffect.finish('hit',{velocity:{x:1,y:2}});bulletEffect.destroy();
// @ts-expect-error Charge palette names are the seven restored source variants.
bossEffects.beginCharge({color:'orange'});
// @ts-expect-error Timeline parameters require integer numeric values at runtime.
bossEffects.beginCharge({repeatCount:'2'});
// @ts-expect-error Natural retirement and explicit cancel/hit are distinct visual operations.
bulletEffect.finish('outOfRange');
const mesh=new TouhouTitleBackground({textureId:target,width:960,height:720});
const captureBackground:TouhouMenuBackground={
 textureId:target,update(){mesh.update();},
 drawCapture(output){output.clear(0x102030ff);},
 draw(output){mesh.draw(output);},destroy(){host.unloadTexture(target);}
};
const directBackground:TouhouMenuBackground={textureId:null,update(){},draw(output){output.clear(0x203040ff);}};
const shade:number=titleShade(200,.5,1);
const app=new TouhouApplication({resources,pixels:host,ownResources:true,
 menuOptions:{background:captureBackground,disposeBackground:true},
 gameOptions(selection,owner){
  const difficulty:number=selection.difficulty;const mode:'title'|'game'=owner.mode;
  return {power:400,stage(game,frame){if(frame===difficulty)game.player.power=400;}};
 },onSceneChange(change,owner){const mode:'title'|'game'=change.mode;owner.snapshot();},
 onQuit(owner){owner.destroy();host.quit();}
});
app.update(Keys.CONFIRM);app.render();
const rootExport:typeof TouhouDialogue=RootDialogue;

if(!resources.font)throw new Error('This consumer requires the common bitmap font.');
const titleBank=resources.createBank('title');
const title=new TouhouTitleMenu({bank:titleBank,font:resources.font,background:directBackground,
 onStart(selection){const selected:TouhouStartSelection=selection;app.start(selected);}});
const stageSelect=new TouhouStageSelect({bank:titleBank,font:resources.font,
 entries:[{label:'Stage 1',stage:1},{label:'Stage 2',stage:2,disabled:true}],
 onSelect(entry,index){
  const label:string=entry.label;const field:unknown=entry.stage;const selected:number=index;
  if(typeof field==='number')app.start({mode:'practice',difficulty:field-1});
 },drawLabel(output,entry,options){
  const label:string=entry.label;const selected:boolean=options.selected;
  resources.font?.draw(output,label,options);
 },onCancel(){app.openMenu();}
});
stageSelect.update(Keys.DOWN);titleBank.update();stageSelect.draw(draw);titleBank.draw(draw);
const stageCount:number=stageSelect.snapshot().count;stageSelect.destroy();title.destroy();titleBank.dispose();

const steps:TouhouDialogueStep[]=[{speaker:'left',text:'公共中文对话',coldFrames:30,
 portraits:{left:{present:true,emotion:'NOTICE'}},events:[{type:'custom',id:42}]},{terminal:true}];
const dialogue=new TouhouDialogue({resources,steps,character:0,codePage:936,charsPerFrame:Infinity,
 speakerNames:{right:'角色'},drawPortrait(output,step,owner,portraitView){
  const current:TouhouDialogueStep|null=owner.current;const x:number|undefined=portraitView.x;
  if(step.speaker==='left')output.clear(0x000000ff);
 },onEvent(event,step,owner){const key:string=event.type;const payload:unknown=event.id;owner.snapshot();},
 onComplete(owner){const complete:boolean=owner.complete;}
});
dialogue.update(Keys.SHOOT);dialogue.advance();dialogue.draw(draw,view);
const portraitScreenView=dialogue.portraitView(view);
const rightPortrait=dialogue.portraitState('right');
if(rightPortrait){const originalWidth:number=rightPortrait.width;const color:number=rightPortrait.color;}
// @ts-expect-error Common portrait clocks have exactly two sides.
dialogue.portraitState('center');
const lines:string[]=dialogue.snapshot().lines;const active:boolean=dialogue.active;dialogue.dispose();
const wrapped:string[]=wrapTouhouDialogue('编码后换行',(text,codePage)=>resources.encodeText(text,codePage),{codePage:936,maxBytes:40});
const textBank=resources.createBank('text'),text=textBank.create(20);
resources.writeAnimationText(text,'简体中文',{font:4,codePage:936,align:'left',outline:true,outlineScale:.6});
const name=resources.createNameAnimation('符卡名称',{codePage:936},textBank);name.destroy();textBank.dispose();
const bulletBank=resources.createBank('bullet');
const laserOrigin:AnmInstance=createTouhouLaserOrigin(bulletBank,15,{x:0,y:100});
laserOrigin.update();laserOrigin.draw(draw,view);laserOrigin.destroy();bulletBank.dispose();

// Negative checks fail if these public contracts accidentally become `any` or widen.
// @ts-expect-error A dialogue speaker must select one of the two sides.
const wrongSpeaker:TouhouDialogueStep={speaker:'center'};
// @ts-expect-error Public player selection supports the two standard characters.
new TouhouDialogue({resources,character:2});
// @ts-expect-error The encoder returns bytes, not a JavaScript string.
wrapTouhouDialogue('test',()=> 'test');
// @ts-expect-error Native texture handles are numbers (or null for direct backgrounds).
const wrongBackground:TouhouMenuBackground={textureId:'target',update(){},draw(){}};
// @ts-expect-error Labels belong to the business entries and must be text.
new TouhouStageSelect({bank:titleBank,font:resources.font,entries:[{label:42}]});
// @ts-expect-error Dialogue surface alignment only supports implemented modes.
resources.writeAnimationText(text,'text',{align:'right'});
// @ts-expect-error Source laser colors are numeric palette indices, not names.
createTouhouLaserOrigin(bulletBank,'red');

// A consumer can supply a phase plan or its own display values without mutating combat HP.
import {TouhouBossPhasePlan,TouhouBossHud,TouhouGame as HudConfiguredGame} from '@ts-stg/thlib/touhou';
import type {TouhouBossHudState} from '@ts-stg/thlib/touhou';
const phasePlan=new TouhouBossPhasePlan([{hp:12000},{hp:2200,spell:true}]);
const fullSpellPlan=new TouhouBossPhasePlan([{hp:12000},{hp:2200,spell:true}],{spellRing:'full'});
bossEffects.update(fullSpellPlan.hudState(1));
bossEffects.update({healthBars:[{current:100,maximum:100,animateFill:false}]});
// @ts-expect-error Spell ring policy names are constrained.
new TouhouBossPhasePlan([{hp:100,spell:true}],{spellRing:'ful'});
const customPhasePlan=new TouhouBossPhasePlan([{life:400,kind:'spell',set:'a'}],{
 isSpell:phase=>phase.kind==='spell',weight:phase=>phase.life,group:phase=>phase.set,
});
const phaseHud={name:'Custom Boss',...phasePlan.hudState(0,{hp:6000,maximumHp:12000})} satisfies TouhouBossHudState;
bossEffects.update(phaseHud);
const customHud=new TouhouBossHud({bank:resources.createBank('front'),textBank:resources.createBank('ascii_960'),
 drawName(output,name,options,animation){const nameText:string=name;const opacity:number=animation.alpha;resources.font!.draw(output,name,options);},
 nameStyle:{font:6,scaleX:.65,scaleY:.65},
});
customHud.update(customPhasePlan.hudState(0));customHud.setRemainingSpells(2);customHud.setName('Another Boss');customHud.destroy();
declare const configuredGame:HudConfiguredGame;
configuredGame.enterBoss({x:0,y:128,hp:12000,maximumHp:12000},{entrance:{mode:'blackFog'}});
configuredGame.setBossHud(phaseHud);
configuredGame.startBossCombat();configuredGame.stopBossCombat();
configuredGame.enterBoss({x:0,y:128,hp:100,maximumHp:100},{entrance:{mode:'flyIn',readyFrame:90}});
// @ts-expect-error Display health remains numeric, even when logical phase metadata is application-defined.
phasePlan.hudState(0,{hp:'6000'});
// @ts-expect-error Source star counts are numeric.
customHud.setRemainingSpells('two');

// Externally authored trajectories retain the same public collision owners.
import {TouhouBulletCollision,TouhouLaserField,touhouCircleCollision,touhouBulletInCancelRectangle,
 createTouhouLaserCollisionState,updateTouhouLaserCollision,cancelTouhouLaser,clearTouhouBossPhase} from '@ts-stg/thlib/touhou';
import type {TouhouPlayer,TouhouLaserCollisionResult} from '@ts-stg/thlib/touhou';
declare const collisionPlayer:TouhouPlayer;
const contact=new TouhouBulletCollision({x:0,y:120,radius:4});
contact.update(collisionPlayer,{}, {onHit(bullet){const radius:number=bullet.radius;}});
const contactKind:0|1|2=touhouCircleCollision(0,120,3,1,120,4);
const cancellable:boolean=touhouBulletInCancelRectangle(contact,0,120,40,80,0,{x:-192,y:0,width:384,height:448});
const laserField=new TouhouLaserField({bank:null,styles:resources.styles});
clearTouhouBossPhase({x:0,y:128,stopAttack(){},clearEnemies(){},
 cancelCircle:(x,y,radius,options)=>laserField.cancelCircle(x,y,radius,options)});
const drivenLaser=laserField.spawnDriven(2,{x:0,y:120,width:16,length:96,state:2,autoBounds:true});
if(drivenLaser){
 laserField.updateDrivenCurve(drivenLaser,[]);
 laserField.updateDrivenCurve(drivenLaser,[{position:{x:0,y:128,z:0},velocity:{x:0,y:8,z:0},angle:Math.PI/2,speed:8}]);
 laserField.setPosition(drivenLaser,0,128);laserField.retire(drivenLaser);
}
const beamState=createTouhouLaserCollisionState({kind:1,width:16,length:192});
const beamContact:TouhouLaserCollisionResult=updateTouhouLaserCollision(beamState,collisionPlayer,{},
 {onHit(laser,segment){const width:number=segment.width;},onGraze(laser,position,color){const palette:number=color;}});
cancelTouhouLaser(beamState,{x:0,y:120},80,80,0,true,{onSpawnStraight(parameters){return laserField.spawnStraight(parameters);}});
// @ts-expect-error Only the three implemented original laser families are supported.
laserField.spawnDriven(3);
// @ts-expect-error Viewport dimensions are numeric source-space geometry.
touhouBulletInCancelRectangle(contact,0,120,40,80,0,{x:-192,y:0,width:'384',height:448});

import {TouhouItems} from '@ts-stg/thlib/touhou';
import type {TouhouEnemyDropOptions,TouhouBossDropOptions} from '@ts-stg/thlib/touhou';
const sharedRewards=new TouhouItems({player:collisionPlayer});
const rewardOptions:TouhouEnemyDropOptions={counts:{power:15,point:15},centerType:'lifeFragment',radius:64};
sharedRewards.spawnEnemyDrops({x:0,y:128},rewardOptions);
const bossRewards:TouhouBossDropOptions={...rewardOptions,timedOut:false,survival:false,mode:0};
sharedRewards.spawnBossDrops({x:0,y:128},bossRewards);
// @ts-expect-error Item counts remain numeric across the external-consumer boundary.
sharedRewards.spawnEnemyDrops({x:0,y:128},{counts:{point:'15'}});

import {TouhouHealth,TouhouTimer,applyTouhouEnemyDamage} from '@ts-stg/thlib/touhou';
const protectedHealth=new TouhouHealth(3000,{spell:true}),protection=new TouhouTimer(120);
const unchangedHp:number=applyTouhouEnemyDamage(protectedHealth,70,{damageInvulnerability:protection,primaryFlags:0});

// Public scene transitions and phase clocks retain their types from root,
// touhou barrel and direct subpath imports in an independently installed SDK.
import {TouhouSceneTransition as RootTransition,TouhouBossPhaseTimeline as RootPhaseTimeline} from '@ts-stg/thlib';
import type {TouhouBossChargeOptions as RootChargeOptions} from '@ts-stg/thlib';
import {TouhouSceneTransition,TouhouBossPhaseTimeline} from '@ts-stg/thlib/touhou';
import {TouhouSceneTransition as SubpathTransition} from '@ts-stg/thlib/touhou/scene-transition';
import {TouhouBossPhaseTimeline as SubpathPhaseTimeline} from '@ts-stg/thlib/touhou/boss-phase-timeline';
import type {TouhouSceneTransitionOptions} from '@ts-stg/thlib/touhou/scene-transition';
import type {TouhouBossPhaseCue,TouhouBossPhaseTimelineOptions,TouhouBossPhaseTimelineSnapshot} from '@ts-stg/thlib/touhou/boss-phase-timeline';
import type {TouhouBossChargeOptions} from '@ts-stg/thlib/touhou/boss-presentation';
const transitionRoot:typeof TouhouSceneTransition=RootTransition;
const transitionSubpath:typeof TouhouSceneTransition=SubpathTransition;
const timelineRoot:typeof TouhouBossPhaseTimeline=RootPhaseTimeline;
const timelineSubpath:typeof TouhouBossPhaseTimeline=SubpathPhaseTimeline;
const transitionOptions:TouhouSceneTransitionOptions={bank:resources.createBank('screenswitch'),
 loadingBank:resources.createBank('ascii_960'),coverScripts:[3,4,5,6] as const,maskScript:null,loadingScript:17};
const transition=new SubpathTransition(transitionOptions);transition.update().reveal().draw(draw);
const transitionPhase:'cover'|'reveal'=transition.snapshot().phase;transition.destroy();
const transitioningApp=new TouhouApplication({resources,transitionOptions:{masked:true},
 createTransition(options,owner){const phaseOwner:TouhouApplication=owner;return new TouhouSceneTransition(options);}});
transitioningApp.startTransition({character:1,difficulty:2,mode:'practice'});
const advancedScene:boolean=transitioningApp.sceneUpdated;
const liveTransition:TouhouSceneTransition|null=transitioningApp.transition;
const earlyStageSelection=new TouhouStageSelect({bank:resources.createBank('title'),font:resources.font,
 entries:[{label:'Stage 1'}],onTransition(entry,index){const label:string=entry.label;const selected:number=index;transitioningApp.startTransition({mode:'practice'});}});
const disabledTransitionApp=new TouhouApplication({resources,transitionOptions:false});

type ConsumerPhaseCue={frame:number;kind:'charge';color:'green'|'blue';duration:number}|{frame:number;kind:'attack';pattern:'spiral'|'fan'};
const authoredCues:readonly ConsumerPhaseCue[]=[{frame:0,kind:'charge',color:'green',duration:40},{frame:40,kind:'attack',pattern:'spiral'}];
const timelineOptions:TouhouBossPhaseTimelineOptions<ConsumerPhaseCue>={attackStartFrame:40,patternLeadIn:10,cues:authoredCues,
 onCue(cue,owner){
  const sameOwner:TouhouBossPhaseTimeline<ConsumerPhaseCue>=owner;
  if(cue.kind==='charge'){
   const color:'green'|'blue'=cue.color;
   bossEffects.beginCharge({color,releaseFrame:cue.duration,clock:()=>owner.frame-cue.frame});
  }else{const pattern:'spiral'|'fan'=cue.pattern;}
  // @ts-expect-error Source cue records are immutable after scheduling.
  cue.frame=1;
 }};
const timeline=new SubpathPhaseTimeline<ConsumerPhaseCue>(timelineOptions);
const timelineState:TouhouBossPhaseTimelineSnapshot=timeline.update().snapshot();
const canRunPattern:boolean=timeline.patternReady;const attackStarted:boolean=timeline.attackStarted;
timeline.reset({cues:authoredCues,onCue:null}).dispatchCues();
const inferredTimeline=new TouhouBossPhaseTimeline({cues:[{frame:0,name:'intro',intensity:2}],
 onCue(cue){const intensity:number=cue.intensity;const name:string=cue.name;}});
const untypedMetadata:TouhouBossPhaseCue={frame:0,custom:'application metadata'};
// @ts-expect-error Unparameterized metadata remains unknown, never any.
const guessedMetadata:string=untypedMetadata.custom;
const clockedChargeOptions:TouhouBossChargeOptions={color:'blue',clock:()=>timeline.frame};
const rootChargeOptions:RootChargeOptions=clockedChargeOptions;
const independentlyClockedCharge=new TouhouBossCharge(resources.createBank('effect'),rootChargeOptions);
const internalClockCharge=new TouhouBossCharge(resources.createBank('effect'),{clock:null});

// @ts-expect-error A standalone transition requires a real ANM bank.
new TouhouSceneTransition({loadingBank:null});
// @ts-expect-error Durations are numeric fixed-frame values.
new TouhouSceneTransition({bank:transitionOptions.bank,coverFrames:'30'});
// @ts-expect-error The application accepts a transition configuration or false.
new TouhouApplication({resources,transitionOptions:true});
// @ts-expect-error The delayed start retains the ordinary selection contract.
app.startTransition({difficulty:'normal'});
// @ts-expect-error Selection callback index is a number.
new TouhouStageSelect({bank:titleBank,font:resources.font,entries:[{label:'Stage'}],onTransition:(entry,index:string)=>{}});
// @ts-expect-error Attack time is a numeric simulation frame.
new TouhouBossPhaseTimeline({attackStartFrame:'40'});
// @ts-expect-error Every cue has a numeric frame even with custom payloads.
new TouhouBossPhaseTimeline({cues:[{frame:'0',kind:'charge'}]});
// @ts-expect-error Generic cue payloads are preserved across reset.
timeline.reset({cues:[{frame:0,kind:'charge',color:'red',duration:40}]});
// @ts-expect-error Callers advance the phase clock through update, not direct writes.
timeline.frame=12;
// @ts-expect-error Charge clocks must be callable or null.
bossEffects.beginCharge({clock:10});
// @ts-expect-error A charge clock returns a numeric frame.
bossEffects.beginCharge({clock:()=> '10'});
// @ts-expect-error null disables the clock; a clock function cannot return null.
new TouhouBossCharge(resources.createBank('effect'),{clock:()=>null});

// Defeat choreography remains usable without a bank or native/browser globals.
import {TouhouBossDefeat as RootBossDefeat,TouhouBulletClearWave as RootClearWave} from '@ts-stg/thlib';
import {TouhouBossDefeat,TouhouBulletClearWave,TouhouRNG} from '@ts-stg/thlib/touhou';
import {TouhouBossDefeat as SubpathBossDefeat} from '@ts-stg/thlib/touhou/boss-defeat';
import {TouhouBulletClearWave as SubpathClearWave} from '@ts-stg/thlib/touhou/bullet-clear-wave';
import type {TouhouBossDefeatOptions,TouhouBossDefeatPosition} from '@ts-stg/thlib/touhou/boss-defeat';
import type {TouhouBulletClearWaveOptions,TouhouBulletClearWaveCancelOptions} from '@ts-stg/thlib/touhou/bullet-clear-wave';
const defeatRoot:typeof TouhouBossDefeat=RootBossDefeat;
const defeatSubpath:typeof TouhouBossDefeat=SubpathBossDefeat;
const waveRoot:typeof TouhouBulletClearWave=RootClearWave;
const waveSubpath:typeof TouhouBulletClearWave=SubpathClearWave;
const clearWaveOptions:TouhouBulletClearWaveOptions={x:20,y:120,initialRadius:16,radiusStep:6,maxRadius:640,
 cancelCircle(x,y,radius,options){
  const nearby:true=options.nearby;const drop:0=options.dropMode;const check:true=options.check;
  const optionsType:Readonly<TouhouBulletClearWaveCancelOptions>=options;
  const removed:number=configuredGame.bullets.cancelNearbyCircle(x,y,radius,{dropMode:drop});
  return removed+configuredGame.lasers.cancelCircle(x,y,radius,{check});
 }};
const clearWave=new SubpathClearWave(clearWaveOptions);
const waveRadius:number=clearWave.update().snapshot().radius;clearWave.destroy();
const sourceDefeatOptions:TouhouBossDefeatOptions={x:0,y:120,z:0,rng:new TouhouRNG(42),
 cancelCircle:clearWaveOptions.cancelCircle,
 clearAll(owner){const radius:number=owner.clearWave.radius;},
 onMove(position,owner){const typedPosition:TouhouBossDefeatPosition=position;const age:number=owner.age;},
 onBurst(owner){const done:boolean=owner.burst;const typedOwner:TouhouBossDefeat=owner;},
 sound(id,x){const sourceSound:number=id;const pan:number=x;},
};
const banklessDefeat=new SubpathBossDefeat(sourceDefeatOptions);
const defeatPosition:TouhouBossDefeatPosition=banklessDefeat.update().snapshot().position;
banklessDefeat.finish().destroy();
new TouhouBossDefeat({...sourceDefeatOptions,angle:0,rng:{next:()=>1,modulus:0x7fffffff}});
const defeatEnemy=configuredGame.spawnEnemy({x:0,y:120,hp:1});
const gameDefeat:TouhouBossDefeat|null=configuredGame.beginBossDefeat(defeatEnemy,{angle:0,speed:.4,delayFrames:60,source:'stage'});
configuredGame.beginBossDefeat();
const trackedDefeat:TouhouBossDefeat|undefined=configuredGame.bossDefeats[0]?.sequence;
if(gameDefeat){const frame:number=gameDefeat.snapshot().age;}

// @ts-expect-error A cancellation owner needs an actual callback.
new TouhouBulletClearWave({x:0,y:128});
// @ts-expect-error The fixed origin is immutable after construction.
clearWave.position.x=12;
// @ts-expect-error Wave callback radii use numeric source coordinates.
new TouhouBulletClearWave({cancelCircle:(x,y,radius:string)=>{}});
// @ts-expect-error Clearing geometry and reward policy retain numeric types.
configuredGame.bullets.cancelNearbyCircle(0,120,'16');
// @ts-expect-error Original nearby clearing has a numeric item drop mode.
configuredGame.bullets.cancelNearbyCircle(0,120,16,{dropMode:'none'});
// @ts-expect-error Boss defeat must provide its final whole-field clear.
new TouhouBossDefeat({cancelCircle:clearWaveOptions.cancelCircle});
// @ts-expect-error The bankless API needs no animation bank.
new TouhouBossDefeat({...sourceDefeatOptions,bank:titleBank});
// @ts-expect-error RNG integer samples remain numeric.
new TouhouBossDefeat({...sourceDefeatOptions,rng:{next:()=> 'random'}});
// @ts-expect-error The position callback receives a structured vector.
new TouhouBossDefeat({...sourceDefeatOptions,onMove:(position:number)=>{}});
// @ts-expect-error The game owns a real Enemy body, not just display metadata.
configuredGame.beginBossDefeat({x:0,y:120,hp:0});
// @ts-expect-error Fixed-frame duration is numeric.
configuredGame.beginBossDefeat(defeatEnemy,{delayFrames:'60'});
// @ts-expect-error Public Game installs its own cancellation adapters.
configuredGame.beginBossDefeat(defeatEnemy,{cancelCircle:clearWaveOptions.cancelCircle});

// An optional first-line entrance profile separates portrait, speaker, text
// and input timing while preserving the default immediate dialogue API.
import {TOUHOU_DIALOGUE_ENTRANCE_PRESETS as RootDialogueEntrance} from '@ts-stg/thlib';
import {TOUHOU_DIALOGUE_ENTRANCE_PRESETS} from '@ts-stg/thlib/touhou';
import type {TouhouDialogueEntranceTiming,TouhouDialogueEntranceState,TouhouDialogueEvent} from '@ts-stg/thlib/touhou/dialogue';
const rootEntrancePreset:typeof TOUHOU_DIALOGUE_ENTRANCE_PRESETS=RootDialogueEntrance;
const originalEntrance:Readonly<TouhouDialogueEntranceTiming>=TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss;
const customEntrance:TouhouDialogueEntranceTiming={portraitFrame:0,speakerFrame:8,textFrame:40,inputFrame:44};
const entranceEvent:TouhouDialogueEvent={type:'customPortrait',entranceStage:'portraits',asset:'my-portrait'};
const sourceDialogue=new TouhouDialogue({resources,steps:[{speaker:'left',text:'After battle',events:[entranceEvent]}],entrance:'afterBoss'});
const customTimedDialogue=new TouhouDialogue({resources,steps,entrance:customEntrance});
new TouhouDialogue({resources,steps,entrance:originalEntrance});
new TouhouDialogue({resources,steps,entrance:null});
sourceDialogue.update();customTimedDialogue.dispose();
const firstLineTiming:Readonly<TouhouDialogueEntranceTiming>|null=sourceDialogue.entranceTiming;
const firstLineState:TouhouDialogueEntranceState|null=sourceDialogue.entranceState;
const optionalEntranceState:TouhouDialogueEntranceState|undefined=sourceDialogue.snapshot().entrance;
if(optionalEntranceState){const inputOpen:boolean=optionalEntranceState.inputReady;const entranceFrame:number=optionalEntranceState.frame;}
// @ts-expect-error Preset timings are immutable.
TOUHOU_DIALOGUE_ENTRANCE_PRESETS.afterBoss.textFrame=10;
// @ts-expect-error A created dialogue retains immutable entrance timing.
sourceDialogue.entranceTiming=customEntrance;
// @ts-expect-error Only implemented named entrance profiles are accepted.
new TouhouDialogue({resources,steps,entrance:'bossIntro'});
// @ts-expect-error All four entrance milestones are required when customized.
new TouhouDialogue({resources,steps,entrance:{portraitFrame:0,textFrame:34}});
// @ts-expect-error Entrance clocks use numeric frames.
new TouhouDialogue({resources,steps,entrance:{...customEntrance,inputFrame:'38'}});
// @ts-expect-error Custom events retain the explicit entrance-stage vocabulary.
const wrongEntranceEvent:TouhouDialogueEvent={type:'custom',entranceStage:'middle'};

// Dialogue tails can hand control to stage clear before their portraits retire.
import {TOUHOU_DIALOGUE_EXIT_PRESETS as RootDialogueExit} from '@ts-stg/thlib';
import {TOUHOU_DIALOGUE_EXIT_PRESETS} from '@ts-stg/thlib/touhou';
import type {TouhouDialogueExitTiming,TouhouDialogueExitState} from '@ts-stg/thlib/touhou/dialogue';
const rootExitPreset:typeof TOUHOU_DIALOGUE_EXIT_PRESETS=RootDialogueExit;
const originalExit:Readonly<TouhouDialogueExitTiming>=TOUHOU_DIALOGUE_EXIT_PRESETS.afterBoss;
const customExit:TouhouDialogueExitTiming={completeFrame:40,handoffFrame:2};
const exitingDialogue=new TouhouDialogue({resources,steps,exit:'afterBoss',onExitHandoff(owner){
 const stillExiting:boolean=owner.exiting;const tail:TouhouDialogueExitState|null=owner.exitState;
}});
new TouhouDialogue({resources,steps,exit:customExit});
new TouhouDialogue({resources,steps,exit:originalExit});
new TouhouDialogue({resources,steps,exit:null});
const finishedDialogue:TouhouDialogue=exitingDialogue.finish();
const optionalExit:TouhouDialogueExitState|undefined=exitingDialogue.snapshot().exit;
const exitTiming:Readonly<Required<TouhouDialogueExitTiming>>|null=exitingDialogue.exitTiming;
if(optionalExit){const handedOff:boolean=optionalExit.handedOff;const exitFrame:number=optionalExit.frame;}
// @ts-expect-error Public exit profiles have explicitly supported names.
new TouhouDialogue({resources,steps,exit:'stageClear'});
// @ts-expect-error Every custom exit needs its completion frame.
new TouhouDialogue({resources,steps,exit:{handoffFrame:1}});
// @ts-expect-error Handoff callbacks receive the live dialogue owner.
new TouhouDialogue({resources,steps,onExitHandoff:(owner:number)=>{}});
// @ts-expect-error A live dialogue's exit timing is immutable.
exitingDialogue.exitTiming=customExit;

// Stage clear and normal stage transitions support independent bankless owners.
import {TouhouStageClear as RootStageClear,TouhouStageTransition as RootStageTransition} from '@ts-stg/thlib';
import {TouhouStageClear,TouhouStageTransition,TOUHOU_STAGE_CLEAR_PRESET,TOUHOU_STAGE_TRANSITION_PRESET} from '@ts-stg/thlib/touhou';
import {TouhouStageClear as SubpathStageClear} from '@ts-stg/thlib/touhou/stage-clear';
import {TouhouStageTransition as SubpathStageTransition} from '@ts-stg/thlib/touhou/stage-transition';
import type {TouhouStageClearOptions} from '@ts-stg/thlib/touhou/stage-clear';
import type {TouhouStageTransitionOptions} from '@ts-stg/thlib/touhou/stage-transition';
const stageClearRoot:typeof TouhouStageClear=RootStageClear;
const stageClearSubpath:typeof TouhouStageClear=SubpathStageClear;
const stageTransitionRoot:typeof TouhouStageTransition=RootStageTransition;
const stageTransitionSubpath:typeof TouhouStageTransition=SubpathStageTransition;
const clearPanelScript:111=TOUHOU_STAGE_CLEAR_PRESET.panelScript;
const stagePriority:10=TOUHOU_STAGE_TRANSITION_PRESET.drawPriority;
const stageClearOptions:TouhouStageClearOptions={bank:null,font:null,bonus:100000,rows:[{label:'Graze',value:42}],
 onAward(points,owner){const award:number=points;const sequence:TouhouStageClear=owner;},
 onDismiss(owner){const alive:boolean=owner.alive;},onComplete(owner){const complete:boolean=owner.completed;},
 drawSummary(output,owner,view){output.rect(view.x??0,view.y??0,16,16,0xffffffff);}
};
const banklessStageClear=new SubpathStageClear(stageClearOptions);
const clearPhase:'display'|'exit'|'done'=banklessStageClear.update(Keys.CONFIRM).snapshot().phase;
banklessStageClear.draw(draw,view);banklessStageClear.dismiss().finish().destroy();
new TouhouStageClear({bank:resources.createBank('front'),font:resources.font,initialMask:Keys.CONFIRM});
new TouhouStageClear();
const stageTransitionOptions:TouhouStageTransitionOptions={coverFrames:30,revealFrames:30,
 onCovered(owner){const black:number=owner.alpha;const sequence:TouhouStageTransition=owner;},
 onComplete(owner){const complete:boolean=owner.completed;}
};
const stageTransition=new SubpathStageTransition(stageTransitionOptions);
const stageTransitionPhase:'cover'|'reveal'|'done'=stageTransition.update().snapshot().phase;
stageTransition.draw(draw,{x:48,y:24,width:576,height:672});stageTransition.destroy();
new TouhouStageTransition();
// @ts-expect-error Score amounts remain numeric at the SDK boundary.
new TouhouStageClear({bonus:'100000'});
// @ts-expect-error Summary values are text or numbers, not arbitrary objects.
new TouhouStageClear({rows:[{label:'Graze',value:{count:1}}]});
// @ts-expect-error Award callbacks receive numeric points followed by their owner.
new TouhouStageClear({onAward:(points:string)=>{}});
// @ts-expect-error Stage flow frame durations are numeric.
new TouhouStageTransition({coverFrames:'30'});
// @ts-expect-error Background coverage callbacks receive the live transition.
new TouhouStageTransition({onCovered:(owner:number)=>{}});
// @ts-expect-error Alpha derives from the transition clock.
stageTransition.alpha=128;
// @ts-expect-error The normal stage transition is bankless.
new TouhouStageTransition({bank:titleBank});
// @ts-expect-error The restored panel preset is immutable.
TOUHOU_STAGE_CLEAR_PRESET.panelScript=112;

// Shared music fading injects gain updates and track retirement without a host.
import {TouhouMusicFade as RootMusicFade,touhouMusicVolume as rootMusicVolume} from '@ts-stg/thlib';
import {TouhouMusicFade,touhouMusicVolume} from '@ts-stg/thlib/touhou';
import {TouhouMusicFade as SubpathMusicFade} from '@ts-stg/thlib/touhou/music-fade';
import type {TouhouMusicFadeOptions,TouhouMusicFadeState} from '@ts-stg/thlib/touhou/music-fade';
const musicFadeRoot:typeof TouhouMusicFade=RootMusicFade;
const musicFadeSubpath:typeof TouhouMusicFade=SubpathMusicFade;
const musicVolumeRoot:typeof touhouMusicVolume=rootMusicVolume;
const sourceGain:number=touhouMusicVolume(-1200,75);
const musicFadeOptions:TouhouMusicFadeOptions={seconds:2,volume:75,
 setVolume(gain){const linearGain:number=gain;},stop(){}};
const musicFade=new SubpathMusicFade(musicFadeOptions);
const musicFadeState:TouhouMusicFadeState=musicFade.update().setVolume(50).snapshot();
const musicFramesRemaining:number=musicFade.remaining;
musicFade.destroy();new TouhouMusicFade();
// @ts-expect-error Configured volume is a numeric percentage.
new TouhouMusicFade({volume:'75'});
// @ts-expect-error Music callbacks receive the derived linear numeric gain.
new TouhouMusicFade({setVolume:(gain:string)=>{}});
// @ts-expect-error The fade clock is advanced through update().
musicFade.frame=40;
// @ts-expect-error Source attenuation is numeric hundredths of a decibel.
touhouMusicVolume('silent',100);

// Stage boundaries retire/reveal option visuals and reset transient player state.
const stagePlayer:TouhouPlayer=collisionPlayer.finishStageVisibility().updateStageVisibility();
const stageVisibility:boolean=stagePlayer.stageVisibility;
stagePlayer.drawStageVisibility(draw,view);
stagePlayer.restoreStageVisibility().resetForStage();
// @ts-expect-error Stage visibility drawing uses the public draw list contract.
stagePlayer.drawStageVisibility('draw',view);
// @ts-expect-error A stage reset preserves the existing player's persistent state.
stagePlayer.resetForStage({power:400});
