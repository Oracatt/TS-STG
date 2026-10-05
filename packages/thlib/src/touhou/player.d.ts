import type {DrawList} from '../index.js';
import type {AnmBank,AnmInstance} from './anm.js';
import type {TouhouSht,TouhouShooter} from './shot-data.js';
import type {TouhouShot} from './shots.js';
import type {TouhouTimer,TouhouRNG} from './math.js';
import type {TouhouSpell} from './spell.js';
import type {TouhouPlayerRules} from './player-rules.js';
import type {TouhouWorld} from './world.js';
export type {TouhouPlayerRules} from './player-rules.js';
export interface TouhouView{x?:number;y?:number;scale?:number;screenScale?:number;}
export interface TouhouDamageTarget{x:number;y:number;z?:number;radius?:number;id?:number;hp?:number;alive?:boolean;excluded?:boolean;invulnerable?:boolean;damage?:(amount:number,source:unknown)=>unknown;}
export interface TouhouDamageRegion{shape:'circle'|'rectangle';x:number;y:number;radius?:number;width?:number;height?:number;angle?:number;damage:number;bomb?:boolean;growth?:number;remaining?:number;}
export interface TouhouPlayerContext{
  enemies?:TouhouDamageTarget[];enemyReady?:boolean;inputBlocked?:boolean;dialogue?:boolean;bossSuppressed?:boolean;clockScale?:number;timerRate?:number;spell?:TouhouSpell;
  sound?:(id:number,x?:number)=>void;stopSound?:(id:number)=>void;
  onEvent?:(name:string,data:unknown)=>void;damageRegion?:(region:TouhouDamageRegion)=>number;
  damageEnemy?:(enemy:TouhouDamageTarget,amount:number,source:unknown)=>void;
  cancelCircle?:(x:number,y:number,radius:number,options?:{bullets?:boolean;lasers?:boolean;reward?:boolean;reason?:string})=>unknown;
  cancelRectangle?:(x:number,y:number,width:number,height:number,angle:number,options?:{bullets?:boolean;lasers?:boolean;reward?:boolean;reason?:string})=>unknown;
  spawnItem?:(item:{type:number|string;x:number;y:number;angle?:number;speed?:number})=>unknown;
  enqueueGraze?:(effect:{x:number;y:number;color:number;delay:number})=>unknown;
  finishLasers?:(first:number,second:number)=>void;screenEffect?:(...args:unknown[])=>void;
}
export interface TouhouPlayerBounds{x:number;y:number;width:number;height:number;}
export interface TouhouPlayerInsets{left:number;top:number;right:number;bottom:number;}
export interface TouhouPlayerBomb{alive:boolean;timer?:TouhouTimer;update(context:TouhouPlayerContext):void;draw(draw:DrawList,view?:TouhouView):void;destroy():void;}
/** Called at the existing source firing cadence; it may compose fireTouhouPlayerWeapons. */
export type TouhouPlayerShoot=(player:TouhouPlayer,frame:number,secondaryFrame:number,context:TouhouPlayerContext)=>void;
export type TouhouShotFactory=(player:TouhouPlayer,row:TouhouShooter,pattern:number,index:number,context:TouhouPlayerContext)=>TouhouShot;
export type TouhouBombFactory=(player:TouhouPlayer,context:TouhouPlayerContext)=>TouhouPlayerBomb;
export interface TouhouPlayerProfile{id:string|number;rules?:Partial<TouhouPlayerRules>;shoot?:TouhouPlayerShoot;shotFactory?:TouhouShotFactory;bombFactory?:TouhouBombFactory|null;}
export interface TouhouPlayerOptions{character?:0|1;profile?:TouhouPlayerProfile;rules?:Partial<TouhouPlayerRules>;shoot?:TouhouPlayerShoot;shotFactory?:TouhouShotFactory;bombFactory?:TouhouBombFactory|null;sht:TouhouSht;bank?:AnmBank|null;effectBank?:AnmBank|null;power?:number;lives?:number;bombs?:number;state?:number;x?:number;y?:number;seed?:number;rng?:TouhouRNG|null;world?:TouhouWorld;bounds?:TouhouPlayerBounds;movementInsets?:Partial<TouhouPlayerInsets>;respawnX?:number;respawnY?:number;respawnStartY?:number;}
export class TouhouPlayer{
  constructor(options:TouhouPlayerOptions);character:string|number;profile:TouhouPlayerProfile;rules:Readonly<TouhouPlayerRules>;shoot:TouhouPlayerShoot;shotFactory:TouhouShotFactory|null;bombFactory:TouhouBombFactory|null;sht:TouhouSht;bank:AnmBank|null;effectBank:AnmBank|null;rng:TouhouRNG;
  world:TouhouWorld;bounds:TouhouPlayerBounds;movementInsets:TouhouPlayerInsets;respawnX:number;respawnY:number;respawnStartY:number;speeds:number[];
  x:number;y:number;fixedX:number;fixedY:number;state:number;timer:TouhouTimer;focusTimer:TouhouTimer;invulnerability:TouhouTimer;focused:boolean;
  power:number;lives:number;bombs:number;score:number;pointValue:number;pointItems:number;maxPower:number;startingPower:number;powerPerLevel:number;weaponLevels:number;
  maxLives:number;maxBombs:number;lifeFragments:number;bombFragments:number;extendCount:number;deaths:number;graze:number;
  collectSpeed:number;collectRadius:number;attractRadius:number;collectLine:number;respawnBombs:number;
  motionX:number;motionY:number;movementScale:number;normalRadius:number;focusRadius:number;normalExtent:{x:number;y:number};focusExtent:{x:number;y:number};collisionPercent:number;deathbombFrames:number;
  animation:AnmInstance|null;animationScript:number;shots:TouhouShot[];bomb:TouhouPlayerBomb|null;
  options:Array<{index:number;active:boolean;x:number;y:number;fixedX:number;fixedY:number;animation:AnmInstance|null;fullAnimation:AnmInstance|null;changed:number}>;
  frame:number;readonly powerLevel:number;readonly invulnerableFrames:number;
  stageVisibility:boolean;readonly destroyed:boolean;
  update(mask?:number,context?:TouhouPlayerContext):this;draw(draw:DrawList,view?:TouhouView):void;
  /** Cover cleanup: retract option ANM and retire Bomb; the player body remains visible and active. */
  finishStageVisibility():this;
  /** Continues the normal player update with the application's stage input/shooting context. */
  updateStageVisibility(mask?:number,context?:TouhouPlayerContext):this;
  /** Draws the player body, existing shots and option tails through the normal render queue. */
  drawStageVisibility(draw:DrawList,view?:TouhouView):void;
  restoreStageVisibility():this;
  /** Clears stage-local shots/focus state while preserving position, resources, rules, configured collision/collection/movement fields, banks and RNG. */
  resetForStage():this;
  /** Idempotently releases owned Bomb, shots and animations; shared banks remain usable. */
  destroy():void;
  setPosition(x:number,y:number):void;setPower(value:number):void;refreshPower():void;updateOptions():void;
  canBomb(context:TouhouPlayerContext):boolean;triggerBomb(context?:TouhouPlayerContext):boolean;hit(context?:TouhouPlayerContext):boolean;
  collisionCircle(x:number,y:number,radius:number,context?:TouhouPlayerContext,preview?:boolean):number;
  collisionRectangle(x:number,y:number,angle:number,width:number,height:number,context?:TouhouPlayerContext,preview?:boolean):number;
  addGraze(context?:TouhouPlayerContext,position?:{x:number;y:number},color?:number):void;snapshot():Record<string,unknown>;
}
