// SPDX-License-Identifier: GPL-3.0-only
// Rush contributes patterns, dialogue, and private stage/Boss artwork.
// Shared actors, effects, HUD, pause, results and selection pages belong to thlib.
import {DrawList,Keys,ReplayRecorder,ReplayPlayer,SaveStore} from '@ts-stg/thlib';
import {TouhouApplication,TouhouTitleMenu,TouhouStageSelect,TouhouButtons,
  TouhouHud,TouhouPause,TouhouGameOver,TouhouTextRenderer,TouhouStageClear,TouhouStageTransition,
  TOUHOU_STAGE_CLEAR_PRESET,createTouhouResources} from '@ts-stg/thlib/touhou';
import {BOSSES} from './catalog.js';
import {RushBattle} from './runtime.js';
import {RushDialogue} from './dialogue.js';
import {RushBossPortraits} from './boss-portraits.js';
import {RushPortraitGraphics} from './graphics-portrait.js';

export const RUSH_PORTRAIT_VIEW=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
// Restored explosion-shake timing changes visual snapshots and RNG checksums.
// Reject recordings from before this source timing correction.
export const RUSH_PORTRAIT_REPLAY_REVISION=18;
export const RUSH_PORTRAIT_SPELLS=Object.freeze(BOSSES.flatMap((boss,bossIndex)=>boss.phases.flatMap((phase,phaseIndex)=>
  phase.spell?[Object.freeze({bossIndex,phaseIndex,boss:boss.key,name:phase.name,cardId:phase.cardId,key:phase.key})]:[])));
const carriedFields=['lives','bombs','power','lifeFragments','bombFragments','graze','deaths','score','continues','highScore','pointValue','pointItems','extendCount','x','y'];
const soundAliases={se_ok00:7,se_cancel00:9,se_select00:10,se_pause:14};
const difficultyNames=['Easy','Normal','Hard','Lunatic'];

/** Authored entries composed with the common stage-list view. No Rush bitmap
 * menu, custom cursor repeat, or replacement settings drawing implementation. */
class RushPortraitPage {
  constructor(owner,kind,{close=()=>{},message='Replay saved'}={}){
    Object.assign(this,{owner,kind,close,message});this.done=false;this.disposed=false;this.buttons=new TouhouButtons();
    this.bank=owner.resources.createBank('title');
    const entries=kind==='options'?[{label:''},{label:''},{label:'Back'}]:kind==='manual'?[
      {label:'Arrow keys  Move'},{label:'Z / Enter  Fire / Confirm'},{label:'X  Bomb / Cancel'},
      {label:'Shift  Focus / Skip dialogue'},{label:'Escape  Pause / Exit replay'},
      {label:'Normal  Three stages in order'},{label:'Practice  Stage or single spell'},{label:'Back'},
    ]:kind==='replay'?[...owner.profile.replays.map((entry,index)=>{
      const compatible=entry.data?.config?.game==='rushboss-portrait'&&entry.data.config.revision===RUSH_PORTRAIT_REPLAY_REVISION;
      return{label:`${index+1}. ${compatible?'':'[Old version] '}${entry.label}`,replay:entry.data,enabled:compatible};
    }),{label:'Back'}]:[{label:message},{label:'Back'}];
    this.list=new TouhouStageSelect({bank:this.bank,font:owner.resources.font,entries,pageSize:8,headingScript:false,
      x:180,y:145,lineHeight:30,fontIndex:6,selection:kind==='manual'?entries.length-1:0,sound:id=>owner.resources.audio?.request(id),
      onCancel:()=>this.finish(),onSelect:(entry,index)=>{
        if(kind==='options'&&index<2){this.adjust(index,.1);this.list.active=true;this.list.phase=2;this.list.age=10;}
        else if(entry.replay){owner.playReplay(entry.replay);this.finish(false);}
        else this.finish();
      }});
    this.refresh();
  }
  refresh(){if(this.kind==='options'){
    this.list.entries[0].label=`BGM Volume       ${Math.round(this.owner.profile.musicVolume*100)}%`;
    this.list.entries[1].label=`Sound Volume     ${Math.round(this.owner.profile.soundVolume*100)}%`;
  }}
  adjust(index,amount){const key=index===0?'musicVolume':'soundVolume';this.owner.setVolume(key,Math.max(0,Math.min(1,this.owner.profile[key]+amount)));this.refresh();}
  update(mask=0){
    if(this.done)return;this.buttons.update(mask);
    if(this.kind==='options'&&this.list.phase===2&&this.list.selection<2){
      if(this.buttons.repeat(Keys.LEFT))this.adjust(this.list.selection,-.1);
      if(this.buttons.repeat(Keys.RIGHT))this.adjust(this.list.selection,.1);
      mask&=~(Keys.LEFT|Keys.RIGHT);
    }
    this.list.update(mask);this.bank.update();
  }
  draw(draw){
    const title={options:'Option',manual:'Manual',replay:'Replay',message:'Replay'}[this.kind];
    this.owner.resources.font.draw(draw,title,{x:320,y:94,font:7,alignX:0,color:0xffffff00,shadowColor:0xff202040});
    if(this.kind==='replay'&&!this.owner.profile.replays.length)this.owner.resources.font.draw(draw,'No saved replay',{x:180,y:115,font:0,color:0xffffffff});
    this.list.draw(draw);return draw;
  }
  finish(notify=true){if(this.done)return;this.done=true;this.dispose();if(notify)this.close();}
  dispose(){if(this.disposed)return;this.disposed=true;this.list.destroy();this.bank.dispose();}
}

/** Business content is supplied to the source title/difficulty/character/list
 * pages; this class contains no replacement title animation or drawing skin. */
class RushPortraitMenu extends TouhouTitleMenu {
  constructor(options,owner){
    const launch=options.onStart,select=options.onSelect;
    super({...options,onStart:selected=>this.chooseContent(selected),onSelect:index=>[4,7,8].includes(index)?this.openUtilityPage(index):select?.(index,this)});
    this.owner=owner;this.launch=launch;this.content=null;this.selected=null;this.labelTextures=new Map();
    this.textBank=null;this.textRenderer=null;this.external=null;
  }
  openUtilityPage(index){
    this.state='page';this.finished=false;
    this.external=new RushPortraitPage(this.owner,{4:'replay',7:'options',8:'manual'}[index],{close:()=>{
      this.external=null;this.returnMain();this.selection=index;
    }});
  }
  returnMain(){
    const returning=this.state!=='main';
    super.returnMain();
    if(returning)this.owner.graphics.playMusic?.('title',{restart:true});
  }
  chooseContent(selected){
    this.selected=selected;
    if(selected.mode==='normal'){this.launch({...selected,bossIndex:0,phaseIndex:0});return;}
    const spells=selected.mode==='spell';
    const entries=spells?RUSH_PORTRAIT_SPELLS.map((card,index)=>({...card,label:card.name,number:index+1})):
      BOSSES.map((boss,bossIndex)=>({label:`Stage ${bossIndex+1}`,bossIndex,phaseIndex:0}));
    // Original stage selection heading/timing; authored card labels are the
    // only game-specific content. A text adapter retains the common GDI profile.
    this.content=new TouhouStageSelect({bank:this.bank,font:this.font,entries,pageSize:spells?8:6,
      x:spells?256:330,y:spells?130:170,lineHeight:spells?32:34,
      sound:this.sound,drawLabel:spells?(draw,entry,style)=>this.drawCardLabel(draw,entry,style):undefined,
      // StageSelect starts source shutters at age10; the application swaps
      // at age40. Keep the page alive beneath the cover until scene disposal.
      onTransition:entry=>this.launch({...selected,bossIndex:entry.bossIndex,phaseIndex:entry.phaseIndex}),
      onCancel:()=>{this.content.destroy();this.content=null;this.finished=false;this.openCharacter();},
    });
    this.finished=false;
  }
  drawCardLabel(draw,entry,{x,y,color}){
    const host=this.owner.host;
    if(host?.rasterizeBitmapText&&host?.encodeText&&host?.createTexture){
      let handle=this.labelTextures.get(entry.key);
      if(handle===undefined){
        if(!this.textBank){this.textBank=this.owner.resources.createBank('text');this.textRenderer=new TouhouTextRenderer({host,bank:this.textBank});}
        const bitmap=this.textRenderer.rasterize(`${String(entry.number).padStart(2,'0')} ${entry.name}`,
          {width:768,height:40,font:4,color:0xffffff,shadowColor:0xff000000,codePage:936});
        handle=host.createTexture(bitmap.width,bitmap.height,bitmap.pixels);this.labelTextures.set(entry.key,handle);
      }
      const rgba=((color<<8)|(color>>>24))>>>0;
      draw.sprite(handle,x*1.5+270,y*1.5+15,540,30,0,rgba);
    }else{
      // Portable data-only consumers have no system-font service; keep every
      // card selectable under a stable number rather than inventing glyphs.
      this.font.draw(draw,`${String(entry.number).padStart(2,'0')} ${BOSSES[entry.bossIndex].name}`,{font:7,x,y,color});
    }
  }
  update(mask=0){
    if(this.external){this.external.update(mask);this.bank.update();this.decorationBank?.update();this.background?.update();return;}
    if(!this.content){super.update(mask);return;}
    this.content.update(mask);this.bank.update();this.decorationBank?.update();this.background?.update();
  }
  draw(draw){super.draw(draw);this.content?.draw(draw);this.external?.draw(draw);return draw;}
  snapshot(){return{...super.snapshot(),content:this.content?.snapshot()??null,mode:this.selected?.mode??this.mode??null};}
  destroy(){
    if(this.destroyed)return;this.content?.destroy();this.content=null;this.external?.dispose();this.external=null;
    for(const handle of this.labelTextures.values())this.owner.host.unloadTexture?.(handle);this.labelTextures.clear();
    this.textRenderer?.dispose();this.textBank?.dispose();super.destroy();
  }
}

export class RushPortraitSession {
  constructor(options,owner,selection,settings=owner.options){
    this.options=options;this.owner=owner;this.selection={...selection};this.mode=selection.mode??'normal';
    this.settings=settings;
    this.banks=options.banks;this.resources=owner.resources;this.graphics=owner.graphics;this.font=options.font;
    this.buttons=new TouhouButtons();this.drawList=new DrawList();this.frame=0;this.age=0;this.state='before';
    this.paused=false;this.pauseVisual=null;this.pauseCapture=options.pauseCapture;this.destroyed=false;
    this.pending=null;this.dialogue=null;this.battle=null;this.completedBattles=[];this.completed=false;
    this.stageClear=null;this.stageTransition=null;this.inputMask=0;this.recordedBoss=-1;
    this.session={difficulty:selection.difficulty,mode:this.mode==='normal'?0:this.mode==='spell'?2:1,
      stage:(selection.bossIndex??0)+1,continues:0,highScore:settings.highScore??owner.highScore,...settings.session};
    this.hud=new TouhouHud({bank:this.banks.front,textBank:this.banks.ascii_960,font:this.font,character:selection.character,difficulty:selection.difficulty});
    // Battle's shared Boss HUD owns the moving lower-screen Enemy pointer.
    // The general HUD's unused pointer must not leave a duplicate at the origin.
    this.hud.roots[1].visible=false;
    this.onRestart=()=>options.onRestart?.();this.onExit=()=>options.onExit?.();
    this.startBoss(selection.bossIndex??0,selection.phaseIndex??0);
  }
  music(key,options){this.graphics.playMusic?.(key,options);this.owner.options.onMusic?.(key,this);}
  dialogueMusic(event){
    if(typeof event==='string'){this.music(event);return;}
    if(event.action==='stop')this.graphics.stopMusic?.();
    else if(event.action==='play')this.music(event.track);
    else if(event.action==='caption'){this.graphics.showMusicCaption?.(event.text);this.owner.options.onMusicCaption?.(event.text,this);}
  }
  sound(id,x=0){this.resources.audio?.request(id,x);}
  disposeBattle(){
    this.dialogue?.dispose();this.dialogue=null;this.graphics.clearBattle?.();
    if(this.battle?.dispose)this.battle.dispose();
    else if(this.battle){this.battle.presentation?.dispose();this.battle.bulletVisuals?.dispose();this.battle.playerAdapter?.dispose();this.battle.world?.clear();}
    this.battle=null;
  }
  capturePlayer(){
    const result={},player=this.battle.sharedPlayer;
    for(const field of carriedFields)result[field]=player[field];
    result.battleScore=this.battle.score;result.continues=this.session.continues;return result;
  }
  startBoss(index,phaseIndex=0,carried=null){
    if(!BOSSES[index])throw new RangeError(`Unknown Rush stage ${index}`);
    this.disposeBattle();this.bossIndex=index;this.phaseIndex=phaseIndex;this.session.stage=index+1;
    this.recordedBoss=-1;
    const spec=BOSSES[index],factory=this.settings.createBattle??((phases,config)=>new RushBattle(phases,config));
    this.battle=factory(spec.phases,{boss:spec.key,profile:'portrait',deferStart:true,
      difficulty:this.selection.difficulty,character:this.selection.character,seed:this.settings.seed??0,
      practice:this.mode==='spell',spellIndex:phaseIndex,invincible:!!this.settings.invincible,
      resources:this.resources,assets:{playSound:key=>this.owner.playSound(key)},
      onHudNotice:(type,value)=>this.hud.notice(type,value,{spell:this.battle?.presentation?.shared?.spell})});
    const spell=this.battle.presentation?.shared?.spell;
    if(spell){
      spell.playback=!!this.owner.playback;
      spell.context.writeSpellTime=(_stage,captureIndex,value)=>{
        const times=this.owner.recorder?.config.spellTimes;if(times)times[`${index}:${captureIndex}`]=value;
      };
      spell.context.readSpellTime=(_stage,captureIndex)=>this.owner.playback?.data.config.spellTimes?.[`${index}:${captureIndex}`]??0;
    }
    const player=this.battle.sharedPlayer;
    if(carried){
      for(const field of carriedFields)if(carried[field]!==undefined)player[field]=carried[field];
      player.setPosition?.(carried.x,carried.y);player.setPower?.(carried.power);
      this.battle.score=carried.battleScore;this.battle.graze=carried.graze;
    }else{player.setPower(this.settings.power??(this.mode==='normal'?100:400));player.bombs=this.settings.bombs??2;player.lives=this.settings.lives??2;}
    player.continues=this.session.continues;player.highScore=this.session.highScore;
    this.hud.update(player);this.state='before';this.age=0;this.pending=null;
    this.battle.setDialogue(true);
    this.restartCombatMusic=this.mode==='spell'||!!this.settings.skipDialogue;
    if(this.restartCombatMusic){this.battle.revealBoss({mode:'flyIn'});this.beginCombat();}
    else{this.music(spec.key==='artia'?'frozenforest':'gamestart',{restart:true});this.openDialogue('before');}
  }
  openDialogue(phase){
    this.dialogue?.dispose();this.dialogue=null;this.state=phase;this.age=0;this.battle.setDialogue(true);
    const create=this.settings.createDialogue??((resources,config)=>new RushDialogue(resources,config));
    const portraits=typeof this.graphics.drawBossPortrait==='function'?new RushBossPortraits({bossId:BOSSES[this.bossIndex].key,graphics:this.graphics}):null;
    this.dialogue=create(this.resources,{bossId:BOSSES[this.bossIndex].key,character:this.selection.character,phase,
      ...(phase==='after'?{entrance:'afterBoss',startDelayFrames:0}:{}),
      exit:phase==='after'?'afterBoss':'beforeBoss',
      playerPortrait:this.settings.playerPortrait,
      onRevealBoss:()=>this.battle.revealBoss(),onMusic:event=>this.dialogueMusic(event),
      onEvent:portraits?((event,step,dialogue)=>portraits.dialogueEvent(event,step,dialogue)):undefined,
      drawPortrait:portraits?((draw,step,dialogue,view)=>portraits.drawDialogue(draw,step,dialogue,view)):undefined,
      onExitHandoff:phase==='after'?(()=>this.beginStageClear()):undefined,
      onComplete:()=>{if(phase==='before')this.pending='combat';else if(!this.stageClear&&!this.stageTransition)this.pending='complete';}});
    if(this.dialogue?.complete)this.pending=phase==='before'?'combat':'complete';
  }
  beginCombat(){
    this.dialogue?.dispose();this.dialogue=null;this.pending=null;
    if(!this.battle.boss.alive)this.battle.revealBoss();
    // Fast dialogue skipping must not expose an attacking invisible Boss.
    // The presentation owns readiness; attack scripts start only afterwards.
    if(!this.battle.entranceReady){this.state='entrance';this.battle.setDialogue(true);return;}
    this.state='combat';this.age=0;this.music(BOSSES[this.bossIndex].music,{restart:this.restartCombatMusic});this.restartCombatMusic=false;
    this.battle.setDialogue(false);this.battle.startCombat(this.phaseIndex);
  }
  get endingFeedbackActive(){return this.hud.activeNotice||!!this.battle.presentation?.shared?.hasDeathEffects;}
  finishCombatPresentation(){
    if(this.mode==='spell'||this.settings.skipDialogue){
      // Result pages freeze simulation, so preserve their visual tail first.
      if(!this.endingFeedbackActive)this.pending='complete';return;
    }
    // st01/st03/st04/st06 MainBoss waits60 after the Boss slot disappears.
    // Dialogue can coexist with death particles and bonus feedback.
    if(this.age>=60)this.openDialogue('after');
  }
  finishBoss(){
    if(this.mode==='spell'){this.recordBoss();this.openResult(true);return;}
    this.beginStageClear();
  }
  recordBoss(){
    if(this.recordedBoss===this.bossIndex)return;
    this.recordedBoss=this.bossIndex;
    this.completedBattles.push({boss:BOSSES[this.bossIndex].key,results:this.battle.results.map(result=>({...result}))});
  }
  beginStageClear(){
    if(this.stageClear||this.stageTransition||this.destroyed)return;
    this.recordBoss();this.state='stageClear';this.age=0;this.battle.setDialogue(true);
    // Only the generic panel and timing are shared. This Demo has no stone
    // scoring; it does not copy the original game's four stone-level rows.
    this.stageClear=new TouhouStageClear({...this.settings.stageClearTiming,
      bank:this.banks.front,font:this.font,initialMask:this.inputMask,
      onDismiss:()=>this.graphics.fadeMusic?.(TOUHOU_STAGE_CLEAR_PRESET.musicFadeSeconds),
      onComplete:()=>{this.pending='nextStage';}});
  }
  beginNextStage(){
    this.stageClear?.destroy();this.stageClear=null;
    if(this.mode!=='normal'||this.bossIndex===BOSSES.length-1){this.openResult(true);return;}
    this.state='stageTransition';this.age=0;
    this.battle.sharedPlayer.finishStageVisibility();
    for(const item of this.battle.playerAdapter.items.items)this.battle.playerAdapter.items.retire(item);
    this.stageTransition=new TouhouStageTransition({...this.settings.stageTransitionTiming,
      onCovered:()=>{
        const carried=this.capturePlayer();this.startBoss(this.bossIndex+1,0,carried);
      }});
  }
  openPause(mask){
    this.paused=true;this.graphics.pauseMusic?.();
    this.pauseVisual=new TouhouPause({bank:this.banks.front,capture:this.pauseCapture,initialMask:mask,
      continues:this.session.continues,sound:id=>this.sound(id),
      onResume:()=>{this.paused=false;this.graphics.resumeMusic?.();},onRestart:this.onRestart,onExit:this.onExit,
      onReplay:context=>this.replayPage(context),onOptions:({close})=>new RushPortraitPage(this.owner,'options',{close}),
      onManual:({close})=>new RushPortraitPage(this.owner,'manual',{close})});
  }
  replayPage({close,pause}){
    this.owner.saveRequested=true;
    // The source pause choice promises Save Replay and Return to Title. Keep
    // the session alive through this frame's save, then leave on acknowledgement.
    const finish=pause instanceof TouhouPause?()=>{pause.external=null;this.onExit();}:close;
    return new RushPortraitPage(this.owner,'message',{close:finish});
  }
  openResult(completed,mask=0){
    this.completed=completed;this.state=completed?'result':'gameover';this.paused=true;
    this.dialogue?.dispose();this.dialogue=null;this.pauseCapture?.capture();
    this.battle.sharedPlayer.score=Math.floor(this.battle.score/10);
    this.pauseVisual=new TouhouGameOver({bank:this.banks.front,font:this.font,player:this.battle.sharedPlayer,
      ...this.options.gameOverOptions,session:this.session,completed,initialMask:mask,sound:id=>this.sound(id),
      onExit:this.onExit,onRestart:this.onRestart,drawBackground:this.pauseCapture?(draw=>this.pauseCapture.draw(draw)):undefined,
      onReplay:context=>this.replayPage(context),onOptions:({close})=>new RushPortraitPage(this.owner,'options',{close}),
      onManual:({close})=>new RushPortraitPage(this.owner,'manual',{close}),
      onContinue:()=>{
        this.battle.gameOver=false;this.battle.score=0;this.battle.sharedPlayer.continues=this.session.continues;
        this.battle.playerAdapter.spell.fail('continue');this.paused=false;this.state='combat';this.pauseCapture?.destroy();
      }});
    this.owner.highScore=Math.max(this.owner.highScore,Math.floor(this.battle.score/10));
    if(!this.owner.playback){this.owner.profile.highScore=this.owner.highScore;this.owner.saveProfile();}
  }
  update(mask=0){
    if(this.destroyed)return;this.buttons.update(mask);
    if(this.paused){this.pauseVisual.update(mask);if(this.pauseVisual instanceof TouhouGameOver){this.pauseCapture?.update();this.graphics.updateMusic?.();}return;}
    if((this.buttons.pressed&Keys.PAUSE)&&this.frame>0){this.openPause(mask);return;}
    this.inputMask=mask;this.graphics.updateMusic?.();
    // Owners born from a dialogue/update callback start at frame0. A stage
    // switch happens only after the old background is completely covered.
    const clear=this.stageClear,transition=this.stageTransition;
    if(transition?.phase==='cover'){
      // Source cover disables the enemy-bullet owner, while the Player's
      // ordinary callback and registered ANM continue beneath the overlay.
      this.battle.playerAdapter.update(mask);
      this.battle.playerAdapter.afterBulletUpdate();
      this.graphics.advanceStageBackground?.();
    }else this.battle.update(mask);
    this.hud.update(this.battle.sharedPlayer);this.frame++;this.age++;
    if(this.dialogue&&!this.dialogue.complete)this.dialogue.update(mask);
    if(this.state==='before'||this.state==='after'){
      if(this.dialogue?.complete)this.pending=this.state==='before'?'combat':'complete';
    }else if(this.state==='entrance'){
      if(this.battle.entranceReady)this.beginCombat();
    }else if(this.state==='combat'){
      if(this.battle.gameOver)this.openResult(false,mask);
      else if(this.battle.finished){
        // Results pause the entire scene. Let the common ANM owners finish
        // their death inversion and reward feedback before that capture.
        this.state='ending';this.age=0;this.finishCombatPresentation();
      }
    }else if(this.state==='ending'){
      this.finishCombatPresentation();
    }
    clear?.update(mask);transition?.update();
    if(transition&&!transition.alive){transition.destroy();if(this.stageTransition===transition)this.stageTransition=null;}
    const pending=this.pending;this.pending=null;
    if(pending==='combat')this.beginCombat();else if(pending==='complete')this.finishBoss();else if(pending==='nextStage')this.beginNextStage();
  }
  render(){
    const draw=this.drawList.reset();this.graphics.draw(draw,this.battle,{hud:this.hud,hideHudNumbers:this.paused,dialogue:this.dialogue,
      stageClear:this.stageClear,stageTransition:this.stageTransition});
    this.dialogue?.draw(draw,RUSH_PORTRAIT_VIEW);if(this.paused)this.pauseVisual.draw(draw);return draw.commands;
  }
  postFrame(nowSeconds){return this.battle?.presentation?.shared?.spell?.postFrame(nowSeconds);}
  snapshot(){return{frame:this.frame,state:this.state,age:this.age,paused:this.paused,mode:this.mode,bossIndex:this.bossIndex,
    session:{...this.session},completed:this.completed,completedBattles:this.completedBattles,
    dialogue:this.dialogue?.snapshot?.()??null,stageClear:this.stageClear?.snapshot()??null,stageTransition:this.stageTransition?.snapshot()??null,
    pause:this.paused?this.pauseVisual?.snapshot():null,battle:this.battle?.snapshot()??null};}
  destroy(){
    if(this.destroyed)return;this.destroyed=true;this.stageClear?.destroy();this.stageTransition?.destroy();this.pauseVisual?.external?.dispose?.();this.pauseVisual?.destroy();this.pauseCapture?.destroy();this.hud.destroy();this.disposeBattle();
  }
}

export class RushPortraitApplication {
  constructor(host,options={}){
    this.host=host;this.options=options;this.resources=options.resources??createTouhouResources(host);this.ownResources=!options.resources;
    this.graphics=options.graphics??new RushPortraitGraphics(host,this.resources,options);this.ownGraphics=!options.graphics;
    // Native writeText is rooted at project/userdata; readText uses project root.
    this.store=options.store??new SaveStore(host?.writeText?{readText:name=>host.readText(`userdata/${name}`),writeText:(name,value)=>host.writeText(name,value)}:null,'rush-portrait');
    const saved=this.store.get('profile',{});
    this.profile={musicVolume:.7,soundVolume:1,highScore:0,replays:[],nextReplay:1,...saved};
    for(const [key,fallback]of[['musicVolume',.7],['soundVolume',1]])this.profile[key]=Number.isFinite(this.profile[key])?Math.max(0,Math.min(1,this.profile[key])):fallback;
    this.profile.highScore=Number.isFinite(this.profile.highScore)?Math.max(0,this.profile.highScore):0;
    this.profile.nextReplay=Number.isSafeInteger(this.profile.nextReplay)&&this.profile.nextReplay>0?this.profile.nextReplay:1;
    this.profile.replays=Array.isArray(this.profile.replays)?this.profile.replays.slice(0,5):[];
    this.highScore=this.profile.highScore;this.frame=0;this.disposed=false;this.liveButtons=new TouhouButtons();
    this.recorder=null;this.playback=null;this.pendingReplay=null;this.recordedGame=null;this.recordingComplete=false;this.saveRequested=false;
    this.graphics.options??={};this.graphics.options.musicVolume=this.profile.musicVolume;
    this.graphics.setMusicVolume?.(this.profile.musicVolume);
    if(this.resources.audio)this.resources.audio.volume=this.profile.soundVolume*100;
    const first={difficulty:options.difficulty??1,character:options.character??0,mode:options.mode??'normal',bossIndex:0,phaseIndex:0};
    if(options.startBoss!==undefined){
      first.bossIndex=typeof options.startBoss==='number'?options.startBoss:BOSSES.findIndex(boss=>boss.key===options.startBoss);
      if(first.bossIndex<0||first.bossIndex>=BOSSES.length)throw new RangeError('Unknown Rush Boss');
      first.phaseIndex=options.phaseIndex??0;first.mode=options.mode??(options.practice?'spell':'normal');
    }
    this.application=new TouhouApplication({resources:this.resources,clock:options.clock??null,musicPlayer:this.graphics.musicPlayer,
      pixels:host?.readTexturePixels&&host?.updateTexture?host:null,initialSelection:first,
      autostart:options.startBoss!==undefined||!!options.autostart,
      menuOptions:{background:this.graphics.title??this.graphics.createTitleBackground?.(),
        excluded:[1,5,6],startModes:{0:'normal',2:'stage',3:'spell'},sound:id=>this.resources.audio?.request(id)},
      createMenu:config=>new RushPortraitMenu(config,this),
      createGame:(config,app)=>this.createSession(config,app.selection,app),
      onSceneChange:({mode})=>{if(mode==='title'){this.playback=null;this.recordedGame=null;this.graphics.playMusic?.('title',{restart:true});}},
      onAfterUpdate:()=>this.resources.audio?.flush(),onQuit:()=>host?.quit?.(),
    });
  }
  saveProfile(){this.store.set('profile',this.profile);}
  setVolume(key,value){
    this.profile[key]=Math.round(value*10)/10;
    if(key==='soundVolume'){if(this.resources.audio)this.resources.audio.volume=this.profile.soundVolume*100;}
    else{
      this.graphics.options.musicVolume=this.profile.musicVolume;
      this.graphics.setMusicVolume?.(this.profile.musicVolume);
    }
    if(!this.playback)this.saveProfile();
  }
  createSession(config,selection,application=this.application){
    const replay=this.pendingReplay;this.pendingReplay=null;this.playback=replay?new ReplayPlayer(replay):null;
    // The common spell owner stores source encoded times in the replay. Replay
    // never measures the viewer's wall clock; old recordings had no clock hook.
    application.clock=replay?(replay.config.spellClock?()=>0:null):this.options.clock??null;
    const settings={...this.options,...replay?.config.settings};
    const game=new RushPortraitSession(config,this,selection,settings);
    this.recordedGame=game;this.recordingComplete=false;this.saveRequested=false;
    const stored={highScore:game.session.highScore,session:{...game.session},seed:settings.seed??0,
      skipDialogue:!!settings.skipDialogue,invincible:!!settings.invincible,
      stageClearTiming:{...settings.stageClearTiming},stageTransitionTiming:{...settings.stageTransitionTiming},
      power:settings.power??(game.mode==='normal'?100:400),bombs:settings.bombs??2,lives:settings.lives??2};
    this.recorder=replay?null:new ReplayRecorder({game:'rushboss-portrait',revision:RUSH_PORTRAIT_REPLAY_REVISION,selection:{...selection},settings:stored,
      spellClock:!!application.clock,spellTimes:{}});
    return game;
  }
  exportReplay(){
    if(!this.recorder)return this.lastReplay??null;
    const game=this.application.game;
    if(game===this.recordedGame&&this.recorder.checkpoints.at(-1)?.frame!==this.recorder.frames)this.recorder.checkpoint(game.snapshot());
    return this.recorder.toJSON();
  }
  saveReplay(){
    if(this.playback)return null;const data=this.exportReplay();if(!data)return null;
    this.lastReplay=data;const id=this.profile.nextReplay++,selection=data.config.selection;
    this.profile.replays.unshift({id,label:`${selection.mode} ${selection.character?'Marisa':'Reimu'} ${difficultyNames[selection.difficulty]} ${data.frames}f`,data});
    this.profile.replays.length=Math.min(5,this.profile.replays.length);this.saveProfile();return data;
  }
  playReplay(source){
    const replay=new ReplayPlayer(source),data=replay.data;
    if(data.config.game!=='rushboss-portrait'||data.config.revision!==RUSH_PORTRAIT_REPLAY_REVISION)throw new Error('Replay belongs to a different game revision');
    this.pendingReplay=data;this.application.start(data.config.selection);return this;
  }
  playSound(key){
    const manifest=this.resources.audioManifest;let id=soundAliases[key];
    if(id===undefined&&manifest?.files){
      const file=manifest.files.findIndex(entry=>entry.name===`${key}.wav`);
      id=manifest.definitions.find(entry=>entry.fileIndex===file)?.id;
    }
    if(Number.isInteger(id)&&id>=0)this.resources.audio?.request(id);
  }
  get battle(){return this.application.game?.battle??null;}
  get screen(){return this.application.mode==='title'?'title':'battle';}
  update(mask=0){
    if(this.disposed)return;this.liveButtons.update(mask);
    if(this.playback&&(this.liveButtons.pressed&(Keys.PAUSE|Keys.CANCEL))){this.application.openMenu();this.frame++;return;}
    if(this.playback?.finished){this.frame++;return;}
    const game=this.application.game,advancing=this.application.transition?.phase!=='cover',
      record=advancing&&this.recorder&&game===this.recordedGame&&!this.recordingComplete;
    if(this.playback&&advancing)mask=this.playback.next();else if(record)this.recorder.record(mask);
    this.application.update(mask);this.frame++;
    if(this.application.sceneUpdated&&this.application.game===game&&game){
      if(this.playback)this.playback.verify(game.snapshot());
      else if(record){
        if(this.recorder.frames%60===0||game.completed||this.saveRequested)this.recorder.checkpoint(game.snapshot());
        if(game.completed){this.recordingComplete=true;this.lastReplay=this.recorder.toJSON();}
      }
    }
    if(this.saveRequested){this.saveRequested=false;if(!this.playback)this.saveReplay();}
  }
  render(){
    if(this.disposed)return[];const commands=this.application.render();
    if(this.playback){const draw=new DrawList();this.resources.font.draw(draw,this.playback.finished?'Playback complete - Escape':'Playback - Escape to exit',
      {font:0,x:34,y:464,color:0xffffff00});commands.push(...draw.commands);}
    return commands;
  }
  postFrame(nowSeconds){return this.application.postFrame(nowSeconds);}
  start(selection){this.application.start(selection);return this;}
  snapshot(){return{format:'ts-stg-rushboss-portrait-v1',frame:this.frame,screen:this.screen,
    selection:{...this.application.selection},application:this.application.snapshot(),graphics:this.graphics.snapshot?.()??null,
    replay:{playing:!!this.playback,frame:this.playback?.frame??0,frames:this.playback?.data.frames??this.recorder?.frames??0,complete:this.playback?.finished??false},
    profile:{musicVolume:this.profile.musicVolume,soundVolume:this.profile.soundVolume,highScore:this.profile.highScore,replays:this.profile.replays.length}};}
  destroy(){if(this.disposed)return;this.disposed=true;this.application.destroy();if(this.ownGraphics)this.graphics.dispose();if(this.ownResources)this.resources.dispose();}
}

export const createRushPortraitGame=(host,options)=>new RushPortraitApplication(host,options);
