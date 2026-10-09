import type {BossKey,RushPhase} from './types.js';
// SPDX-License-Identifier: GPL-3.0-only
import { sunnyPhases } from './sunny.js';
import { monstonePhases } from './monstone.js';
import { artiaPhases } from './artia.js';
export const BOSSES:ReadonlyArray<{key:BossKey;name:string;texture:string;music:string;phases:RushPhase[]}> = Object.freeze([
  {key:'sunny',name:'Sunny Milk',texture:'src_sunnymilk',music:'grassland',phases:sunnyPhases},
  {key:'monstone',name:'Monstone',texture:'src_monstone',music:'riverside',phases:monstonePhases},
  {key:'artia',name:'Artia',texture:'src_artia',music:'frozenforest',phases:artiaPhases},
]);
export const allPhases = BOSSES.flatMap(b=>b.phases);
