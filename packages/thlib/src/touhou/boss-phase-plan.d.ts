import type {TouhouBossHealthBar} from './boss-hud.js';
export interface TouhouBossPhaseDescriptor {spell?:boolean;hp?:number;maximumHp?:number;maxHp?:number;healthWeight?:number;healthGroup?:unknown;}
export interface TouhouBossPhasePlanOptions<T> {
 isSpell?:(phase:T,index:number)=>boolean;
 weight?:(phase:T,index:number)=>number;
 /** Equal adjacent non-null keys form an explicit group. */
 group?:(phase:T,index:number)=>unknown;
 /** Original preset: five sections. Larger groups require corresponding HUD marker capacity. */
 maxSections?:number;
 /** shared (default): source whole-group arc. full: each spell uses its own
  * complete ring immediately; nonspells retain grouped sections. HP is unchanged. */
 spellRing?:'shared'|'full';
}
/** Maps caller-owned phase health onto source ECL-style shared health rings. */
export class TouhouBossPhasePlan<T = TouhouBossPhaseDescriptor> {
 constructor(phases:readonly T[],options?:TouhouBossPhasePlanOptions<T>);
 spellRing:'shared'|'full';
 phases:Array<{phase:T;index:number;spell:boolean;weight:number;group:unknown;groupIndex:number}>;
 groups:Array<{index:number;start:number;end:number;maximum:number;markers:number[]}>;
 hudState(index:number,state?:{hp?:number;maximumHp?:number}):{remainingSpells:number;healthBars:TouhouBossHealthBar[]};
}
