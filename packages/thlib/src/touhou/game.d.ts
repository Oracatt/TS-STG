import type {AnmBank} from './anm.js';
import type {DrawList} from '../index.js';
import type {TouhouPlayer} from './player.js';
import type {TouhouBulletField} from './bullets.js';
import type {TouhouLaserField} from './lasers.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouHud} from './hud.js';
import type {TouhouBossHud} from './boss-hud.js';
import type {TouhouBossHudEnemy,TouhouBossHudState} from './boss-hud.js';
import type {TouhouBossEntranceOptions} from './boss-entrance.js';
import type {TouhouBossPresentation,TouhouBossPresentationOptions} from './boss-presentation.js';
import type {TouhouBossDefeat,TouhouBossDefeatOptions} from './boss-defeat.js';
import type {TouhouBossEscape,TouhouBossEscapeOptions} from './boss-escape.js';
import type {TouhouEnemy,TouhouEnemyOptions,TouhouEnemyContext} from './enemy.js';
import type {TouhouItems} from './items.js';
import type {TouhouEnemyDistortion} from './distortion.js';
import type {TouhouSpell,TouhouSpellContext} from './spell.js';
import type {TouhouGrazeEffects} from './short-line.js';
import type {TouhouRNG} from './math.js';
import type {TouhouPauseOptions} from './pause.js';
import type {TouhouContinueSession,TouhouGameOverOptions} from './game-over.js';
import type {TouhouPauseCapture} from './pause-capture.js';
import type {TouhouGameplayCompositor} from './gameplay-compositor.js';
import type {TouhouDamageAccumulator} from './damage.js';
import type {TouhouWorld,TouhouWorldBounds} from './world.js';
import type {Task,TaskHandle,TaskRunner} from '../core.js';
export const TOUHOU_GAME_VIEW:Readonly<{x:number;y:number;scale:number;screenScale:number}>;
export const TOUHOU_VIEWPORT:Readonly<{x:number;y:number;width:number;height:number}>;
export interface TouhouBossDefeatedEvent {game:TouhouGame;boss:TouhouEnemy;source:unknown;}
export type TouhouBossDefeatedHandler=(event:TouhouBossDefeatedEvent)=>void|Task;
export type TouhouGameBossOptions=Pick<TouhouBossPresentationOptions,'distortion'|'profile'|'auraScripts'|'auraView'>&{entrance?:TouhouBossEntranceOptions;onDefeated?:TouhouBossDefeatedHandler|null};
export type TouhouGameBossHudState=Pick<TouhouBossHudState,'name'|'remainingSpells'|'healthBars'|'labelScript'|'hidden'|'dialogue'|'timerHidden'>;
export interface TouhouGameSystems {
 player:TouhouPlayer;bullets:TouhouBulletField;lasers:TouhouLaserField;items:TouhouItems;enemy:TouhouEnemy;
 hud:TouhouHud;bossHud:TouhouBossHud;spell:TouhouSpell;bossPresentation:TouhouBossPresentation;damage:TouhouDamageAccumulator;
}
export interface TouhouGameSystemOptions {
 player:ConstructorParameters<typeof TouhouPlayer>[0];bullets:ConstructorParameters<typeof TouhouBulletField>[0];lasers:ConstructorParameters<typeof TouhouLaserField>[0];
 items:ConstructorParameters<typeof TouhouItems>[0];enemy:ConstructorParameters<typeof TouhouEnemy>[0];hud:ConstructorParameters<typeof TouhouHud>[0];
 bossHud:ConstructorParameters<typeof TouhouBossHud>[0];spell:ConstructorParameters<typeof TouhouSpell>[0];bossPresentation:ConstructorParameters<typeof TouhouBossPresentation>[0];damage:ConstructorParameters<typeof TouhouDamageAccumulator>[0];
}
export type TouhouGameFactories={[K in keyof TouhouGameSystems]?:(options:NonNullable<TouhouGameSystemOptions[K]>,game:TouhouGame)=>TouhouGameSystems[K]};
export interface TouhouSpellTimeoutEvent {game:TouhouGame;spell:TouhouSpell;boss:TouhouEnemy|null;}
export interface TouhouGameOptions {
 banks:Record<string,AnmBank>;font:TouhouBitmapFont;sht:unknown;styles:unknown[];
 character?:string|number;difficulty?:number;power?:number;seed?:number;rng?:TouhouRNG;visualRng?:TouhouRNG;
 world?:TouhouWorld;bounds?:Partial<TouhouWorldBounds>;
 systemOptions?:{[K in keyof TouhouGameSystems]?:Partial<NonNullable<TouhouGameSystemOptions[K]>>};factories?:TouhouGameFactories;
 stage?:((game:TouhouGame,frame:number)=>void)|{update(game:TouhouGame):void;destroy?():void};renderTarget?:number|null;compositeTarget?:number|null;renderBackground?:(draw:DrawList,game:TouhouGame)=>void;
 onSound?:(id:number,x?:number)=>void;onStopSound?:(id:number)=>void;onEvent?:(name:string,data:unknown)=>void;onExit?:()=>void;onRestart?:()=>void;
 onReplay?:TouhouPauseOptions['onReplay'];onOptions?:TouhouPauseOptions['onOptions'];onManual?:TouhouPauseOptions['onManual'];pauseBackground?:TouhouPauseOptions['drawBackground'];
 itemsFactory?:(player:TouhouPlayer,banks:Record<string,AnmBank>)=>TouhouItems;
 spellOptions?:ConstructorParameters<typeof TouhouSpell>[0];spellContext?:TouhouSpellContext&TouhouEnemyContext;
 session?:TouhouContinueSession;gameOverOptions?:Partial<TouhouGameOverOptions>;
 /** Shared pause-menu customization. onResume runs after the game unpauses. */
 pauseOptions?:Partial<Omit<TouhouPauseOptions,'bank'|'initialMask'|'capture'>>;
 pauseCapture?:TouhouPauseCapture;
 view?:typeof TOUHOU_GAME_VIEW;viewport?:typeof TOUHOU_VIEWPORT;disposeBanks?:boolean;onDestroy?:(game:TouhouGame)=>void;
 bossPresentationOptions?:Pick<TouhouBossPresentationOptions,'profile'|'auraScripts'|'auraView'|'distortion'|'screenView'>;
 /** Called once when a registered Boss runs out of HP. The body is held, not automatically exploded or removed. Without a handler, emits bossdefeated through onEvent. */
 onBossDefeated?:TouhouBossDefeatedHandler|null;
 /** Default: finish expired cards, except held Boss outcomes. A callback replaces that policy; null emits spelltimeout only, once per card. */
 onSpellTimeout?:((event:TouhouSpellTimeoutEvent)=>void)|null;
}
export class TouhouGame {
 constructor(options:TouhouGameOptions);
 world:TouhouWorld;tasks:TaskRunner;
 player:TouhouPlayer;bullets:TouhouBulletField;lasers:TouhouLaserField;items:TouhouItems;enemies:TouhouEnemy[];hud:TouhouHud;bossHud:TouhouBossHud|null;
 bossPresentation:TouhouBossPresentation|null;
 bossDefeats:Array<{enemy:TouhouEnemy;source:unknown;sequence:TouhouBossDefeat;spell:TouhouSpell|null;spellIndex:number;spellGeneration:number}>;
 bossEscapes:Array<{enemy:TouhouEnemy;source:unknown;sequence:TouhouBossEscape}>;
 onBossDefeated:TouhouBossDefeatedHandler|null;
 bossHudState:TouhouGameBossHudState;
 compositor:TouhouGameplayCompositor;
 spell:TouhouSpell;grazeEffects:TouhouGrazeEffects;context:TouhouSpellContext&TouhouEnemyContext;rng:TouhouRNG;visualRng:TouhouRNG;frame:number;paused:boolean;stageVisible:boolean;
 spawnEnemy(options:Omit<TouhouEnemyOptions,'bank'>&{bank?:AnmBank}):TouhouEnemy;
 registerBoss<T extends TouhouBossHudEnemy>(boss:T,options?:Pick<TouhouGameBossOptions,'onDefeated'>):T;
 enterBoss(boss:TouhouBossHudEnemy,options?:TouhouGameBossOptions):TouhouBossPresentation;
 setBoss(boss:TouhouBossHudEnemy|null,options?:TouhouGameBossOptions):TouhouBossPresentation|null;
 setBossHud(state?:TouhouGameBossHudState):this;
 startBossCombat(boss?:TouhouBossHudEnemy):this;
 stopBossCombat(boss?:TouhouBossHudEnemy):this;
 isBossCombatReady(boss:TouhouBossHudEnemy):boolean;
 runBossSequence(boss:TouhouEnemy,script:Task|((boss:TouhouEnemy)=>Task)):TaskHandle;
 /** Stop the actor's update/motion/contact while keeping its body. External tasks continue; cancel an attack task or finish its phase explicitly. No implicit settlement, clear, drops or presentation changes. */
 holdBoss(enemy?:TouhouEnemy):boolean;
 isBossHeld(enemy?:TouhouEnemy):boolean;
 /** Supply the next phase's health/behavior before resuming. Returns false during an active exit sequence. */
 resumeBoss(enemy?:TouhouEnemy):boolean;
 /** Silent retirement, including cancellation of owned exit sequences. Does not settle or award anything. */
 removeBoss(enemy?:TouhouEnemy):boolean;
 /** Silent fly-away with no automatic settlement, drops or clearing. Emits bossescape after body removal. */
 beginBossEscape(enemy?:TouhouEnemy,options?:Pick<TouhouBossEscapeOptions,'target'|'duration'|'easing'>&{source?:unknown}):TouhouBossEscape|null;
 /** Starts the common final clearing/drift sequence; emits bossburst after card settlement, drops and the explosion. Ordinary enemies do not use it. */
 beginBossDefeat(enemy?:TouhouEnemy,options?:Pick<TouhouBossDefeatOptions,'angle'|'speed'|'delayFrames'>&{source?:unknown}):TouhouBossDefeat|null;
 beginSpell(options?:Parameters<TouhouSpell['begin']>[0]):TouhouSpell;
 postFrame(nowSeconds:number):number|null;
 openGameOver(mask?:number):void;session:TouhouContinueSession;
 setDistortion(center:{x:number;y:number;z?:number}|((game:TouhouGame)=>{x:number;y:number;z?:number}),options?:ConstructorParameters<typeof TouhouEnemyDistortion>[0]):TouhouEnemyDistortion;
 update(mask?:number):void;render():unknown[][];snapshot():unknown;destroy():void;
}
