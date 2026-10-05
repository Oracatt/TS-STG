import {TouhouReimuBomb,TouhouMarisaBomb} from './bombs.js';
import {fireTouhouPlayerWeapons} from './shots.js';

/** Optional original character presets; custom characters supply their own
 * profile and keep using the same player state, movement and collision owner. */
export const TOUHOU_PLAYER_PROFILES=Object.freeze({
  reimu:Object.freeze({id:0,shoot:fireTouhouPlayerWeapons,bombFactory:(player,context)=>new TouhouReimuBomb(player,context)}),
  marisa:Object.freeze({id:1,shoot:fireTouhouPlayerWeapons,bombFactory:(player,context)=>new TouhouMarisaBomb(player,context)}),
});
