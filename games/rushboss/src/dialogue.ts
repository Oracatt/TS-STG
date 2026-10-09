// SPDX-License-Identifier: GPL-3.0-only
import type {TouhouResources,TouhouDialogueEvent,TouhouDialogueStep,TouhouDialogueOptions} from '@ts-stg/thlib/touhou';

import {TouhouDialogue} from '@ts-stg/thlib/touhou';
import {RUSH_DIALOGUE_DATA} from './dialogue-data.js';
const names:Record<string,string>={sunny:'Sunny Milk',monstone:'Monstone',artia:'Artia'};
export interface RushDialogueOptions extends Omit<TouhouDialogueOptions,'resources'>{bossId?:string;phase?:string;onRevealBoss?:(event:TouhouDialogueEvent,step:TouhouDialogueStep)=>void;onMusic?:(event:TouhouDialogueEvent,step:TouhouDialogueStep)=>void;}
/** Original business words/timing/events with public Touhou dialogue and injectable portraits. */
export class RushDialogue extends TouhouDialogue {
 declare sequence:import('./dialogue-data.js').RushDialogueSequence|null;declare bossId:string|undefined;declare phase:string;
  constructor(resources:TouhouResources,{bossId,character=0,phase='before',onRevealBoss,onMusic,onComplete,onEvent,playerPortrait,...options}:RushDialogueOptions={}){
    const sequence=RUSH_DIALOGUE_DATA.sequences[`${bossId}:${character}:${phase}`];
    super({resources,character,playerPortrait,codePage:936,steps:sequence?.steps??[],startDelayFrames:sequence?.startDelayFrames??0,skipHoldFrames:1,speakerNames:{right:names[bossId!]??bossId},
      onEvent:(event,step,dialogue)=>{if(event.type==='revealBoss')onRevealBoss?.(event,step);if(event.type==='music')onMusic?.(event,step);onEvent?.(event,step,dialogue);},onComplete,...options});
    this.sequence=sequence??null;this.bossId=bossId;this.phase=phase;
  }
}
export {RUSH_DIALOGUE_DATA};
