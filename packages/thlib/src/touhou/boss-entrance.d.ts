import type { DrawList } from '../core.js';
import type { AnmBank, AnmInstance, AnmView } from './anm.js';
export type TouhouBossEntranceMode = 'blackFog' | 'flyIn';
export interface TouhouBossEntranceStream { script:number;rotation:number; }
export const TOUHOU_BOSS_ENTRANCE_PRESETS:Readonly<Record<TouhouBossEntranceMode,Readonly<{
  revealFrame:number;readyFrame:number;sound:number|null;streams:readonly Readonly<TouhouBossEntranceStream>[];
}>>>;
export interface TouhouBossEntranceOptions {
  mode?:TouhouBossEntranceMode;x?:number;y?:number;z?:number;follow?:{x:number;y:number;z?:number}|null;
  /** The original black-fog preset reveals the Boss body after 101 frames. */
  revealFrame?:number;
  /** Earliest dialogue/combat start. For a fly-in, set this to the caller's movement duration. */
  readyFrame?:number;streams?:readonly TouhouBossEntranceStream[];
  sound?:((id:number,x:number)=>void)|null;
  onReveal?:((entrance:TouhouBossEntrance)=>void)|null;
  /** Runs after ready and after the final source particle finishes. */
  onComplete?:((entrance:TouhouBossEntrance)=>void)|null;
}
export class TouhouBossEntrance {
  constructor(bank:AnmBank,options?:TouhouBossEntranceOptions);
  bank:AnmBank;mode:TouhouBossEntranceMode;position:{x:number;y:number;z:number};follow:TouhouBossEntranceOptions['follow'];
  age:number;alive:boolean;revealed:boolean;ready:boolean;completed:boolean;cancelled:boolean;readonly isHidden:boolean;
  revealFrame:number;readyFrame:number;roots:AnmInstance[];particles:AnmInstance[];
  /** Deliver pending age-zero callbacks after an owner has assigned this instance. update also dispatches them. */
  dispatchEvents():this;update():this;draw(draw:DrawList,view?:AnmView):DrawList;destroy():void;snapshot():Record<string,unknown>;
}
