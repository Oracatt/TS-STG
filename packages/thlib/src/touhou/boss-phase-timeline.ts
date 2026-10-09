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

function frameValue(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative integer frame`);
  return value;
}

/** A phase's preparation and attack clocks, independent of its health owner.
 * Original ECL scripts keep advancing presentation and the damage-protection
 * timer while waiting to start an attack. A host should keep those owners
 * running and gate only its authored pattern on patternReady. patternLeadIn
 * describes preparation already present in that pattern; it is not another
 * delay added after attackStartFrame. This class contains no stage data.
 */
export class TouhouBossPhaseTimeline<Cue extends TouhouBossPhaseCue = TouhouBossPhaseCue> {
  declare onCue: null | (((cue: Cue, timeline: TouhouBossPhaseTimeline<Cue>) => void) | null);
  declare generation: number;
  declare nextCue: number;

  declare readonly frame: number;
  declare readonly attackStartFrame: number;
  declare readonly patternLeadIn: number;
  declare readonly cues: readonly Readonly<Cue>[];

  constructor(options: TouhouBossPhaseTimelineOptions<Cue> = {} as TouhouBossPhaseTimelineOptions<Cue>) {
    this.attackStartFrame = 0; this.patternLeadIn = 0; this.cues = [];
    this.onCue = null; this.generation = 0;
    this.reset(options);
  }
  /** Reset also dispatches frame-zero cues, including on construction. A cue
   * callback receives this owner as its second argument, so it need not close
   * over an instance that the caller has not assigned yet. */
  reset({ attackStartFrame = this.attackStartFrame, patternLeadIn = this.patternLeadIn,
    cues = this.cues, onCue = this.onCue }: TouhouBossPhaseTimelineOptions<Cue> = {} as TouhouBossPhaseTimelineOptions<Cue>): this {
    frameValue(attackStartFrame, 'attackStartFrame'); frameValue(patternLeadIn, 'patternLeadIn');
    if (!Array.isArray(cues)) throw new TypeError('Phase cues must be an array');
    if (onCue !== null && typeof onCue !== 'function') throw new TypeError('onCue must be a function or null');
    const ordered = cues.map((cue, index) => {
      if (!cue || typeof cue !== 'object') throw new TypeError('Each phase cue must be an object');
      frameValue(cue.frame, 'Cue frame');
      return { cue: Object.freeze({ ...cue }), index };
    }).sort((a, b) => a.cue.frame - b.cue.frame || a.index - b.index);
    (this as {attackStartFrame:number}).attackStartFrame = attackStartFrame; (this as {patternLeadIn:number}).patternLeadIn = patternLeadIn;
    (this as {cues:readonly Readonly<Cue>[]}).cues = Object.freeze(ordered.map(entry => entry.cue)); this.onCue = onCue;
    (this as {frame:number}).frame = 0; this.nextCue = 0; this.generation++;
    this.dispatchCues(); return this;
  }
  get patternStartFrame(): number { return Math.max(0, this.attackStartFrame - this.patternLeadIn); }
  get patternReady(): boolean { return this.frame >= this.patternStartFrame; }
  get attackStarted(): boolean { return this.frame >= this.attackStartFrame; }
  dispatchCues(): this {
    const generation = this.generation;
    while (generation === this.generation && this.nextCue < this.cues.length && this.cues[this.nextCue].frame <= this.frame) {
      const cue = this.cues[this.nextCue++]; this.onCue?.(cue, this);
    }
    return this;
  }
  /** Call once per fixed simulation frame. Do not also advance it for hits,
   * draw calls, or each projectile spawned by an authored pattern. */
  update(): this {
    frameValue(this.frame + 1, 'Timeline frame'); (this as {frame:number}).frame++;
    return this.dispatchCues();
  }
  snapshot(): TouhouBossPhaseTimelineSnapshot {
    return { frame: this.frame, attackStartFrame: this.attackStartFrame, patternLeadIn: this.patternLeadIn,
      patternStartFrame: this.patternStartFrame, patternReady: this.patternReady,
      attackStarted: this.attackStarted, cuesDispatched: this.nextCue };
  }
}
