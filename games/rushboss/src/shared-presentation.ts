// SPDX-License-Identifier: GPL-3.0-only
import type {AnmDrawList as DrawList,AnmView,AnmBank,AnmInstance} from '@ts-stg/thlib/touhou';
import type {RushBattle} from './runtime.js';
import type {BossKey,Point,RushPhase} from './types.js';
import type {SpellCard,SpellEntrance,ChargeEffect,ChargeVisual} from './ui-types.js';

// The demo owns its phase/cut-in/background timing. Original common Boss
// presentation, distortion, rings, timer, name and charge particles are thlib.
import { TouhouBossPresentation, TouhouBossPhasePlan, TOUHOU_BOSS_VIEW, TOUHOU_BOSS_SCREEN_VIEW } from '@ts-stg/thlib/touhou';

const F=Math.fround;
export const RUSH_BOSS_VIEW=Object.freeze({x:480,y:24,scale:1.5,screenScale:1});
export const RUSH_BOSS_SCREEN_VIEW=Object.freeze({x:144,y:0,scale:1,screenScale:1.5,
  screenOffsets:Object.freeze([Object.freeze({x:48,y:24}),Object.freeze({x:336,y:24})])});
const bankNames=['effect','front','ascii_960','text','bullet'];
const palettes:[import('@ts-stg/thlib/touhou').TouhouBossChargeColor,number[]][]=[['white',[1,1,1]],['cyan',[0,1,1]],['magenta',[1,0,1]],['yellow',[1,1,0]],['blue',[0,0,1]],['green',[0,1,0]],['red',[1,0,0]]];
function chargeColor(color:number|number[]|undefined){
  if(!Array.isArray(color))return 'green';
  let selected=0,best=Infinity;
  for(let index=0;index<palettes.length;index++){
    const distance=palettes[index][1].reduce((sum,value,channel)=>sum+(value-color[channel])**2,0);
    if(distance<best){best=distance;selected=index;}
  }
  return palettes[selected][0];
}

export class RushSharedPresentation {
 declare proxyPlayer:{readonly x:number;readonly y:number;readonly bomb:RushBattle['sharedPlayer']['bomb']};
  declare battle: RushBattle;
  declare bossKey: BossKey;
  declare frame: number;
  declare phasePlan: TouhouBossPhasePlan<RushPhase>;
  declare view: Readonly<AnmView>;
  declare proxyBoss: { readonly x: number; readonly y: number; z: number; readonly primaryFlags: number; readonly damageInvulnerability: TouhouTimer; readonly alive: boolean; readonly hp: number; readonly maximumHp: number; };

 declare banks:Record<string,AnmBank>;declare shared:TouhouBossPresentation|null;declare cards:SpellCard[];declare entrances:SpellEntrance[];declare charges:ChargeVisual[];declare activeCard:SpellCard|null;declare effects:{kind:string;effect:ChargeEffect;animation:AnmInstance}[];
  constructor(battle:RushBattle,{resources=battle.touhouResources}={}) {
    this.battle=battle;this.bossKey=battle.bossKey;this.frame=0;this.cards=[];this.entrances=[];this.charges=[];this.effects=[];this.activeCard=null;
    // Original nonspells and their following spell share one HP-based ring.
    // A spell keeps the remaining section; only a new group refills the ring.
    // Rush lifeBar is retained only by the historical wide-screen renderer.
    this.phasePlan=new TouhouBossPhasePlan(battle.singlePhase?[battle.phases[battle.startIndex]]:battle.phases);
    this.view=battle.portrait?TOUHOU_BOSS_VIEW:RUSH_BOSS_VIEW;
    const boss=battle.boss,player=battle.sharedPlayer;
    this.proxyBoss={get x(){return boss.x;},get y(){return F(224-boss.y);},z:0,
      get primaryFlags(){return boss.primaryFlags??0;},
      get damageInvulnerability(){return boss.damageInvulnerability;},
      get alive(){return boss.alive;},get hp(){return boss.hp;},get maximumHp(){return boss.maxHp;}};
    this.proxyPlayer={get x(){return player.x;},get y(){return battle.portrait?player.y:F(player.y+224);},get bomb(){return player.bomb;}};
    this.banks={};this.shared=null;
    if(!resources?.banks.effect||!resources.banks.front||!resources.banks.ascii_960)return;
    // Each animation owner gets independent registration/template/RNG state.
    // A Boss charge must never change the player's Bomb or shot random stream.
    for(const name of bankNames)if(resources.banks[name])this.banks[name]=resources.createBank(name);
    this.shared=new TouhouBossPresentation({banks:this.banks as import('@ts-stg/thlib/touhou').TouhouBossPresentationOptions['banks'],player:this.proxyPlayer,font:resources.font,
      view:this.view,screenView:battle.portrait?TOUHOU_BOSS_SCREEN_VIEW:RUSH_BOSS_SCREEN_VIEW,
      distortion:{viewOffsetX:battle.portrait?224:320,viewOffsetY:16,screenWidth:640,screenHeight:480},
      spellOptions:{difficulty:battle.difficulty,stage:{sunny:1,monstone:2,artia:3}[battle.bossKey]??1},
      context:{sound:(id,x=0)=>resources.audio?.request(id,x),addScore:()=>{},
        hudNotice:(type,value:number)=>battle.onHudNotice?.(type,value),
        // Demo spell names are Simplified Chinese. Keep the shared source text
        // pipeline, explicitly selecting its two-byte Chinese code-page profile.
        createNameAnimation:(name:string,options)=>this.banks.text?.environment.createNameAnimation?.(name,{...options,codePage:936})}});
    if(boss.alive)this.shared.enter(this.proxyBoss);
  }
  revealBoss(options:import('@ts-stg/thlib/touhou').TouhouBossEntranceOptions={}){
    if(this.shared){this.shared.clearBoss();this.shared.enter(this.proxyBoss);if(this.battle.portrait)this.shared.beginEntrance(options);}
    return this;
  }
  beginPhase(phase:RushPhase,boss?:Point):void;
  beginPhase(phase:RushPhase) {
    this.shared?.startCombat();
    this.shared?.setEffects({aura:true,distortion:true});
    if(this.shared?.spell.active)this.shared.finishSpell({captured:false});
    if(!phase.spell)return;
    if(!this.battle.portrait){
      this.activeCard={phase,age:0,deadAge:0,leaving:false,alpha:0,overlayAlpha:0,scroll:0};
      this.cards.push(this.activeCard);
      this.entrances.push({boss:this.bossKey,age:0,phaseKey:phase.key,x:200,y:30,cutinAlpha:0});
    }
    this.shared?.beginSpell({boss:this.proxyBoss,id:phase.cardId??phase.number??this.battle.phaseIndex,
      name:phase.name??'',duration:Math.round(phase.time*60),survival:!!phase.survival});
  }
  endPhase() {
    if(this.activeCard){this.activeCard.leaving=true;this.activeCard=null;}
  }
  beginBossDeath() {
    // The public defeat sequence has reached its burst. Snapshot the Boss
    // position; the visual tail may continue under the stage's dialogue.
    return this.shared?.beginDeath({x:this.battle.boss.x,y:F(224-this.battle.boss.y),follow:null,delayFrames:0});
  }
  addCharge(effect:ChargeEffect,boss:Point) {
    const follow:Point&{z?:number}=effect.follow??boss,storetimes=Math.max(1,effect.storetimes??1),blast=effect.blast!==false;
    const position={get x(){return follow.x;},get y(){return F(224-follow.y);},get z(){return follow.z??0;}};
    // Rush supplies its repeat count and release clock. The reusable thlib
    // owner supplies attack charge circles/particles, not Boss-entry Point151.
    const display=this.shared?.beginCharge({x:effect.x??follow.x,y:F(224-(effect.y??follow.y)),
      color:chargeColor(effect.color),releaseColor:Array.isArray(effect.color)?chargeColor(effect.color):'yellow',repeatCount:storetimes,repeatInterval:24,
      releaseFrame:70+(storetimes-1)*24,release:blast,follow:position});
    this.charges.push({effect,follow,storetimes,blast,lastFrame:0,display,
      get animations(){return this.display?.roots??[];}});
  }
  addEffect(kind:string,effect:ChargeEffect){
    if(kind==='laserFog'){
      // The common laser field owns its original origin ANM, including its
      // lifetime. This authored event must not create a duplicate animation.
      return;
    }
    const script=kind==='death'?37:kind==='freezingFog'?19:null;
    if(script===null)return;
    const animation=this.banks.effect?.create(script,{x:effect.x,y:F(224-effect.y)});
    if(animation)this.effects.push({kind,effect,animation});
  }
  update(battle=this.battle) {
    this.frame++;
    this.entrances=this.entrances.filter(entrance=>{
      const n=++entrance.age;
      if(n<=10){entrance.cutinAlpha=F(entrance.cutinAlpha+F(.1));entrance.x=F(entrance.x-15);entrance.y=F(entrance.y-3);}
      else if(n<=80){entrance.x=F(entrance.x-1);entrance.y=F(entrance.y-F(.2));}
      else{entrance.x=F(entrance.x-15);entrance.y=F(entrance.y-3);entrance.cutinAlpha=F(entrance.cutinAlpha-F(.1));}
      return n<=90;
    });
    for(const card of this.cards){
      card.age++;card.scroll=F(card.scroll+(this.bossKey==='artia'?.005:.003));
      if(card.leaving){card.deadAge++;card.alpha=Math.max(0,F(card.alpha-.1));card.overlayAlpha=Math.max(0,F(card.overlayAlpha-.1));}
      else{card.alpha=Math.min(1,F(card.alpha+F(.02)));card.overlayAlpha=Math.min(this.bossKey==='monstone'?.75:1,F(card.overlayAlpha+F(.02)));}
    }
    this.cards=this.cards.filter(card=>!card.leaving||card.deadAge<15);
    for(const charge of this.charges)if(!charge.effect.alive)charge.display?.stop();
    const phaseIndex=battle.singlePhase?0:Math.max(0,battle.phaseIndex);
    const hudState:import('@ts-stg/thlib/touhou').TouhouBossHudState=battle.portrait?this.phasePlan.hudState(phaseIndex,battle.phaseIndex>=0?{hp:battle.boss.hp,maximumHp:battle.boss.maxHp}:{}):{};
    // Source ECL534 is issued by Boss1 after the pre-fight dialogue returns.
    // A revealed body/name alone must not start the future-card star timeline.
    if(battle.phaseIndex<0)hudState.remainingSpells=0;
    if(battle.portrait&&battle.phase?.survival)hudState.healthBars![0]!.visible=false;
    const combatActive=battle.combatStarted&&!battle.dialogue&&!battle.finished&&!battle.gameOver;
    this.shared?.setEffects({aura:combatActive,distortion:combatActive});
    this.shared?.update({...hudState,boss:!battle.portrait||battle.boss.alive?this.proxyBoss:null,player:this.proxyPlayer,
      name:battle.portrait?{sunny:'Sunny Milk',monstone:'Monstone',artia:'Artia'}[battle.bossKey]:undefined,
      dialogue:battle.portrait?battle.dialogue:undefined,
      combatActive,
      remainingFrames:battle.phase?Math.max(0,Math.round(battle.phase.time*60)-battle.phaseTimeElapsed):-1,
      timerHidden:!!battle.transition||!!battle.phaseEntry||battle.finished||!battle.combatStarted||battle.dialogue,
      timerRate:battle.combatActive?1:0});
    for(const charge of this.charges){
      const frame=charge.effect.frame;
      if(frame!==charge.lastFrame){
        charge.lastFrame=frame;
        if(charge.effect.alive&&charge.blast&&frame===70+(charge.storetimes-1)*24)battle.sound?.('se_enep02');
      }
    }
    this.charges=this.charges.filter(charge=>charge.display?charge.display.alive:charge.effect.alive);
    for(const visual of this.effects){const {effect,animation}=visual;
      if(effect.alive===false){animation.destroy();continue;}
      animation.x=effect.x;animation.y=F(224-effect.y);animation.update();
      if(visual.kind==='freezingFog'){const scale=(effect.scale??64)/64;animation.scale2X=animation.scale2Y=scale;animation.alpha=Math.round(Math.max(0,effect.alpha??1)*255);}
    }
    this.effects=this.effects.filter(visual=>visual.animation.alive);
    for(const bank of Object.values(this.banks)){bank.updateDetached();bank.collect();}
  }
  draw(queue:DrawList) {
    this.shared?.draw(queue);
    for(const visual of this.effects)visual.animation.draw(queue,this.view);
    for(const bank of Object.values(this.banks))bank.drawDetached(queue,this.view);
    return queue;
  }
  drawDistortion(draw:DrawList,texture:number){this.shared?.drawDistortion(draw,texture);return draw;}
  snapshot(){return{...(this.battle.portrait?{profile:'portrait',genericEffects:this.effects.map((effect)=>effect.animation.scriptId),originScripts:(this.battle.projectiles.debris?.lasers??[]).filter(l=>l.alive).map(l=>l.origin?.scriptId).filter(id=>id!==undefined)}:{}),
    implementation:'@ts-stg/thlib/touhou TouhouBossPresentation',frame:this.frame,magicFrame:this.frame,
    shared:this.shared?.snapshot()??null,chargeScripts:this.charges.flatMap(charge=>charge.animations.map(vm=>vm.scriptId)),
    charges:this.charges.length,chargeFrames:this.charges.map(charge=>({frame:charge.effect.frame,storetimes:charge.storetimes,blast:charge.blast})),
    entrances:this.entrances.map(entrance=>entrance.age),cards:this.cards.map(card=>({key:card.phase.key,age:card.age,deadAge:card.deadAge,alpha:card.alpha}))};}
  dispose(){this.shared?.destroy();for(const bank of Object.values(this.banks))bank.dispose();this.banks={};this.effects.length=this.charges.length=this.cards.length=this.entrances.length=0;this.activeCard=null;}
}

import type {TouhouTimer} from '@ts-stg/thlib/touhou';
