import type {TouhouPlayerRules} from './player-rules.js';
export type TouhouPointValueProfile=Readonly<Pick<TouhouPlayerRules,'pointValueGrazeStep'|'pointValueGrazeGain'|'pointItemDivisor'>>;
export interface TouhouPointValueState{pointValue:number;graze:number;rules?:Partial<TouhouPlayerRules>;}
import {TOUHOU_PLAYER_RULES} from './player-rules.js';

/** Public scoring choices, independent of characters, stages and special items.
 * classic: official TH13 ten-graze/ten-point rule and a full-value ordinary point.
 * reference: recovered no-stone reward arithmetic used by existing validation.
 * Neither profile introduces faith, season, stone or cancellation collectibles. */
export const TOUHOU_POINT_VALUE_PROFILES=Object.freeze({
  reference:Object.freeze({pointValueGrazeStep:0,pointValueGrazeGain:0,pointItemDivisor:2}),
  classic:Object.freeze({pointValueGrazeStep:10,pointValueGrazeGain:10,pointItemDivisor:1}),
});
type PointValueRule = 'pointValueMinimum' | 'pointValueMaximum' | 'pointValueGrazeStep' | 'pointValueGrazeGain' | 'pointItemDivisor';
const rule=(rules:Partial<TouhouPlayerRules>|undefined,key:PointValueRule)=>rules?.[key]??TOUHOU_PLAYER_RULES[key];

/** Retains the original signed32 normalization and configured shared bounds. */
export function clampTouhouPointValue(value: number|undefined,rules: Partial<TouhouPlayerRules>=TOUHOU_PLAYER_RULES): number{
  const minimum=rule(rules,'pointValueMinimum'),maximum=rule(rules,'pointValueMaximum');
  return Math.max(minimum,Math.min(maximum,(value??minimum)|0));
}

/** Called after the public graze counter changes. Crossed integer buckets are
 * derived from that counter, so there is no second clock or hidden remainder. */
export function addTouhouPointValueForGraze(player: TouhouPointValueState,previousGraze: number): number{
  const rules=player.rules,step=rule(rules,'pointValueGrazeStep'),gain=rule(rules,'pointValueGrazeGain');
  if(step>0&&gain>0){
    const buckets=Math.max(0,Math.floor(player.graze/step)-Math.floor(previousGraze/step));
    player.pointValue=Math.min(rule(rules,'pointValueMaximum'),clampTouhouPointValue(player.pointValue,rules)+buckets*gain);
  }
  return player.pointValue;
}

/** Full-value blue point before the common height/attraction attenuation. */
export function touhouPointItemValue(player: Pick<TouhouPointValueState,'pointValue'|'rules'>): number{
  player.pointValue=clampTouhouPointValue(player.pointValue,player.rules);
  return Math.trunc(player.pointValue/rule(player.rules,'pointItemDivisor'));
}
