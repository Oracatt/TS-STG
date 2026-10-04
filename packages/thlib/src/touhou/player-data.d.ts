import type {TouhouSht} from './shot-data.js';
export const TOUHOU_PLAYER_DATA:readonly TouhouSht[];
export function getTouhouPlayerData(character?:0|1|'reimu'|'marisa'):TouhouSht;
