import type {World} from '@ts-stg/thlib';
import type { TouhouResources, TouhouTimer, TouhouBulletCollision, TouhouResolvedBulletStyle, TouhouBossDropOptions } from '@ts-stg/thlib/touhou';
import type { RushBattle, RushEntity } from './runtime.js';
import type { RushAssets } from './assets.js';
export type BossKey='sunny'|'monstone'|'artia';
export interface Point{x:number;y:number}
export interface Body extends Point{vx:number;vy:number;fx?:number;fy?:number;drag?:number|Point;moving?:boolean;move?:Move}
export interface Move extends Point{maxSpeed:number;minSpeed:number;speed:number;distance:number}
export interface RushBoss extends Body{fx:number;fy:number;alive:boolean;visible?:boolean;hidden?:boolean;checking:boolean;invulnerable:boolean;immuneDamage?:boolean;animationIndex:number;tsRadius:number;damageInvulnerability:TouhouTimer;hp:number;maxHp:number;primaryFlags?:number;}
export interface RushPlayerFacade extends Point{radius:number;invulnerable:number;deathbomb:number;respawning:number;shotFrame:number;vx:number;vy:number;life:number;bombs:number;power:number;state:number;moveSpeed:number;slowMoveSpeed:number}
export interface RushPhase{key:string;sourceClass?:string;position?:Point;boss:BossKey;number:number;name:string;spell:boolean;cardId:number;hp:number;time:number;bonus:number;survival:boolean;lifeBar:{min:number;max:number;nodraw?:boolean;startFull?:boolean;showTag?:boolean;full?:boolean;tag?:boolean};final?:boolean;finalSpell?:boolean;deathDelay?:number;transitionDelay?:number;itemDrops?:TouhouBossDropOptions;init?:(ctx:RushBattle)=>void;end?:(ctx:RushBattle)=>void;update?:(ctx:RushBattle,frame:number)=>void;}
export interface RushBattleOptions{boss?:BossKey;difficulty?:number;character?:number;seed?:number;practice?:boolean;spellIndex?:number;invincible?:boolean;assets?:Pick<RushAssets,'playSound'>|null;resources?:TouhouResources|null;profile?:'legacy'|'portrait';deferStart?:boolean;onHudNotice?:((type:number,value?:number)=>void)|null}
export interface RushCancellationOptions{bullets?:boolean;lasers?:boolean;reward?:boolean;reason?:string;nearby?:boolean;dropMode?:number;check?:boolean;kind?:number}
export interface RushCollision extends TouhouBulletCollision{kind?:string;palette?:number;style?:TouhouResolvedBulletStyle|null;radius:number;handle:number;cancelKind:number;cancelScript:number;cancelType:number;frozen:boolean}
export type RushEntityCallback=(ctx:RushBattle,entity:RushEntity)=>void;
export interface RushEntityData extends Body{
 ctx:RushBattle;kind:string;color:number;frame:number;fx:number;fy:number;drag:number|Point;mass:number;rotation:number;delay:number;cleanOnOutOfRange:boolean;cleanOnHit:boolean;cleanOnBomb:boolean;outOfRangeTolerance:number;checking:boolean;alpha:number;size:number;style?:import('./bullet-styles.js').RushBulletStyle;grazed:boolean;
 initialDelay:number;birthNotified:boolean;onUpdate?:RushEntityCallback;onSpawnCallback?:RushEntityCallback;cleanup?:RushEntityCallback;
 visualKind:string;curve?:boolean|number;shadowInterval?:number;shadowAlpha?:number;tint?:number[];lifetime?:number;autoRotateMode?:number;autoRotateOffset?:number;
 width:number;angle:number;length:number;segments:number;laserBirth:{x:number;y:number;angle:number;speed:number};laserHead?:RushEntity;sampleSpeed?:number;animFrames?:number;owner?:RushEntity;
 noCheck?:boolean;sourceCollision?:RushCollision;cancelKind?:number;frozen?:boolean;protectedFrames?:number;
 follow:Point&{z?:number};interval?:number;duration?:number;scale:number;frames?:number;storetimes?:number;blast?:boolean;shakeScreen?:boolean;source?:string;sizeY?:number;
 type:number;startrad:number;bounced?:boolean;localFrame:number;dangle:number;played:boolean;offset:number;strength:number;orbitLength:number;targetLength:number;playerLoc:Point;amplitude:number;birthKind?:number;
}
export type RushEntityOptions=Partial<Omit<RushEntityData,'color'|'ctx'>> & {color?:number|number[];force?:Point;checkRadius?:number;offset?:number;speed?:number;fog?:{scale:number;frames:number};fogSize?:number;fogFrames?:number;onSpawn?:RushEntityCallback;onDestroy?:RushEntityCallback;update?:RushEntityCallback;setup?:RushEntityCallback;group?:string;layer?:number;radius?:number;};
export type RushWorld=Omit<World,'entities'|'pending'> & {entities:RushEntity[];pending:RushEntity[];game:RushBattle};
export interface RushPhaseState{tick:number;moveStep:number;type:number;clock:number;fogs:RushEntity[];clones:RushEntity[];originalMoveSpeed:number;originalSlowMoveSpeed:number;position:number;playerShadow:RushEntity|null;bossShadow:RushEntity|null;}
