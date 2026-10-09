// SPDX-License-Identifier: GPL-3.0-only
import type {NativeHost} from '@ts-stg/thlib';
import type {TouhouResources} from '@ts-stg/thlib/touhou';
import type {RushAssets} from './assets.js';
import type {RushMenuView,RushTitleTransition} from './title.js';
import type {BossKey} from './types.js';
export interface RushGameOptions{resources?:TouhouResources;difficulty?:number;character?:number;startBoss?:BossKey|number;practice?:boolean;phaseIndex?:number;invincible?:boolean;}
import { DrawList, Input, Keys, createTouhouResources } from '@ts-stg/thlib';
import { BOSSES } from './catalog.js';
import { createRushAssets } from './assets.js';
import { drawTitle, TITLE_TIMING, titleTransitionPlan } from './title.js';
import { RushBattle } from './runtime.js';
import { RushGraphics } from './graphics.js';

export class RushGame {
  declare input: Input;
  declare drawList: DrawList;
  declare frame: number;
  declare titleFrame: number;
  declare screenFrame: number;
  declare screen: string;
  declare selection: number;
  declare difficulty: number;
  declare character: number;
  declare bossIndex: number;
  declare spellIndex: number;
  declare practice: boolean;
  declare paused: boolean;
  declare pauseSelection: number;
  declare mainSelection: number;
  declare quitRequested: boolean;
  declare soundVolume: number;
  declare bgmVolume: number;

 declare host:NativeHost;declare assets:RushAssets;declare graphics:RushGraphics;declare touhouResources:TouhouResources;declare options:RushGameOptions;declare transition:RushTitleTransition|null;declare musicId:number|null;declare battle:RushBattle|null;declare lastStart:{bossIndex:number;phaseIndex:number;practice:boolean;difficulty:number;character:number}|null;declare selectionFrame:number|undefined;
  constructor(host:NativeHost,options:RushGameOptions={}) {
    this.host=host;this.assets=createRushAssets(host);this.graphics=new RushGraphics(host,this.assets);
    this.touhouResources=options.resources??createTouhouResources(host);
    this.input=new Input();this.drawList=new DrawList();this.frame=0;this.titleFrame=0;this.screenFrame=0;
    this.screen='title';this.selection=0;this.difficulty=options.difficulty??1;this.character=options.character??0;
    this.bossIndex=0;this.spellIndex=0;this.practice=false;this.paused=false;this.pauseSelection=0;
    this.transition=null;this.mainSelection=0;this.quitRequested=false;
    this.soundVolume=1;this.bgmVolume=.7;this.musicId=null;this.battle=null;this.lastStart=null;this.options=options;
    this.update=this.update.bind(this);this.render=this.render.bind(this);this.snapshot=this.snapshot.bind(this);
    this.setMusic('title');
    if(options.startBoss!==undefined){this.bossIndex=typeof options.startBoss==='number'?options.startBoss:BOSSES.findIndex(b=>b.key===options.startBoss);
      if(this.bossIndex<0)throw Error('Unknown Boss');this.practice=options.practice??true;this.startBattle(options.phaseIndex??0);}
  }
  setMusic(key:string) {
    if(this.musicId!==null)this.host.stopMusic(this.musicId!);
    this.musicId=this.assets.music(key);this.host.playMusic(this.musicId!,this.bgmVolume);
  }
  sound(key:string){this.assets.playSound(key,this.soundVolume);}
  disposeBattle(){
    this.battle?.presentation?.dispose();this.graphics.clearBattle?.();
    this.battle?.bulletVisuals.dispose();this.battle?.playerAdapter.dispose();
    const audio=this.touhouResources.audio;
    if(audio){audio.queue.length=0;for(const handle of audio.handles.values())audio.adapter.stop?.(handle);}
    this.battle=null;
  }
  confirm(){return this.input.pressed(Keys.CONFIRM|Keys.SHOOT);}
  cancel(){return this.input.pressed(Keys.CANCEL|Keys.BOMB);}
  direction(){return this.input.pressed(Keys.DOWN|Keys.RIGHT)?1:this.input.pressed(Keys.UP|Keys.LEFT)?-1:0;}
  get inputLocked(){return this.quitRequested||this.transition!==null||this.screen==='title'&&this.screenFrame<TITLE_TIMING.entrance;}
  menuView(screen=this.screen):RushMenuView {
    const boss=BOSSES[this.bossIndex];
    return {screen,selection:this.selection,mainSelection:this.mainSelection,selectionFrame:this.selectionFrame,
      difficulty:this.difficulty,character:this.character,bossIndex:this.bossIndex,spellIndex:this.spellIndex,
      bossName:boss.name,spells:boss.phases.filter(p=>p.spell).map(p=>({cardId:p.cardId,name:p.name})),
      bgmVolume:this.bgmVolume,soundVolume:this.soundVolume};
  }
  changeScreen(screen:string,back=false) {
    if(this.inputLocked)return false;
    const from=this.menuView();
    if(this.screen==='title')this.mainSelection=this.selection;
    const to={...this.menuView(screen),selection:screen==='title'?this.mainSelection:0};
    this.transition={kind:'screen',from,to,age:0,...titleTransitionPlan(this.screen,screen,back)};
    this.sound(back?'se_cancel00':'se_ok00');return true;
  }
  select(field:'selection'|'difficulty'|'character'|'bossIndex'|'spellIndex',value:number,direction:number) {
    const from=this.menuView();this[field]=value;
    if(field==='selection')this.selectionFrame=this.titleFrame;
    const duration=field==='difficulty'?Math.abs(from.difficulty-value)===3?82:30:field==='character'?20:15;
    this.transition={kind:'selection',from,to:this.menuView(),age:0,duration,direction};this.sound('se_select00');
  }
  beginBattle(index=0) {
    if(this.inputLocked)return;
    this.transition={kind:'screen',from:this.menuView(),to:this.menuView('battle'),age:0,
      phaseIndex:index,...titleTransitionPlan(this.screen,'battle')};
    this.sound('se_ok00');this.sound('se_boon00');this.host.stopMusic(this.musicId!);
  }
  toTitle() {
    if(this.transition)return;
    this.transition={kind:'screen',from:this.menuView(),to:{...this.menuView('title'),selection:this.mainSelection},age:0,
      ...titleTransitionPlan(this.screen,'title',true)};
    this.sound('se_cancel00');
  }
  finishTransition() {
    const transition=this.transition!;this.transition=null;
    if(transition.kind==='selection')return;
    const destination=transition.to.screen;
    if(destination==='battle'){this.startBattle(transition.phaseIndex);return;}
    if(destination==='quit'){this.quitRequested=true;this.host.quit();return;}
    this.screen=destination;this.selection=transition.to.selection;
    this.screenFrame=destination==='title'?TITLE_TIMING.entrance:transition.enter;
    if(transition.from.screen==='battle'){this.disposeBattle();this.paused=false;this.setMusic('title');}
  }
  startBattle(index=0) {
    this.disposeBattle();
    const b=BOSSES[this.bossIndex];
    this.lastStart={bossIndex:this.bossIndex,phaseIndex:index,practice:this.practice,difficulty:this.difficulty,character:this.character};
    this.battle=new RushBattle(b.phases,{boss:b.key,difficulty:this.difficulty,character:this.character,seed:0,
      practice:this.practice,spellIndex:index,invincible:!!this.options.invincible,resources:this.touhouResources,
      assets:{playSound:key=>this.assets.playSound(key,this.soundVolume)}});
    this.screen='battle';this.paused=false;this.setMusic(b.music);
  }
  retry(){const s=this.lastStart!;this.bossIndex=s.bossIndex;this.difficulty=s.difficulty;this.character=s.character;this.practice=s.practice;this.startBattle(s.phaseIndex);}
  update(mask=0) {
    this.input.update(mask);this.frame++;
    if(this.transition){
      this.titleFrame++;this.screenFrame++;this.transition.age++;
      if(this.transition.age>=this.transition.duration)this.finishTransition();
      return;
    }
    if(this.screen==='battle'){
      const b=this.battle!;
      if(this.input.pressed(Keys.PAUSE)&&!b.finished&&!b.gameOver){this.paused=!this.paused;this.pauseSelection=0;
        if(this.paused)this.host.pauseMusic(this.musicId!);else this.host.resumeMusic(this.musicId!);this.sound('se_pause');return;}
      if(this.paused||b.finished||b.gameOver){
        const d=this.direction();if(d){this.pauseSelection=(this.pauseSelection+d+3)%3;this.sound('se_select00');}
        if(this.cancel()&&this.paused){this.paused=false;this.host.resumeMusic(this.musicId!);return;}
        if(this.confirm()){
          if(this.pauseSelection===0&&!b.finished&&!b.gameOver){this.paused=false;this.host.resumeMusic(this.musicId!);}
          else if(this.pauseSelection===0&&b.finished&&!this.practice&&this.bossIndex<2){this.bossIndex++;this.startBattle();}
          else if(this.pauseSelection===1||this.pauseSelection===0&&b.gameOver)this.retry();
          else this.toTitle();
        }
        return;
      }
      const audio=this.touhouResources.audio;
      if(audio)audio.volume=this.soundVolume*100;
      b.update(mask);audio?.flush();return;
    }
    this.titleFrame++;this.screenFrame++;
    if(this.inputLocked)return;
    const direction=this.direction();
    if(this.screen==='title'){
      if(direction){this.select('selection',(this.selection+direction+6)%6,direction);return;}
      if(this.cancel()){if(this.selection!==5)this.select('selection',5,-1);return;}
      if(this.confirm()){
        if(this.selection===0||this.selection===1){this.practice=this.selection===1;this.changeScreen('difficulty');}
        else if(this.selection===2)this.changeScreen('replay');
        else if(this.selection===3)this.changeScreen('option');
        else if(this.selection===4)this.changeScreen('manual');
        else this.changeScreen('quit');
      }
    }else if(this.screen==='difficulty'){
      const d=this.input.pressed(Keys.UP|Keys.RIGHT)?1:this.input.pressed(Keys.DOWN|Keys.LEFT)?-1:0;
      if(d){this.select('difficulty',(this.difficulty+d+4)%4,d);return;}
      if(this.confirm())this.changeScreen('character');else if(this.cancel())this.changeScreen('title',true);
    }else if(this.screen==='character'){
      if(direction){this.select('character',1-this.character,direction);return;}
      if(this.confirm())this.changeScreen('boss');else if(this.cancel())this.changeScreen('difficulty',true);
    }else if(this.screen==='boss'){
      if(direction){this.select('bossIndex',(this.bossIndex+direction+3)%3,direction);return;}
      if(this.confirm()){
        if(this.practice){this.spellIndex=0;this.changeScreen('spell');}else this.beginBattle(0);
      }
      else if(this.cancel())this.changeScreen('character',true);
    }else if(this.screen==='spell'){
      const spells=BOSSES[this.bossIndex].phases.map((p,i)=>({p,i})).filter(e=>e.p.spell);
      if(direction){this.select('spellIndex',(this.spellIndex+direction+spells.length)%spells.length,direction);return;}
      if(this.confirm())this.beginBattle(spells[this.spellIndex].i);
      else if(this.cancel())this.changeScreen('boss',true);
    }else if(this.screen==='option'){
      if(this.input.pressed(Keys.UP)){this.select('selection',(this.selection+2)%3,-1);return;}
      if(this.input.pressed(Keys.DOWN)){this.select('selection',(this.selection+1)%3,1);return;}
      const v=this.input.pressed(Keys.RIGHT)?0.1:this.input.pressed(Keys.LEFT)?-0.1:0;
      if(v){this.sound('se_select00');if(this.selection===0){this.bgmVolume=Math.min(1,Math.max(0,this.bgmVolume+v));this.host.playMusic(this.musicId!,this.bgmVolume);}
        else if(this.selection===1)this.soundVolume=Math.min(1,Math.max(0,this.soundVolume+v));}
      if(this.cancel()||this.confirm()&&this.selection===2)this.changeScreen('title',true);
    }else if(this.cancel()||this.confirm())this.changeScreen('title',true);
  }
  render() {
    const draw=this.drawList;draw.reset();
    if(this.screen!=='battle'){
      drawTitle(draw,this.assets,{...this.menuView(),frame:this.titleFrame,screenFrame:this.screenFrame,transition:this.transition,wipeTarget:this.graphics.background});
      return draw.commands;
    }
    this.graphics.draw(draw,this.battle!,{focused:this.input.down(Keys.FOCUS)});
    if(this.transition?.to.screen==='title'){
      const age=this.transition.age;
      if(age>=20)drawTitle(draw,this.assets,{...this.transition.to,frame:Math.max(80,this.titleFrame),screenFrame:80});
      const alpha=age<20?age/20:(40-age)/20;
      draw.rect(0,0,960,720,Math.round(Math.max(0,Math.min(1,alpha))*255));
      return draw.commands;
    }
    const b=this.battle!;
    if(this.paused||b.finished||b.gameOver){
      draw.rect(0,0,960,720,0x00000bbe);draw.rect(264,198,432,321,0x10203ceb);
      const title=this.paused?'暂停':b.gameOver?'Game Over':b.results.at(-1)?.captured?'Spell Card Capture':'Boss Battle Complete';
      this.assets.text(draw,title,-127,91,24,0xffffffff);
      const items=this.paused?['继续','重新开始','返回主页面']:b.gameOver?['重试','重新开始','返回主页面']:
        [!this.practice&&this.bossIndex<2?'下一个 Boss':'返回主页面','重新开始','返回主页面'];
      for(let i=0;i<items.length;i++)this.assets.text(draw,items[i],-73,27-i*45,20,i===this.pauseSelection?0xffe690ff:0x99aecbff);
    }
    return draw.commands;
  }
  snapshot(){return{format:'ts-stg-rushboss-v1',frame:this.frame,screen:this.screen,selection:this.selection,difficulty:this.difficulty,
    character:this.character,bossIndex:this.bossIndex,spellIndex:this.spellIndex,paused:this.paused,
    screenFrame:this.screenFrame,inputLocked:this.inputLocked,
    transition:this.transition?{kind:this.transition.kind,from:this.transition.from.screen,to:this.transition.to.screen,age:this.transition.age,duration:this.transition.duration,direction:this.transition.direction??0}:null,
    battle:this.battle?.snapshot()??null,graphics:this.graphics.snapshot(),assets:this.assets.snapshot()};}
}

export const createRushGame=(host:NativeHost,options?:RushGameOptions)=>new RushGame(host,options);
