import {wait} from '@ts-stg/thlib';
import {TouhouGame,TouhouPlayer,TouhouItems,TouhouWorld,TouhouPhaseSequence,TouhouShot,TouhouBossHud,TouhouBossPhasePlan,TOUHOU_PLAYER_PROFILES} from '@ts-stg/thlib/touhou';
import type {TouhouGameOptions,TouhouPlayerProfile} from '@ts-stg/thlib/touhou';

declare const options:TouhouGameOptions;
const world=new TouhouWorld({bounds:{x:-240,width:480,height:560}});
const profile:TouhouPlayerProfile={...TOUHOU_PLAYER_PROFILES.reimu,id:'custom',rules:{maxPower:600},
  shoot(player,frame,secondary,context){TOUHOU_PLAYER_PROFILES.reimu.shoot?.(player,frame,secondary,context);},
  shotFactory:(player,row,pattern,index,context)=>new TouhouShot(player,row,pattern,index,context)};
const game=new TouhouGame({...options,world,systemOptions:{player:{profile},bullets:{capacity:5000},lasers:{capacity:1024}},
  factories:{player:settings=>new TouhouPlayer(settings),items:settings=>new TouhouItems({...settings,capacity:1024})},
  onSpellTimeout:({game,boss,spell})=>{if(boss)game.holdBoss(boss);spell.clockPaused=true;}});
const boss=game.spawnEnemy({x:0,y:100,hp:1000});
game.registerBoss(boss,{onDefeated:function* ({game,boss}){yield* wait(30);game.beginBossEscape(boss);}});
const phases=new TouhouPhaseSequence([
  {name:'arrival',run:function* (owner){owner.enterBoss(boss);yield* wait(60);}},
  {name:'combat',enter:owner=>{owner.startBossCombat(boss);},leave:function* (owner){owner.stopBossCombat(boss);yield* wait(30);}},
],{context:game});
phases.update(game);phases.finish('defeated');phases.destroy();
game.items.register('token',{collect:(_item,player)=>{player.score+=10;}}).spawn({type:'token'});
new TouhouBossHud({bank:options.banks.front!,textBank:options.banks.ascii_960!,panelCount:3,markerCount:6,
  starCapacity:12,createStar:(index,bank)=>bank.create(58)});
// @ts-expect-error Capacities are numbers, not string configuration values.
new TouhouGame({...options,systemOptions:{bullets:{capacity:'5000'}}});
// @ts-expect-error Phases use fixed-frame generators, not promises.
new TouhouPhaseSequence([{run:async()=>{}}]);
// @ts-expect-error Custom items must define collection behavior.
game.items.register('bad',{script:0});
