import type {BossKey} from './types.js';

// SPDX-License-Identifier: GPL-3.0-only
// Business reward quantities follow the same TH20 stage/card mapping as the HP
// profile. Distribution, velocity, collection and reward application are thlib.
function reward(stage: number,line: number,power: number,point: number,centerType=0){
  return Object.freeze({counts:Object.freeze({power,point}),centerType,radius:64,
    source:Object.freeze({file:`scripts/recovered/ecl/st0${stage}bs.ecl.txt`,line})});
}
export const RUSH_BOSS_DROP_PROFILES:Readonly<Record<BossKey,Readonly<Partial<Record<number,ReturnType<typeof reward>>>>>>=Object.freeze({
  sunny:Object.freeze({2:reward(3,202,15,15),4:reward(3,354,15,15),6:reward(3,521,15,15),
    7:reward(3,1381,20,20,4)}),
  monstone:Object.freeze({2:reward(4,174,30,30),4:reward(4,313,30,30),6:reward(4,442,35,35),
    // The additional survival card shares stage5 BossCard3's HP/reward profile.
    8:reward(5,553,40,40),9:reward(4,1157,20,20,4)}),
  artia:Object.freeze({2:reward(6,166,25,25),4:reward(6,299,25,25,6),6:reward(6,458,25,25),
    8:reward(6,575,25,25),10:reward(6,701,25,25),12:reward(6,746,60,60)}),
});
export const rushBossDrops=(boss: BossKey,phaseNumber: number)=>RUSH_BOSS_DROP_PROFILES[boss]?.[phaseNumber]??null;
