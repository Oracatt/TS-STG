import type { TouhouPausePage } from './pause.js';
import type { TouhouItemContext } from './items.js';
import type { TouhouPlayerContext } from './player.js';
import type { TouhouSht } from './shot-data.js';
import type { TouhouBulletStyle } from './bullet-patterns.js';
import type { AnmInstance } from './anm.js';
import type { DrawCommand } from '../core-types.js';

type GameBossActor = TouhouBossHudEnemy & {health?: TouhouBossHudEnemy['health'] & {set?: (hp: number, spell?: boolean) => unknown}};
export interface TouhouGameContext extends Omit<TouhouSpellContext & TouhouEnemyContext & TouhouItemContext, 'boss' | 'addScore'> {
  world: TouhouWorld;
  spawnCancelItem?: import('./bullets.js').TouhouBulletContext['spawnCancelItem'];
  boss?: GameBossActor | null;
  addScore?: (amount: number, source: unknown) => void;
  cancelCircle: NonNullable<TouhouPlayerContext['cancelCircle']>;
  cancelRectangle: NonNullable<TouhouPlayerContext['cancelRectangle']>;
}
type BossHold = {invulnerable?: boolean; primaryFlags: number; notified: boolean};
type BossDefeatEntry = {enemy: TouhouEnemy; source: unknown; sequence: TouhouBossDefeat; spell: TouhouSpell | null; spellIndex: number; spellGeneration: number};
type SystemName = keyof TouhouGameSystems;
type SystemOptions<K extends SystemName> = NonNullable<TouhouGameSystemOptions[K]>;
type SystemConstructor<K extends SystemName> = new(options: SystemOptions<K>) => TouhouGameSystems[K];

import type {AnmBank} from './anm.js';
import type {TouhouBitmapFont} from './font.js';
import type {TouhouBossHudEnemy,TouhouBossHudState} from './boss-hud.js';
import type {TouhouBossEntranceOptions} from './boss-entrance.js';
import type {TouhouBossPresentationOptions} from './boss-presentation.js';
import type {TouhouBossDefeatOptions} from './boss-defeat.js';
import type {TouhouBossEscapeOptions} from './boss-escape.js';
import type {TouhouEnemyOptions,TouhouEnemyContext} from './enemy.js';
import type {TouhouSpellContext} from './spell.js';
import type {TouhouPauseOptions} from './pause.js';
import type {TouhouContinueSession,TouhouGameOverOptions} from './game-over.js';
import type {TouhouPauseCapture} from './pause-capture.js';
import type {TouhouWorld,TouhouWorldBounds} from './world.js';
import type {Task,TaskHandle} from '../core.js';

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
 banks:Record<string,AnmBank>;font:TouhouBitmapFont;sht:TouhouSht;styles:TouhouBulletStyle[];
 character?:string|number;difficulty?:number;power?:number;seed?:number;rng?:TouhouRNG;visualRng?:TouhouRNG;
 world?:TouhouWorld;bounds?:Partial<TouhouWorldBounds>;
 systemOptions?:{[K in keyof TouhouGameSystems]?:Partial<NonNullable<TouhouGameSystemOptions[K]>>};factories?:TouhouGameFactories;
 stage?:((game:TouhouGame,frame:number)=>void)|{update(game:TouhouGame):void;destroy?():void}|null;renderTarget?:number|null;compositeTarget?:number|null;renderBackground?:(draw:DrawList,game:TouhouGame)=>void;
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

import { DrawList } from '../index.js';
import { Keys } from '../index.js';
import { TouhouPlayer } from './player.js';
import { TouhouBulletField } from './bullets.js';
import { TouhouHud } from './hud.js';
import { TouhouEnemy } from './enemy.js';
import { TouhouEnemyDistortion } from './distortion.js';
import { TouhouButtons } from './menu.js';
import { TouhouPause } from './pause.js';
import { TouhouLaserField } from './lasers.js';
import { TouhouSpell } from './spell.js';
import { TouhouGrazeEffects } from './short-line.js';
import { TouhouItems, type TouhouItemOptions } from './items.js';
import { TouhouRNG } from './math.js';
import { TouhouDamageAccumulator } from './damage.js';
import { TouhouGameOver } from './game-over.js';
import { TouhouRenderQueue } from './render-queue.js';
import { TouhouBossHud } from './boss-hud.js';
import { TouhouBossPresentation } from './boss-presentation.js';
import { TouhouBossDefeat, TOUHOU_BOSS_DEFEAT_PRESET } from './boss-defeat.js';
import { TouhouBossEscape } from './boss-escape.js';
import { TouhouGameplayCompositor } from './gameplay-compositor.js';
import { TaskRunner } from '../task.js';
import { resolveTouhouWorld } from './world.js';

const finishTimedOutSpell = ({game, spell}: TouhouSpellTimeoutEvent) => spell.timeout(game.context);

export const TOUHOU_GAME_VIEW: Readonly<{x:number;y:number;scale:number;screenScale:number}>=Object.freeze({x:336,y:24,scale:1.5,screenScale:1});
export const TOUHOU_VIEWPORT: Readonly<{x:number;y:number;width:number;height:number}>=Object.freeze({x:48,y:24,width:576,height:672});

/** Common original systems composition. Platform resources, stage and callbacks
 * are injected; no Node, browser, native globals or fixed boss scripts. */
export class TouhouGame {
  declare systemOptions: NonNullable<TouhouGameOptions['systemOptions']>;
  declare bossDefeatHandlers: WeakMap<object, TouhouBossDefeatedHandler | null>;
  declare bossRegistry: Map<object | null | undefined, {combatActive: boolean}>;
  declare bossHolds: Map<object | null | undefined, BossHold>;
  declare effects: AnmInstance[];
  declare damage: TouhouDamageAccumulator;
  declare onSpellTimeout: (((event: TouhouSpellTimeoutEvent) => void) | null);
  declare timeoutGeneration: number;
  declare spellBoss: GameBossActor | null;
  declare factories: TouhouGameFactories;
  declare banks: Record<string, AnmBank>;
  declare font: TouhouBitmapFont;
  declare difficulty: number;
  declare stage: ((((game: TouhouGame, frame: number) => void) | { update(game: TouhouGame): void; }) & {destroy?: () => void}) | null;
  declare renderTarget: number | null;
  declare renderBackground: (((draw: DrawList, game: TouhouGame) => void) | undefined);
  declare onSound: (((id: number, x?: number) => void) | undefined);
  declare onStopSound: (((id: number) => void) | undefined);
  declare onEvent: (((name: string, data: unknown) => void) | undefined);
  declare onExit: ((() => void) | undefined);
  declare onRestart: ((() => void) | undefined);
  declare onReplay: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare onOptions: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare onManual: (((context: { pause: TouhouPause; close: () => void; }) => TouhouPausePage | void) | undefined);
  declare pauseBackground: (((draw: DrawList, pause: TouhouPause) => void) | undefined);
  declare pauseCapture: TouhouPauseCapture | undefined;
  declare view: Readonly<{ x: number; y: number; scale: number; screenScale: number; }>;
  declare viewport: Readonly<{ x: number; y: number; width: number; height: number; }>;
  declare disposeBanks: boolean;
  declare onDestroy: (((game: TouhouGame) => void) | undefined);
  declare destroyed: boolean;
  declare gameOverOptions: Partial<TouhouGameOverOptions>;
  declare pauseOptions: Partial<Omit<TouhouPauseOptions, "bank" | "initialMask" | "capture">>;
  declare pendingGameOver: boolean;
  declare nextEnemyId: number;
  declare buttons: TouhouButtons;
  declare pauseVisual: null | TouhouGameOver | TouhouPause;
  declare drawList: DrawList;
  declare renderQueue: TouhouRenderQueue;
  declare distortion: null | ({ center: { x: number; y: number; z?: number; } | ((game: TouhouGame) => { x: number; y: number; z?: number; }); effect: TouhouEnemyDistortion; });

  declare world: TouhouWorld;
  declare tasks: TaskRunner;
  declare player: TouhouPlayer;
  declare bullets: TouhouBulletField;
  declare lasers: TouhouLaserField;
  declare items: TouhouItems;
  declare enemies: TouhouEnemy[];
  declare hud: TouhouHud;
  declare bossHud: TouhouBossHud|null;
  declare bossPresentation: TouhouBossPresentation|null;
  declare bossDefeats: BossDefeatEntry[];
  declare bossEscapes: Array<{enemy:TouhouEnemy;source:unknown;sequence:TouhouBossEscape}>;
  declare onBossDefeated: TouhouBossDefeatedHandler|null;
  declare bossHudState: TouhouGameBossHudState;
  declare compositor: TouhouGameplayCompositor;
  declare spell: TouhouSpell;
  declare grazeEffects: TouhouGrazeEffects;
  declare context: TouhouGameContext;
  declare rng: TouhouRNG;
  declare visualRng: TouhouRNG;
  declare frame: number;
  declare paused: boolean;
  declare stageVisible: boolean;
  declare session: TouhouContinueSession;

  constructor({banks,font,sht,styles,character=0,difficulty=1,power,stage=null,
    renderTarget=null,compositeTarget=null,renderBackground,onSound,onStopSound,onEvent,onExit,onRestart,onReplay,onOptions,onManual,pauseBackground,pauseCapture,itemsFactory,
    seed=1,rng=new TouhouRNG(seed),visualRng=new TouhouRNG(seed),spellOptions={},spellContext={},session={},gameOverOptions={},pauseOptions={},
    view=TOUHOU_GAME_VIEW,viewport=TOUHOU_VIEWPORT,disposeBanks=false,onDestroy,bossPresentationOptions={},onBossDefeated=null,
    world,bounds,systemOptions={},factories={},onSpellTimeout=finishTimedOutSpell}: TouhouGameOptions={} as TouhouGameOptions) {
    if(onBossDefeated!==null&&typeof onBossDefeated!=='function')throw new TypeError('onBossDefeated must be a function or null');
    if(onSpellTimeout!==null&&typeof onSpellTimeout!=='function')throw new TypeError('onSpellTimeout must be a function or null');
    if(!Number.isSafeInteger(difficulty)||difficulty<0)throw new RangeError('TouhouGame difficulty must be a nonnegative integer; map menu identifiers in gameOptions');
    this.onBossDefeated=onBossDefeated;this.bossDefeatHandlers=new WeakMap();this.bossHolds=new Map();this.bossEscapes=[];
    this.bossRegistry=new Map();this.tasks=new TaskRunner();this.onSpellTimeout=onSpellTimeout;this.timeoutGeneration=-1;this.spellBoss=null;
    this.world=resolveTouhouWorld({world,bounds});this.systemOptions=systemOptions;this.factories=factories;
    const create=<K extends SystemName>(name: K,Type: SystemConstructor<K>,options: Partial<SystemOptions<K>>)=>this.createSystem(name,Type,options);
    Object.assign(this,{banks,font,difficulty,stage,renderTarget,renderBackground,onSound,onStopSound,onEvent,onExit,onRestart,onReplay,onOptions,onManual,pauseBackground,pauseCapture});
    this.rng=rng;this.visualRng=visualRng;this.view=view;this.viewport=viewport;this.disposeBanks=disposeBanks;this.onDestroy=onDestroy;this.destroyed=false;
    this.session={difficulty,stage:1,mode:0,continues:0,...session};this.gameOverOptions=gameOverOptions;this.pauseOptions=pauseOptions;this.pendingGameOver=false;
    this.player=create('player',TouhouPlayer,{character,sht,bank:character===0?banks.pl00:character===1?banks.pl01:undefined,effectBank:banks.effect,power,rng,world:this.world});
    this.player.score??=0;this.player.lifeFragments??=0;this.player.bombFragments??=0;
    this.bullets=create('bullets',TouhouBulletField,{bank:banks.bullet,styles,random:rng,visualRandom:visualRng,world:this.world});
    this.lasers=create('lasers',TouhouLaserField,{bank:banks.bullet,styles,world:this.world});
    this.grazeEffects=new TouhouGrazeEffects({rng:visualRng});
    this.hud=create('hud',TouhouHud,{bank:banks.front,textBank:banks.ascii_960,font,character:this.player.character,difficulty,lives:this.player.lives,bombs:this.player.bombs,
      maximumLives:this.player.maxLives,maximumBombs:this.player.maxBombs,maxPower:this.player.maxPower,powerPerLevel:this.player.rules.powerPerLevel,
      lifeFragmentThreshold:this.player.rules.lifeFragmentThreshold,bombFragmentThreshold:this.player.rules.bombFragmentThreshold});
    this.bossHud=banks.ascii_960?create('bossHud',TouhouBossHud,{bank:banks.front,textBank:banks.ascii_960,font,pointer:this.hud.roots[1],managePointer:false}):null;
    this.bossHudState={};
    this.enemies=[];this.bossDefeats=[];this.nextEnemyId=1;this.frame=0;this.buttons=new TouhouButtons();this.paused=false;this.pauseVisual=null;
    this.drawList=new DrawList();this.renderQueue=new TouhouRenderQueue();this.distortion=null;this.effects=[];this.stageVisible=true;
    this.compositor=new TouhouGameplayCompositor({renderTarget,compositeTarget,viewport,scale:view.scale??1.5});
    this.items=itemsFactory?itemsFactory(this.player,banks):create('items',TouhouItems,{player:this.player,bank:banks.bullet,effectBank:banks.effect,font,rng,difficulty,world:this.world});
    this.context={world:this.world,enemies:this.enemies,player:this.player,effectBank:banks.effect,deferEnemyContact:true,deferEnemyDamageFeedback:true,clockScale:1,timerRate:1,
      sound:(id,x)=>this.onSound?.(id,x),onEvent:(name,data)=>{if(name==='gameover')this.pendingGameOver=true;this.onEvent?.(name,data);},
      stopSound:id=>this.onStopSound?.(id),
      spawnItem:item=>this.items?.spawn(item),
      // Original mode 1 requests stone item 13, deliberately excluded; mode 4 may request a point item 2.
      spawnCancelItem:(position,kind,parameters)=>kind!==13&&typeof parameters==='object'
        ?this.items?.spawn({type:kind,...position,...parameters}):null,
      cancelCircle:(x,y,radius,options={})=>
        (options.bullets===false?0:this.bullets[options.nearby?'cancelNearbyCircle':'cancelCircle'](x,y,radius,{...options,dropMode:options.dropMode??(options.reward?1:0)}))+
        (options.lasers===false?0:this.lasers.cancelCircle(x,y,radius,options)),
      cancelRectangle:(x,y,width,height,angle,options={})=>
        (options.bullets===false?0:this.bullets.cancelRectangle(x,y,width,height,angle,{...options,dropMode:options.dropMode??(options.reward?1:0)}))+
        (options.lasers===false?0:this.lasers.cancelRectangle(x,y,width,height,angle,options)),
      finishLasers:()=>{for(const laser of this.lasers.lasers)this.lasers.erase(laser);},
      damageEnemy:(enemy,amount,source)=>this.isBossCombatReady(enemy)?this.damage.add(enemy,amount,source):0,
      deferEnemyDefeat:(enemy,source)=>this.notifyBossDefeated(enemy,source),
      isEnemyHeld:enemy=>this.destroyed||this.bossHolds.has(enemy),
      presentEnemyDeath:enemy=>(this.bossRegistry.has(enemy)||this.bossDefeats.some(entry=>entry.enemy===enemy))&&!!this.bossPresentation,
      enqueueGraze:effect=>this.grazeEffects.enqueue(effect),
      setStageVisible:visible=>{this.stageVisible=visible;},
      hudNumberInterrupt:label=>{for(const vm of this.bossHud?.numbers??[])vm.interruptNow(label);},
      hudNotice:(type,value)=>this.hud.notice(type,value,{spell:this.spell}),
      createNameAnimation:banks.text?.environment.createNameAnimation,
      ...spellContext,
    } as TouhouGameContext;
    this.spell=create('spell',TouhouSpell,{player:this.player,textBank:banks.ascii_960,effectBank:banks.effect,font,difficulty,context:this.context,...spellOptions});
    // The application and an embedded Boss encounter share the same original
    // presentation prefab. Game already ticks the adopted spell/HUD once.
    this.bossPresentation=this.bossHud?create('bossPresentation',TouhouBossPresentation,{banks:banks as TouhouBossPresentationOptions['banks'],player:this.player,font,
      visualRng:this.visualRng,...bossPresentationOptions,view,spell:this.spell,hud:this.bossHud,context:this.context,manageSpell:false,manageHud:false}):null;
    this.damage=create('damage',TouhouDamageAccumulator,{player:this.player,spell:this.spell});
    this.context.spell=this.spell;if(this.items)this.items.context=this.context;
    this.bullets.player=this.player;this.bullets.context=this.context;
    this.lasers.player=this.player;this.lasers.context=this.context;
  }
  createSystem<K extends SystemName>(name: K,Type: SystemConstructor<K>,defaults: Partial<SystemOptions<K>>,overrides?: Partial<SystemOptions<K>>): TouhouGameSystems[K]{
    const options={...defaults,...this.systemOptions[name],...overrides} as SystemOptions<K>,factory=this.factories[name];
    if(factory!==undefined&&typeof factory!=='function')throw new TypeError(`System factory ${name} must be a function`);
    return factory?factory(options,this):new Type(options);
  }
  spawnEnemy(options: Omit<TouhouEnemyOptions,'bank'>&{bank?:AnmBank}): TouhouEnemy{const enemy=this.createSystem('enemy',TouhouEnemy,{id:this.nextEnemyId++,bank:this.banks.enemy,world:this.world},options);this.enemies.push(enemy);return enemy;}
  registerBoss<T extends TouhouBossHudEnemy>(boss: T,{onDefeated}: Pick<TouhouGameBossOptions,'onDefeated'>={} as Pick<TouhouGameBossOptions,'onDefeated'>): T{
    if(!boss||!Number.isFinite(boss.x)||!Number.isFinite(boss.y))throw new TypeError('A Boss with finite x/y is required');
    if(onDefeated!==undefined&&onDefeated!==null&&typeof onDefeated!=='function')throw new TypeError('Boss onDefeated must be a function or null');
    if(!this.bossRegistry.has(boss))this.bossRegistry.set(boss,{combatActive:false});
    if(onDefeated!==undefined)this.bossDefeatHandlers.set(boss,onDefeated);
    return boss;
  }
  enterBoss(boss: TouhouBossHudEnemy,{entrance,onDefeated,...options}: TouhouGameBossOptions={} as TouhouGameBossOptions): TouhouBossPresentation{
    if(!this.bossPresentation)throw new Error('Original Boss presentation requires the common ascii_960 ANM bank');
    this.registerBoss(boss,{onDefeated});
    this.saveBossCombatState();
    if(this.context.boss!==boss)this.bossHudState={};
    this.context.boss=boss;this.bossPresentation.enter(boss,options);
    if(this.bossRegistry.get(boss)!.combatActive)this.bossPresentation.startCombat();
    if(entrance)this.bossPresentation.beginEntrance(entrance);
    return this.bossPresentation;
  }
  saveBossCombatState(){const entry=this.bossRegistry.get(this.context.boss);if(entry&&this.bossPresentation)entry.combatActive=this.bossPresentation.combatActive;}
  setBoss(boss: TouhouBossHudEnemy|null,options: TouhouGameBossOptions={} as TouhouGameBossOptions): TouhouBossPresentation|null{if(boss)return this.enterBoss(boss,options);this.saveBossCombatState();this.context.boss=null;this.bossHudState={};this.bossPresentation?.clearBoss();return null;}
  /** Presentation metadata only. A phase plan may supply healthBars and stars;
   * stage callbacks retain control of attacks, dialogue and phase progression. */
  setBossHud(state: TouhouGameBossHudState={} as TouhouGameBossHudState): this{Object.assign(this.bossHudState,state);return this;}
  startBossCombat(boss: TouhouBossHudEnemy | null | undefined=this.context.boss): this{const entry=this.bossRegistry.get(boss);if(entry)entry.combatActive=true;if(boss===this.context.boss)this.bossPresentation?.startCombat();return this;}
  stopBossCombat(boss: TouhouBossHudEnemy | null | undefined=this.context.boss): this{const entry=this.bossRegistry.get(boss);if(entry)entry.combatActive=false;if(boss===this.context.boss)this.bossPresentation?.stopCombat();return this;}
  isBossCombatReady(boss: object | null | undefined): boolean{
    const entry=this.bossRegistry.get(boss);if(!entry)return true;
    if(this.bossHolds.has(boss))return false;
    return boss===this.context.boss&&this.bossPresentation?this.bossPresentation.entranceReady&&this.bossPresentation.combatActive:entry.combatActive;
  }
  /** Cooperative scripts are owned by their actor and cancelled on removal. */
  runBossSequence(boss: TouhouEnemy,script: Task|((boss:TouhouEnemy)=>Task)): TaskHandle{return this.tasks.add(script,boss);}
  /** HP exhaustion is a stage event, not a death effect. Keep the body until
   * the stage explicitly resumes it, removes it or starts an exit preset. */
  notifyBossDefeated(enemy: TouhouEnemy|undefined,source: unknown=null){
    if(!this.bossRegistry.has(enemy)&&!this.bossHolds.has(enemy))return false;
    if(this.destroyed||!enemy?.alive)return true;
    if(this.bossDefeats.some(entry=>entry.enemy===enemy)||this.bossEscapes.some(entry=>entry.enemy===enemy))return true;
    this.holdBoss(enemy);
    const hold=this.bossHolds.get(enemy)!;
    if(hold.notified)return true;
    hold.notified=true;
    const event={game:this,boss:enemy,source};
    const handler=this.bossDefeatHandlers.has(enemy)?this.bossDefeatHandlers.get(enemy):this.onBossDefeated;
    if(handler){const script=handler(event);if(script?.next&&!this.destroyed&&enemy.alive)this.runBossSequence(enemy,script);}
    else this.context.onEvent?.('bossdefeated',event);
    return true;
  }
  /** Suspend entity updates/motion/contact without settling or clearing.
   * External tasks continue so dialogue and custom outcomes can still run. */
  holdBoss(enemy: TouhouEnemy=this.context.boss as TouhouEnemy): boolean{
    if(this.destroyed||!enemy?.alive)return false;
    if(!this.bossHolds.has(enemy))this.bossHolds.set(enemy,{invulnerable:enemy.invulnerable,primaryFlags:enemy.primaryFlags,notified:false});
    enemy.invulnerable=true;enemy.primaryFlags|=0x13;
    enemy.hitThisFrame=false;enemy.animation.flashColor=null;return true;
  }
  isBossHeld(enemy: TouhouEnemy=this.context.boss as TouhouEnemy): boolean{return this.bossHolds.has(enemy);}
  pruneBossSequences(){
    this.bossDefeats=this.bossDefeats.filter(entry=>entry.sequence?.alive!==false);
    this.bossEscapes=this.bossEscapes.filter(entry=>entry.sequence.alive);
  }
  /** The stage supplies the next phase's health and behavior before resuming. */
  resumeBoss(enemy: TouhouEnemy=this.context.boss as TouhouEnemy): boolean{
    const hold=this.bossHolds.get(enemy);
    if(!hold||this.destroyed||!enemy?.alive)return false;
    this.pruneBossSequences();
    if(this.bossDefeats.some(entry=>entry.enemy===enemy&&entry.sequence?.alive)||this.bossEscapes.some(entry=>entry.enemy===enemy&&entry.sequence.alive))return false;
    enemy.invulnerable=hold.invulnerable;
    enemy.primaryFlags=(enemy.primaryFlags&~0x13)|(hold.primaryFlags&0x13);
    this.bossHolds.delete(enemy);return true;
  }
  /** ECL entity retirement: no automatic rewards, ordinary death or inversion. */
  removeBoss(enemy: TouhouEnemy=this.context.boss as TouhouEnemy): boolean{
    if(this.destroyed||!enemy)return false;
    for(const entry of [...this.bossDefeats,...this.bossEscapes])if(entry.enemy===enemy)entry.sequence?.destroy();
    this.bossDefeats=this.bossDefeats.filter(entry=>entry.enemy!==enemy);
    this.bossEscapes=this.bossEscapes.filter(entry=>entry.enemy!==enemy);
    this.bossHolds.delete(enemy);this.bossDefeatHandlers.delete(enemy);this.bossRegistry.delete(enemy);
    for(const task of [...this.tasks.tasks,...this.tasks.pending])if(task.owner===enemy)this.tasks.cancel(task);
    enemy.alive=false;enemy.destroy?.();enemy.animation.destroy();
    if(this.context.boss===enemy)this.setBoss(null);
    return true;
  }
  /** Basic silent fly-away preset. Settlement, rewards, cancellation, dialogue
   * and any delay before starting it are deliberately separate stage actions. */
  beginBossEscape(enemy: TouhouEnemy=this.context.boss as TouhouEnemy,{source=null,...options}: Pick<TouhouBossEscapeOptions,'target'|'duration'|'easing'>&{source?:unknown}={}): TouhouBossEscape|null{
    if(this.destroyed||!enemy?.alive)return null;
    this.pruneBossSequences();
    const existing=this.bossEscapes.find(entry=>entry.enemy===enemy);
    if(existing)return existing.sequence;
    if(this.bossDefeats.some(entry=>entry.enemy===enemy))return null;
    const sequence=new TouhouBossEscape({...options,x:enemy.x,y:enemy.y,z:enemy.z??0,
      onMove:position=>{
        enemy.previous={x:enemy.x,y:enemy.y,z:enemy.z??0};
        enemy.x=position.x;enemy.y=position.y;enemy.z=position.z;
        if(enemy.motion?.position)Object.assign(enemy.motion.position,position);
        Object.assign(enemy.animation,position);
      },
      onEscape:owner=>{
        this.removeBoss(enemy);
        if(!this.destroyed)this.context.onEvent?.('bossescape',{enemy,source,sequence:owner});
      }});
    // Construction only validates; no user callback can observe a half owner.
    this.holdBoss(enemy);this.bossEscapes.push({enemy,source,sequence});
    if(this.context.boss===enemy)this.setBoss(null);
    return sequence;
  }
  /** Final defeat keeps the body and card alive through the source clearing
   * wave. A stage can start dialogue synchronously from the bossburst event.
   * Ordinary phase handoffs remain the stage's responsibility. */
  beginBossDefeat(enemy: TouhouEnemy=this.context.boss as TouhouEnemy,{source=null,...options}: Pick<TouhouBossDefeatOptions,'angle'|'speed'|'delayFrames'>&{source?:unknown}={}): TouhouBossDefeat|null{
    if(this.destroyed||!enemy?.alive)return null;
    this.pruneBossSequences();
    const existing=this.bossDefeats.find(entry=>entry.enemy===enemy);
    if(existing)return existing.sequence;
    if(this.bossEscapes.some(entry=>entry.enemy===enemy))return null;
    // Validate this facade's public parameters before retiring enemies or
    // locking the Boss. The sequence constructor validates too, but creates
    // its first clearing event synchronously, after scene ownership is set.
    const {delayFrames=TOUHOU_BOSS_DEFEAT_PRESET.delayFrames,speed=TOUHOU_BOSS_DEFEAT_PRESET.speed,angle}=options;
    const finite=(value: unknown)=>typeof value==='number'&&Number.isFinite(Math.fround(value));
    if(![enemy.x,enemy.y,enemy.z??0,speed].every(finite)||(angle!==undefined&&!finite(angle)))
      throw new TypeError('Boss defeat coordinates, angle and speed must be finite float32 values');
    if(!Number.isSafeInteger(delayFrames)||delayFrames<0||speed<0)
      throw new RangeError('Boss defeat requires nonnegative speed and integer delayFrames');
    const ownsSpell=(this.spellBoss??this.context.boss)===enemy;
    const entry: Omit<BossDefeatEntry,'sequence'> & {sequence:TouhouBossDefeat|null}={enemy,source,sequence:null,spell:ownsSpell&&this.spell.active?this.spell:null,
      spellIndex:this.spell.spellIndex,spellGeneration:this.spell.generation};
    // The owner is published before construction so synchronous callbacks can find it.
    // Its sequence is assigned before this method returns to consumers.
    this.bossDefeats.push(entry as BossDefeatEntry);
    this.holdBoss(enemy);
    // ECL525 removes ordinary enemies without invoking their death rewards.
    for(const other of this.enemies)if(other!==enemy&&other.alive&&!this.bossRegistry.has(other)&&!this.bossDefeats.some(record=>record.enemy===other)){
      this.removeBoss(other);
    }
    for(const charge of this.bossPresentation?.charges??[])charge.stop();
    entry.sequence=new TouhouBossDefeat({...options,x:enemy.x,y:enemy.y,z:enemy.z??0,rng:this.rng,
      sound:this.context.sound,
      cancelCircle:this.context.cancelCircle,
      clearAll:()=>{
        for(const bullet of this.bullets.bullets)if(bullet.state)this.bullets.cancel(bullet,0);
        for(const laser of this.lasers.lasers)if(laser.alive)this.lasers.erase(laser,{check:false});
      },
      onMove:position=>{
        enemy.x=position.x;enemy.y=position.y;
        if(enemy.motion?.position)Object.assign(enemy.motion.position,position);
        Object.assign(enemy.animation,position);
      },
      onBurst:sequence=>{
        // delayFrames:0 invokes this during construction. Publish the owner
        // before callbacks can inspect the scene, replace it or destroy it.
        entry.sequence=sequence;
        if(entry.spell?.active&&entry.spell.generation===entry.spellGeneration)entry.spell.capture(this.context);
        if(this.destroyed)return;
        enemy.defeat(source,{...this.context,deferEnemyDefeat:undefined});
        this.bossHolds.delete(enemy);this.bossDefeatHandlers.delete(enemy);this.bossRegistry.delete(enemy);
        if(this.destroyed)return;
        this.bossPresentation?.beginDeath({...sequence.position,follow:null,delayFrames:0});
        if(this.destroyed)return;
        this.context.onEvent?.('bossburst',{enemy,source,sequence});
      }});
    if(this.destroyed)entry.sequence.destroy();
    return entry.sequence;
  }
  beginSpell(options: NonNullable<Parameters<TouhouSpell['begin']>[0]>={} as NonNullable<Parameters<TouhouSpell['begin']>[0]>): TouhouSpell{const boss=options.boss===undefined?this.context.boss??null:options.boss as GameBossActor | null;if(boss){this.enterBoss(boss);this.startBossCombat();}else this.setBoss(null);this.spellBoss=boss;this.timeoutGeneration=-1;boss?.health?.set?.(boss.hp,true);return this.spell.begin({...options,boss},this.context);}
  updateSpell(){
    this.spell.update({...this.context,boss:this.spellBoss??this.context.boss});
    if(!this.spell.active||this.spell.clockPaused||this.spell.remaining>0||this.timeoutGeneration===this.spell.generation)return;
    if(this.bossDefeats.some(entry=>entry.spell===this.spell&&entry.spellGeneration===this.spell.generation))return;
    const boss=this.spellBoss??this.context.boss;
    if(this.onSpellTimeout===finishTimedOutSpell&&this.bossHolds.has(boss))return;
    this.timeoutGeneration=this.spell.generation;
    const event={game:this,spell:this.spell,boss:boss as TouhouEnemy | null};
    if(this.onSpellTimeout)this.onSpellTimeout(event);else this.context.onEvent?.('spelltimeout',event);
  }
  postFrame(nowSeconds: number): number|null{return this.spell.postFrame(nowSeconds,this.context);}
  openGameOver(mask: number=0): void{
    this.pendingGameOver=false;this.paused=true;
    this.pauseCapture?.capture();
    this.pauseVisual=new TouhouGameOver({bank:this.banks.front,font:this.font,player:this.player,session:this.session,
      sound:id=>this.onSound?.(id,0),onExit:this.onExit,onRestart:this.onRestart,initialMask:mask,
      drawBackground:this.pauseCapture?(draw=>this.pauseCapture!.draw(draw)):undefined,...this.gameOverOptions,
      onContinue:data=>{this.pauseCapture?.destroy();this.player.continues=this.session.continues;this.player.highScore=this.session.highScore;this.paused=false;this.gameOverOptions.onContinue?.(data);}});
  }
  setDistortion(center: {x:number;y:number;z?:number}|((game:TouhouGame)=>{x:number;y:number;z?:number}),options: ConstructorParameters<typeof TouhouEnemyDistortion>[0]={} as ConstructorParameters<typeof TouhouEnemyDistortion>[0]): TouhouEnemyDistortion{this.distortion={center,effect:new TouhouEnemyDistortion(options)};return this.distortion.effect;}
  update(mask: number=0): void{
    if(this.destroyed)return;
    this.buttons.update(mask);
    if(!this.paused&&(this.buttons.pressed&Keys.PAUSE)&&this.frame>29){
      this.paused=true;this.pauseVisual=new TouhouPause({continues:this.player.continues??0,
        sound:id=>this.onSound?.(id,0),onExit:this.onExit,onRestart:this.onRestart,
        onReplay:this.onReplay,onOptions:this.onOptions,onManual:this.onManual,drawBackground:this.pauseBackground,...this.pauseOptions,
        bank:this.banks.front,initialMask:mask,capture:this.pauseCapture,onResume:()=>{this.paused=false;this.pauseOptions.onResume?.();}});return;
    }
    if(this.paused){this.pauseVisual!.update(mask);if(this.pauseVisual instanceof TouhouGameOver)this.pauseCapture?.update();if(!this.pauseVisual!.active)this.paused=false;return;}
    // Existing source helper actors run before projectile movement. A defeat
    // created by this frame's damage pass starts advancing on the next frame.
    const defeats=this.bossDefeats.slice(),escapes=this.bossEscapes.slice();
    if(typeof this.stage==='function')this.stage(this,this.frame);else this.stage?.update(this);
    if(this.destroyed)return;
    this.tasks.update(this.context);
    if(this.destroyed)return;
    for(const entry of defeats){entry.sequence?.update();if(this.destroyed)return;}
    for(const entry of escapes){entry.sequence.update();if(this.destroyed)return;}
    this.pruneBossSequences();
    for(const enemy of this.enemies){
      if(this.bossHolds.has(enemy)){
        for(const effect of enemy.effects)effect.update();enemy.effects=enemy.effects.filter(effect=>effect.alive);
        if(this.bossEscapes.some(entry=>entry.enemy===enemy))enemy.updateAnimation(this.context);
        else{enemy.animation.x=enemy.x;enemy.animation.y=enemy.y;enemy.animation.update();}
      }else enemy.update(this.context);
      if(this.destroyed)return;
    }
    this.player.update(mask,this.context);for(const enemy of this.enemies)if(this.isBossCombatReady(enemy))enemy.collidePlayer?.(this.player,this.context);
    this.bullets.update(this.player,this.context);this.lasers.update(this.player,this.context);
    this.damage.flush(this.context);if(this.destroyed)return;
    for(const enemy of this.enemies)if(!this.bossHolds.has(enemy))enemy.finishDamageFeedback?.(this.context);this.items?.update(this.context);
    this.updateSpell();if(this.destroyed)return;this.grazeEffects.update(this.context);
    this.enemies=this.enemies.filter(enemy=>enemy.alive||enemy.effects.length);this.context.enemies=this.enemies;
    this.bossPresentation?.update({boss:this.context.boss??null,clockScale:this.context.clockScale});
    this.bossHud?.update({...this.bossHudState,dialogue:!!this.bossHudState.dialogue||!this.bossPresentation?.combatActive,bosses:this.context.boss&&this.bossPresentation?.bossVisible!==false?[this.context.boss]:[],player:this.player,spell:this.spell,
      remainingFrames:this.spell.active?this.spell.remaining:-1,sound:this.context.sound});
    this.hud.update(this.player);
    if(this.distortion){const center=typeof this.distortion.center==='function'?this.distortion.center(this):this.distortion.center;this.distortion.effect.update(center);}
    for(const bank of new Set(Object.values(this.banks))){bank.updateDetached?.();bank.collect?.();}
    this.frame++;
    if(this.pendingGameOver)this.openGameOver(mask);
  }
  render(): DrawCommand[]{
    const draw=this.drawList.reset(),queue=this.renderQueue.reset(),view=this.view;
    draw.clear(0x000000ff);
    this.spell.draw(queue,view,this.bossPresentation?.screenView);
    this.bossPresentation?.drawAura(queue);
    this.bossPresentation?.drawEntrance(queue);
    this.bossPresentation?.drawCharge(queue);
    this.bossPresentation?.drawDeath?.(queue);
    for(const enemy of this.enemies)if(enemy!==this.context.boss||this.bossPresentation?.bossVisible!==false)enemy.draw(queue,view);
    this.items?.draw(queue,view);
    this.player.draw(queue,view);this.bullets.draw(queue,view);
    this.lasers.draw(queue,view);
    this.grazeEffects.draw(queue,view);
    for(const [name,bank] of Object.entries(this.banks))bank.drawDetached?.(queue,name==='front'?{x:0,y:0,scale:1,screenScale:1.5}:view);
    this.hud.draw(queue,this.player,{hideNumbers:this.paused});
    if(this.bossHud){this.bossHud.state.paused=this.paused;this.bossHud.draw(queue,this.bossPresentation?.screenView);}
    this.compositor.draw(draw,queue,{
      cameraOffset:this.bossPresentation?.cameraOffset,
      drawBackground:this.stageVisible&&this.renderBackground?(target=>this.renderBackground!(target,this)):undefined,
      drawDistortion:(target,texture)=>{
        if(this.distortion){
          target.sampler(texture,'bilinear','clamp','clamp').blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
          this.distortion.effect.draw(target,texture,{scale:view.scale??1.5});target.blendEnd();
        }else this.bossPresentation?.drawDistortion(target,texture,{scale:view.scale??1.5});
      },
    });
    if(this.paused)this.pauseVisual!.draw(draw);
    return draw.commands;
  }
  snapshot(): Record<string, unknown>{return {frame:this.frame,paused:this.paused,pause:this.paused?this.pauseVisual?.snapshot():null,session:{...this.session},player:this.player.snapshot(),enemies:this.enemies.map(enemy=>enemy.snapshot()),bossHolds:[...this.bossHolds].map(([enemy,hold])=>({enemyId:(enemy as TouhouEnemy).id,notified:hold.notified})),bossEscapes:this.bossEscapes.map(entry=>({enemyId:entry.enemy.id,...entry.sequence.snapshot()})),bossDefeats:this.bossDefeats.map(entry=>({enemyId:entry.enemy.id,...entry.sequence!.snapshot()})),bullets:this.bullets.snapshot(),lasers:this.lasers.snapshot(),items:this.items?.snapshot?.()??null,spell:this.spell.snapshot(),rng:this.rng.state,visualRng:this.visualRng.state};}
  destroy(): void{
    if(this.destroyed)return;
    this.destroyed=true;this.tasks.clear();this.stage?.destroy?.();
    for(const entry of [...this.bossDefeats,...this.bossEscapes])entry.sequence?.destroy();
    this.bossDefeats.length=0;this.bossEscapes.length=0;this.bossHolds.clear();this.bossRegistry.clear();this.bossDefeatHandlers=new WeakMap();
    this.damage.clear();this.player.destroy?.();this.pauseVisual?.destroy();this.pauseCapture?.destroy();this.bossPresentation?.destroy();
    this.items?.destroy?.();this.bullets.destroy?.();this.lasers.destroy?.();this.damage.destroy?.();
    for(const enemy of this.enemies)enemy.destroy?.();
    this.spell.destroy();this.grazeEffects.clear();this.bossHud?.destroy();this.hud.destroy();
    for(const bank of new Set(Object.values(this.banks))){for(const vm of bank.instances)vm.destroy();if(this.disposeBanks)bank.dispose();}
    this.onDestroy?.(this);
  }
}
