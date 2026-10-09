export type TouhouPhaseScript = Generator<number | undefined | (() => boolean) | TouhouPhaseScript, unknown, unknown>;

export interface TouhouPhase<T = unknown> {
  name?: string;
  enter?:(context:T, sequence:TouhouPhaseSequence<T>)=>void|TouhouPhaseScript;
  run?:(context:T, sequence:TouhouPhaseSequence<T>)=>void|TouhouPhaseScript;
  update?:(context:T, sequence:TouhouPhaseSequence<T>)=>void;
  leave?:(context:T, sequence:TouhouPhaseSequence<T>, result:unknown)=>void|TouhouPhaseScript;
}

import { TaskRunner } from '../task.js';

function* invoke<T>(callback: TouhouPhase<T>['leave'], context:T, sequence:TouhouPhaseSequence<T>, result?:unknown):TouhouPhaseScript {
  const value = callback?.(context, sequence, result);
  if (value && typeof (value as {then?:unknown}).then === 'function') throw new TypeError('Phase callbacks use fixed-frame generators, not promises');
  if (value && typeof value.next === 'function') return yield value;
  return value;
}

/** A content-owned phase list. A phase may run a generator, or await finish().
 * Enter/leave generators can wait for dialogue, movement or effect lifetimes.
 * No health, spell settlement, cancellation, rewards or death effects are implicit.
 */
export class TouhouPhaseSequence<T = unknown> {
  declare onComplete: (((context: T, sequence: TouhouPhaseSequence<T>) => void) | null);
  declare finished: boolean;
  declare tasks: TaskRunner;
  declare phaseTasks: TaskRunner | null;

  declare phases:TouhouPhase<T>[];
  declare readonly index: number;
  declare readonly frame: number;
  declare readonly phaseFrame: number;
  declare readonly alive: boolean;
  declare readonly completed: boolean;
  declare readonly state: 'ready'|'enter'|'running'|'leave'|'complete'|'cancelled';
  declare context: T;
  declare result: unknown;

  constructor(phases: readonly TouhouPhase<T>[], { context = null as T, onComplete = null }: {context?:T;onComplete?:((context:T,sequence:TouhouPhaseSequence<T>)=>void)|null} = {}) {
    if (!Array.isArray(phases)) throw new TypeError('Phases must be an array');
    for (const phase of phases) {
      if (!phase || typeof phase !== 'object') throw new TypeError('Each phase must be an object');
      for (const key of ['enter', 'run', 'update', 'leave'] as const)
        if (phase[key] !== undefined && typeof phase[key] !== 'function') throw new TypeError(`Phase ${key} must be a function`);
    }
    if (onComplete !== null && typeof onComplete !== 'function') throw new TypeError('onComplete must be a function or null');
    this.phases = phases.map(phase => ({ ...phase })); this.context = context; this.onComplete = onComplete;
    this.index = -1; this.state = 'ready'; this.frame = 0; this.phaseFrame = 0;
    this.alive = true; this.completed = false; this.result = undefined; this.finished = false;
    this.tasks = new TaskRunner(this); this.tasks.add(this.run());
  }
  get phase(): TouhouPhase<T>|null { return this.phases[this.index] ?? null; }
  *run():TouhouPhaseScript {
    for ((this as {index:number}).index = 0; this.index < this.phases.length && this.alive; (this as {index:number}).index++) {
      const phase = this.phase!;
      (this as {phaseFrame:number}).phaseFrame = 0; this.finished = false; this.result = undefined; (this as {state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled'}).state = 'enter';
      yield* invoke(phase.enter, this.context, this);
      if (!(this as {alive:boolean}).alive) return;
      (this as {state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled'}).state = 'running';
      if (phase.run) {
        const runner = new TaskRunner(this); this.phaseTasks = runner;
        runner.add(invoke(phase.run, this.context, this));
        try {
          while (this.alive && !this.finished && runner.size) {
            runner.update(this.context);
            if (runner.size && !this.finished) yield 1;
          }
        } finally { runner.clear(); this.phaseTasks = null; }
      }
      else while (!this.finished && this.alive) yield 1;
      if (!(this as {alive:boolean}).alive) return;
      (this as {state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled'}).state = 'leave';
      yield* invoke(phase.leave, this.context, this, this.result);
    }
    if (!(this as {alive:boolean}).alive) return;
    (this as {state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled'}).state = 'complete'; (this as {completed:boolean}).completed = true;
    this.onComplete?.(this.context, this); (this as {alive:boolean}).alive = false;
  }
  /** Finish at the next update, cancelling any unfinished run generator. */
  finish(result?: unknown): boolean {
    if (!(this as {alive:boolean}).alive || this.state !== 'running' || this.finished) return false;
    this.finished = true; this.result = result; return true;
  }
  update(context: T = this.context): this {
    if (!(this as {alive:boolean}).alive) return this;
    this.context = context;
    this.tasks.update(context);
    if (this.alive && this.state === 'running') { this.phase!.update?.(context, this); (this as {phaseFrame:number}).phaseFrame++; }
    (this as {frame:number}).frame++; return this;
  }
  destroy(): void {
    if (!(this as {alive:boolean}).alive) return;
    (this as {alive:boolean}).alive = false; (this as {state:'ready'|'enter'|'running'|'leave'|'complete'|'cancelled'}).state = 'cancelled'; this.phaseTasks?.clear(); this.tasks.clear();
  }
  snapshot(): {index:number;state:string;frame:number;phaseFrame:number;completed:boolean} { return { index: this.index, state: this.state, frame: this.frame, phaseFrame: this.phaseFrame, completed: this.completed }; }
}
