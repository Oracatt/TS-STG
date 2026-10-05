import type { AnmBank,AnmInstance } from './anm.js';
import type { DrawList } from '../index.js';
import type { TouhouPlayer,TouhouPlayerContext } from './player.js';
import type { TouhouHealth } from './damage.js';
import type { TouhouTimer } from './math.js';
export interface TouhouVector {x:number;y:number;z:number;}
export interface TouhouMotionOptions {position?:Partial<TouhouVector>;velocity?:Partial<TouhouVector>;delta?:Partial<TouhouVector>;flags?:number;speed?:number;angle?:number;radius?:number;angularVelocity?:number;axisAngle?:number;ellipseScale?:number;phase?:number;damping?:number;}
export class TouhouMotion {
 constructor(options?:TouhouMotionOptions);position:TouhouVector;velocity:TouhouVector;delta:TouhouVector;flags:number;speed:number;angle:number;radius:number;angularVelocity:number;axisAngle:number;ellipseScale:number;phase:number;damping:number;
 updateVelocity(clockScale?:number):void;updatePosition(clockScale?:number):void;update(clockScale?:number):this;
}
export function touhouEnemyDeathScript(script:number,animationFile?:number):number;
export interface TouhouEnemyContext extends TouhouPlayerContext {player?:TouhouPlayer;effectBank?:AnmBank|null;deferEnemyContact?:boolean;deferEnemyDamageFeedback?:boolean;enemyContactBlocked?:boolean;
  /** Return true to postpone body removal, ordinary death effects, drops and callbacks. The owner must finish defeat with this hook disabled. */
  deferEnemyDefeat?:(enemy:TouhouEnemy,source:unknown)=>boolean;
  /** Recheck after onUpdate so a newly held actor does not move once more in that frame. */
  isEnemyHeld?:(enemy:TouhouEnemy)=>boolean;
  /** Return true to replace only the ordinary enemy death sound/ANM; drops and defeat callbacks still run. */
  presentEnemyDeath?:(enemy:TouhouEnemy,source:unknown)=>boolean;
  onEnemyDefeat?:(enemy:TouhouEnemy,source:unknown)=>void;[key:string]:unknown;}
export interface TouhouEnemyOptions {id?:number;bank:AnmBank;script?:number;x?:number;y?:number;hp?:number;radius?:number;directional?:boolean;motion?:TouhouMotion;onUpdate?:(enemy:TouhouEnemy,context:TouhouEnemyContext)=>void;onDefeat?:(enemy:TouhouEnemy,context:TouhouEnemyContext,source:unknown)=>void;onContact?:(enemy:TouhouEnemy,player:TouhouPlayer,context:TouhouEnemyContext)=>void;deathBank?:AnmBank|null;deathScript?:number;deathSound?:number;animationFile?:number;primaryFlags?:number;flags?:number;contactWidth?:number;contactHeight?:number;contactAngle?:number;damageInvulnerability?:number;contactInvulnerability?:number;hitSound?:number;spell?:boolean;drop?:Array<Record<string,unknown>>;}
export class TouhouEnemy {
 constructor(options:TouhouEnemyOptions);id:number;x:number;y:number;hp:number;radius:number;alive:boolean;age:number;direction:number;motion:TouhouMotion;animation:AnmInstance;effects:AnmInstance[];invulnerable?:boolean;keepOffscreen?:boolean;
 health:TouhouHealth;readonly damageTotal:number;damageInvulnerability:TouhouTimer;contactInvulnerability:TouhouTimer;primaryFlags:number;flags:number;contactWidth:number;contactHeight:number;contactAngle:number;deathScript:number;deathSound:number;
 lastHitPosition:TouhouVector;
 prepareSpellHealth(hp?:number,threshold?:number):this;prepareNormalHealth(hp?:number):this;collidePlayer(player:TouhouPlayer,context?:TouhouEnemyContext):number;
 hitSound:number;hitCooldown:number;hitThisFrame:boolean;frameAge:number;finishDamageFeedback(context?:TouhouEnemyContext):void;
 damage(amount:number,source?:unknown,context?:TouhouEnemyContext):number;defeat(source?:unknown,context?:TouhouEnemyContext):void;update(context?:TouhouEnemyContext):void;
 /** Update directional/body animation only, after an external owner changes position and previous. */
 updateAnimation(context?:TouhouEnemyContext):void;previous:TouhouVector;z?:number;
 onUpdate?:TouhouEnemyOptions['onUpdate'];onDefeat?:TouhouEnemyOptions['onDefeat'];
 draw(draw:DrawList,view?:{x:number;y:number;scale:number;screenScale?:number}):DrawList;snapshot():{id:number;x:number;y:number;hp:number;scaledHp:number;healthFlags:number;damageTotal:number;alive:boolean;age:number;direction:number};
}
