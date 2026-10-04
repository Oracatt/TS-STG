import type {TouhouPlayer,TouhouPlayerContext,TouhouDamageTarget} from './player.js';
import type {TouhouSpell} from './spell.js';
export class TouhouHealth{constructor(hp?:number,options?:{spell?:boolean;threshold?:number});hp:number;maximum:number;scaledHp:number;threshold:number;damageTotal:number;flags:number;set(hp:number,spell?:boolean):this;apply(amount:number):number;record(amount:number):void;}
export interface TouhouEnemyDamageOptions{primaryFlags?:number;damageInvulnerability?:{readonly current:number}|null;}
/** Records protected hits without changing HP. The owner advances its timer after the damage pass. */
export function applyTouhouEnemyDamage(health:TouhouHealth,amount:number,options?:TouhouEnemyDamageOptions):number;
export class TouhouDamageAccumulator{constructor(options:{player:TouhouPlayer;spell?:TouhouSpell|null});add(enemy:TouhouDamageTarget,amount:number,source?:unknown):void;flush(context?:TouhouPlayerContext&{playerDamageScale?:number;addScore?:(amount:number,source:unknown)=>void;applyEnemyDamage?:(enemy:TouhouDamageTarget,amount:number,source:unknown)=>void}):Array<{enemy:TouhouDamageTarget;nominal:number;amount:number}>;clear():void;}
