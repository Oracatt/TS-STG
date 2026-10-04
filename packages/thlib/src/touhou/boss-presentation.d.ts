import type { DrawList } from '../core.js';
import type { AnmBank, AnmInstance, AnmView } from './anm.js';
import type { TouhouPlayer } from './player.js';
import type { TouhouSpell, TouhouSpellContext, TouhouSpellRecord } from './spell.js';
import type { TouhouBossHud, TouhouBossHudEnemy, TouhouBossHudState } from './boss-hud.js';
import type { TouhouBitmapFont } from './font.js';
import type { TouhouEnemyDistortion, TouhouMeshDrawing } from './distortion.js';
import type { TouhouBossDeath, TouhouBossDeathOptions } from './boss-death.js';
import type { TouhouBossEntrance, TouhouBossEntranceOptions } from './boss-entrance.js';
import type { TouhouRNG } from './math.js';
export const TOUHOU_BOSS_VIEW: Readonly<AnmView>;
export const TOUHOU_BOSS_SCREEN_VIEW: Readonly<AnmView>;
export const TOUHOU_BOSS_PROFILES: Readonly<Record<'boss' | 'midboss', Readonly<{ auraScripts: readonly number[]; radius: number; color: number }>>>;
export type TouhouBossChargeColor='magenta'|'red'|'blue'|'cyan'|'green'|'yellow'|'white';
export const TOUHOU_BOSS_CHARGE_PRESETS:Readonly<Record<TouhouBossChargeColor,Readonly<{chargeScript:number;releaseScript:number}>>>;
export interface TouhouBossChargeOptions {
  x?:number;y?:number;z?:number;color?:TouhouBossChargeColor;releaseColor?:TouhouBossChargeColor;
  repeatCount?:number;repeatInterval?:number;releaseFrame?:number;release?:boolean;follow?:{x:number;y:number;z?:number}|null;
  /** Optional nonnegative integer age in the owning phase's fixed clock.
   * Null uses one age increment per update. ANM roots still update once per call. */
  clock?:(()=>number)|null;
}
/** Original attack preparation cohorts; existing births keep their source position. */
export class TouhouBossCharge {
  constructor(bank:AnmBank,options?:TouhouBossChargeOptions);
  bank:AnmBank;position:{x:number;y:number;z:number};follow:TouhouBossChargeOptions['follow'];
  clock:TouhouBossChargeOptions['clock'];
  age:number;emitted:number;released:boolean;stopped:boolean;alive:boolean;roots:AnmInstance[];
  color:TouhouBossChargeColor;releaseColor:TouhouBossChargeColor;repeatCount:number;repeatInterval:number;releaseFrame:number;release:boolean;
  update():this;draw(draw:DrawList,view?:AnmView):DrawList;stop():this;destroy():void;snapshot():Record<string,unknown>;
}
export function createTouhouBossAuraView(view?:AnmView):AnmView;
export interface TouhouBossDisplayState {bonus?:number;captureEligible?:boolean;elapsedFrames?:number;records?:Record<number,TouhouSpellRecord>;}
export interface TouhouBossPresentationState extends TouhouBossHudState {
  boss?:TouhouBossHudEnemy|null;player?:TouhouPlayer;timerRate?:number;clockScale?:number;spellState?:TouhouBossDisplayState;
  /** Optional stage-owned attack-start/stop signal. Appearance readiness alone never starts combat. */
  combatActive?:boolean;
}
export interface TouhouBossPresentationOptions {
  banks:{effect:AnmBank;front:AnmBank;ascii_960:AnmBank;text?:AnmBank};player?:TouhouPlayer|null;font?:TouhouBitmapFont|null;
  context?:TouhouSpellContext & {shake?:TouhouBossDeathOptions['shake']};spellOptions?:ConstructorParameters<typeof TouhouSpell>[0];spell?:TouhouSpell|null;hud?:TouhouBossHud|null;
  manageSpell?:boolean;manageHud?:boolean;view?:AnmView;screenView?:AnmView;auraView?:AnmView|null;
  profile?:'boss'|'midboss';auraScripts?:number[]|null;distortion?:false|ConstructorParameters<typeof TouhouEnemyDistortion>[0];
  visualRng?:Pick<TouhouRNG,'next'>;
}
export class TouhouBossPresentation {
  constructor(options:TouhouBossPresentationOptions);
  banks:TouhouBossPresentationOptions['banks'];player:TouhouPlayer|null;spell:TouhouSpell;hud:TouhouBossHud;
  aura:AnmInstance[];auraScripts:number[];auraPending:boolean;combatActive:boolean;charges:TouhouBossCharge[];boss:TouhouBossHudEnemy|null;frame:number;alive:boolean;manageSpell:boolean;manageHud:boolean;
  deaths:TouhouBossDeath[];readonly hasDeathEffects:boolean;
  entrance:TouhouBossEntrance|null;readonly bossVisible:boolean;readonly bossEffectsVisible:boolean;readonly entranceReady:boolean;
  readonly cameraOffset:{x:number;y:number};visualRng:Pick<TouhouRNG,'next'>;
  view:AnmView;screenView:AnmView;context:TouhouSpellContext;distortion:TouhouEnemyDistortion|null;distortionReady:boolean;
  enter(boss:TouhouBossHudEnemy,options?:Pick<TouhouBossPresentationOptions,'distortion'>):this;
  /** Explicitly start persistent aura/warp on the next eligible update; idempotent between attack phases. */
  startCombat():this;
  /** Clear combat aura/warp and charges; does not finish spell rules or cancel independent death effects. */
  stopCombat():this;
  /** Beginning an actual spell also starts combat. */
  beginSpell(options?:Parameters<TouhouSpell['begin']>[0]):TouhouSpell;
  beginEntrance(options?:TouhouBossEntranceOptions):TouhouBossEntrance;
  /** Beginning attack preparation also starts combat. */
  beginCharge(options?:TouhouBossChargeOptions):TouhouBossCharge;
  beginDeath(options?:TouhouBossDeathOptions):TouhouBossDeath;
  setSpellState(state?:TouhouBossDisplayState):this;update(state?:TouhouBossPresentationState):this;
  draw(draw:DrawList,options?:{view?:AnmView;screenView?:AnmView}):DrawList;
  /** External Boss artwork: source layer7, before ordinary mist; respects entrance visibility.
   * ANM-backed bodies should retain their own vm.draw registration instead. */
  drawBody(draw:DrawList,render:(draw:DrawList,view:AnmView)=>void,options?:{view?:AnmView;layer?:number;order?:number}):DrawList;
  drawAura(draw:DrawList,view?:AnmView):DrawList;
  drawDeath(draw:DrawList,view?:AnmView):DrawList;
  drawEntrance(draw:DrawList,view?:AnmView):DrawList;
  drawCharge(draw:DrawList,view?:AnmView):DrawList;
  drawDistortion(draw:DrawList,texture:number,options?:TouhouMeshDrawing):DrawList;
  finishSpell(options?:{captured?:boolean;timeout?:boolean}):ReturnType<TouhouSpell['finish']>;
  clearBoss(updateHud?:boolean):this;snapshot():Record<string,unknown>;destroy():void;
}
