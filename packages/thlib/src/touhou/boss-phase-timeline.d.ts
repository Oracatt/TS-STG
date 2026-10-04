/** Cue payloads belong to the consumer. Only the nonnegative integer frame is interpreted by the clock. */
export interface TouhouBossPhaseCue { frame:number;[key:string]:unknown; }
export interface TouhouBossPhaseTimelineOptions<Cue extends TouhouBossPhaseCue = TouhouBossPhaseCue> {
  attackStartFrame?:number;
  /** Preparation already present before the authored pattern's first attack. */
  patternLeadIn?:number;
  cues?:readonly Cue[];
  onCue?:((cue:Readonly<Cue>,timeline:TouhouBossPhaseTimeline<Cue>)=>void)|null;
}
export interface TouhouBossPhaseTimelineSnapshot {
  frame:number;attackStartFrame:number;patternLeadIn:number;patternStartFrame:number;
  patternReady:boolean;attackStarted:boolean;cuesDispatched:number;
}
/** Construction and reset dispatch frame-zero cues synchronously. The callback's
 * second argument is the new owner, even before its caller assigns the instance. */
export class TouhouBossPhaseTimeline<Cue extends TouhouBossPhaseCue = TouhouBossPhaseCue> {
  constructor(options?:TouhouBossPhaseTimelineOptions<Cue>);
  readonly frame:number;readonly attackStartFrame:number;readonly patternLeadIn:number;
  readonly cues:readonly Readonly<Cue>[];
  readonly patternStartFrame:number;readonly patternReady:boolean;readonly attackStarted:boolean;
  reset(options?:TouhouBossPhaseTimelineOptions<Cue>):this;
  update():this;
  dispatchCues():this;
  snapshot():TouhouBossPhaseTimelineSnapshot;
}
