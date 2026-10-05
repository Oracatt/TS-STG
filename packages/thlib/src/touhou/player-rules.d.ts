export interface TouhouPlayerRules {
  initialPower:number;initialLives:number;initialBombs:number;
  maxPower:number;powerPerLevel:number;startingPower:number;minimumPower:number;
  maxLives:number;maxBombs:number;bombStockLimit:number;respawnBombs:number;
  lifeFragmentThreshold:number;bombFragmentThreshold:number;fragmentLimit:number;
  lifeExtendLimit:number;extraLifeExtendLimit:number;
  collectSpeed:number;collectRadius:number;attractRadius:number;collectLine:number;
  normalRadius:number;focusRadius:number;normalExtent:Readonly<{x:number;y:number}>;focusExtent:Readonly<{x:number;y:number}>;
  deathbombFrames:number;hitInvulnerability:number;deathInvulnerability:number;respawnInvulnerability:number;
  deathPowerLoss:readonly number[];deathDropCount:number;
  pointValueMinimum:number;pointValueMaximum:number;
}
export const TOUHOU_PLAYER_RULES:Readonly<TouhouPlayerRules>;
export function resolveTouhouPlayerRules(...profiles:Array<Partial<TouhouPlayerRules>|undefined>):Readonly<TouhouPlayerRules>;
