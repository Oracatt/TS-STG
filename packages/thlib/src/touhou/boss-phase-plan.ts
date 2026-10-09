import type {TouhouBossHealthBar} from './boss-hud.js';

export interface TouhouBossPhaseDescriptor {spell?:boolean;hp?:number;maximumHp?:number;maxHp?:number;healthWeight?:number;healthGroup?:unknown;}

export interface TouhouBossPhasePlanOptions<T> {
 isSpell?:(phase:T,index:number)=>boolean;
 weight?:(phase:T,index:number)=>number;
 /** Equal adjacent non-null keys form an explicit group. */
 group?:(phase:T,index:number)=>unknown;
 /** Original preset: five sections. Larger groups require corresponding HUD marker capacity. */
 maxSections?:number;
 /** shared (default): source whole-group arc. full: each spell uses its own
  * complete ring immediately; nonspells retain grouped sections. HP is unchanged. */
 spellRing?:'shared'|'full';
}

import { f32, add, mul, div } from './math.js';

/** Presentation policy only: attacks, damage, rewards and phase transitions stay
 * with the caller. Original ECL 511 sets a whole health group, 514 transitions
 * at a threshold, 527 publishes that threshold / maximum, and 534 supplies the
 * number of later spell cards. A nonspell and its following spell share a ring.
 * LuaSTG's card list is a useful authoring model; its HP ratios are not used. */
export class TouhouBossPhasePlan<T = TouhouBossPhaseDescriptor> {
  declare spellRing: 'shared'|'full';
  declare phases: Array<{phase:T;index:number;spell:boolean;weight:number;group:unknown;groupIndex:number}>;
  declare groups: Array<{index:number;start:number;end:number;maximum:number;markers:number[]}>;

  constructor(phases: readonly T[], { isSpell = phase => !!(phase as TouhouBossPhaseDescriptor).spell,
    weight = phase => ((phase as TouhouBossPhaseDescriptor).healthWeight ?? (phase as TouhouBossPhaseDescriptor).hp ?? (phase as TouhouBossPhaseDescriptor).maximumHp ?? (phase as TouhouBossPhaseDescriptor).maxHp)!,
    group = phase => (phase as TouhouBossPhaseDescriptor).healthGroup, spellRing = 'shared', maxSections = 5 }: TouhouBossPhasePlanOptions<T> = {} as TouhouBossPhasePlanOptions<T>) {
    if (!Array.isArray(phases)) throw new TypeError('Boss phases must be an array');
    if (spellRing !== 'shared' && spellRing !== 'full') throw new RangeError('Boss spellRing must be shared or full');
    if (!Number.isSafeInteger(maxSections) || maxSections < 1) throw new RangeError('maxSections must be a positive integer');
    this.spellRing = spellRing;
    this.phases = phases.map((phase, index) => {
      const value = f32(weight(phase, index));
      if (!Number.isFinite(value) || value <= 0) throw new RangeError('Each Boss phase needs a positive finite health weight');
      return { phase, index, spell: !!isSpell(phase, index), weight: f32(value), group: group(phase, index), groupIndex: -1 };
    });
    this.groups = [];
    for (let start = 0; start < this.phases.length;) {
      const first = this.phases[start]; let end = start;
      if (first.group !== undefined && first.group !== null) {
        while (end + 1 < this.phases.length && this.phases[end + 1].group === first.group) end++;
      } else {
        while (!this.phases[end].spell && end + 1 < this.phases.length &&
          (this.phases[end + 1].group === undefined || this.phases[end + 1].group === null)) end++;
      }
      if (end - start >= maxSections) throw new RangeError(`The Boss ring supports at most ${maxSections} sections; split the health group or configure its marker capacity`);
      let maximum = 0;
      for (let i = start; i <= end; i++) maximum = add(maximum, this.phases[i].weight);
      if (!Number.isFinite(maximum)) throw new RangeError('Boss health group exceeds float32 range');
      const index = this.groups.length, markers = [];
      for (let i = start; i < end; i++) {
        // Match hudState's remaining-health summation. Subtracting from the
        // maximum can round differently for custom fractional visual weights.
        let remaining = 0;
        for (let j = i + 1; j <= end; j++) remaining = add(remaining, this.phases[j].weight);
        markers.push(div(remaining, maximum));
      }
      this.groups.push({ index, start, end, maximum, markers });
      for (let i = start; i <= end; i++) this.phases[i].groupIndex = index;
      start = end + 1;
    }
  }
  /** hp / maximumHp is the current phase's logical health, not the whole ring.
   * Practice can construct a plan containing only its selected phase. Explicit
   * healthGroup and healthWeight (or selector functions) override auto grouping. */
  hudState(index: number, { hp, maximumHp }: {hp?:number;maximumHp?:number} = {}): {remainingSpells:number;healthBars:TouhouBossHealthBar[]} {
    if (!Number.isInteger(index) || index < 0 || index >= this.phases.length) throw new RangeError('Boss phase index is outside the plan');
    const phase = this.phases[index], group = this.groups[phase.groupIndex];
    maximumHp ??= (phase.phase as TouhouBossPhaseDescriptor).hp ?? (phase.phase as TouhouBossPhaseDescriptor).maximumHp ?? (phase.phase as TouhouBossPhaseDescriptor).maxHp ?? phase.weight;
    hp ??= maximumHp;
    if (!Number.isFinite(hp) || !Number.isFinite(maximumHp) || maximumHp <= 0) throw new RangeError('Boss phase health must be finite with a positive maximum');
    const fullSpell = this.spellRing === 'full' && phase.spell;
    let current = mul(phase.weight, Math.min(1, Math.max(0, div(f32(hp), f32(maximumHp)))));
    if (!fullSpell) for (let i = index + 1; i <= group.end; i++) current = add(current, this.phases[i].weight);
    // The current/upcoming spell is already represented by the current ring.
    // st01bs has three spells and writes 2, 1, 0 in its three health groups.
    let nextSpell = index;
    while (nextSpell < this.phases.length && !this.phases[nextSpell].spell) nextSpell++;
    let remainingSpells = 0;
    for (let i = nextSpell + 1; i < this.phases.length; i++) if (this.phases[i].spell) remainingSpells++;
    // Optional full-spell presentation changes only the denominator and fill
    // animation, never HP, damage, grouping or remaining-card counts.
    return { remainingSpells, healthBars: [{ current, maximum: fullSpell ? phase.weight : group.maximum,
      phaseHealth: Math.max(0, hp), markers: fullSpell ? [] : group.markers.slice(), groupIndex: group.index,
      ...(fullSpell ? { animateFill: false } : {}) }] };
  }
}
