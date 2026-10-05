import { TaskRunner } from '../task.js';

function* invoke(callback, context, sequence, result) {
  const value = callback?.(context, sequence, result);
  if (value && typeof value.then === 'function') throw new TypeError('Phase callbacks use fixed-frame generators, not promises');
  if (value && typeof value.next === 'function') return yield value;
  return value;
}

/** A content-owned phase list. A phase may run a generator, or await finish().
 * Enter/leave generators can wait for dialogue, movement or effect lifetimes.
 * No health, spell settlement, cancellation, rewards or death effects are implicit.
 */
export class TouhouPhaseSequence {
  constructor(phases, { context = null, onComplete = null } = {}) {
    if (!Array.isArray(phases)) throw new TypeError('Phases must be an array');
    for (const phase of phases) {
      if (!phase || typeof phase !== 'object') throw new TypeError('Each phase must be an object');
      for (const key of ['enter', 'run', 'update', 'leave'])
        if (phase[key] !== undefined && typeof phase[key] !== 'function') throw new TypeError(`Phase ${key} must be a function`);
    }
    if (onComplete !== null && typeof onComplete !== 'function') throw new TypeError('onComplete must be a function or null');
    this.phases = phases.map(phase => ({ ...phase })); this.context = context; this.onComplete = onComplete;
    this.index = -1; this.state = 'ready'; this.frame = 0; this.phaseFrame = 0;
    this.alive = true; this.completed = false; this.result = undefined; this.finished = false;
    this.tasks = new TaskRunner(this); this.tasks.add(this.run());
  }
  get phase() { return this.phases[this.index] ?? null; }
  *run() {
    for (this.index = 0; this.index < this.phases.length && this.alive; this.index++) {
      const phase = this.phase;
      this.phaseFrame = 0; this.finished = false; this.result = undefined; this.state = 'enter';
      yield* invoke(phase.enter, this.context, this);
      if (!this.alive) return;
      this.state = 'running';
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
      if (!this.alive) return;
      this.state = 'leave';
      yield* invoke(phase.leave, this.context, this, this.result);
    }
    if (!this.alive) return;
    this.state = 'complete'; this.completed = true;
    this.onComplete?.(this.context, this); this.alive = false;
  }
  /** Finish at the next update, cancelling any unfinished run generator. */
  finish(result) {
    if (!this.alive || this.state !== 'running' || this.finished) return false;
    this.finished = true; this.result = result; return true;
  }
  update(context = this.context) {
    if (!this.alive) return this;
    this.context = context;
    this.tasks.update(context);
    if (this.alive && this.state === 'running') { this.phase.update?.(context, this); this.phaseFrame++; }
    this.frame++; return this;
  }
  destroy() {
    if (!this.alive) return;
    this.alive = false; this.state = 'cancelled'; this.phaseTasks?.clear(); this.tasks.clear();
  }
  snapshot() { return { index: this.index, state: this.state, frame: this.frame, phaseFrame: this.phaseFrame, completed: this.completed }; }
}
