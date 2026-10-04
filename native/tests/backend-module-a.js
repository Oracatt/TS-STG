import {readAlpha} from './backend-module-b.js';
export let alpha=41;
export const cycleValue=()=>readAlpha()+1;
export function advanceAlpha(){alpha++;}
