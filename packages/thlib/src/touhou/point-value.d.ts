import type {TouhouPlayerRules} from './player-rules.js';
export type TouhouPointValueProfile=Readonly<Pick<TouhouPlayerRules,'pointValueGrazeStep'|'pointValueGrazeGain'|'pointItemDivisor'>>;
export const TOUHOU_POINT_VALUE_PROFILES:Readonly<{reference:TouhouPointValueProfile;classic:TouhouPointValueProfile}>;
export interface TouhouPointValueState{pointValue:number;graze:number;rules?:Partial<TouhouPlayerRules>;}
/** Original signed32 normalization followed by configured minimum/maximum. */
export function clampTouhouPointValue(value:number|undefined,rules?:Partial<TouhouPlayerRules>):number;
/** Apply growth for crossed graze buckets after changing player.graze; returns the current point value. */
export function addTouhouPointValueForGraze(player:TouhouPointValueState,previousGraze:number):number;
/** Clamp pointValue and calculate the full ordinary point reward before height attenuation. */
export function touhouPointItemValue(player:Pick<TouhouPointValueState,'pointValue'|'rules'>):number;
