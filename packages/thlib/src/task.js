/** Wait n fixed simulation frames. Both `yield* wait(n)` and `yield wait(n)` work. */
export function* wait(frames = 1) {
  if (!Number.isFinite(frames) || frames < 0) throw new RangeError('Wait duration must be finite and nonnegative');
  yield Math.max(1, Math.ceil(frames));
}

/** Cooperative generator scheduler. New tasks never run in the iteration that adds them. */
export class TaskRunner {
  constructor(owner = null) { this.owner = owner; this.frame = 0; this.tasks = []; this.pending = []; this.updating = false; }
  get size() { return this.tasks.length + this.pending.length; }
  add(task, owner = this.owner) {
    const iterator = typeof task === 'function' ? task(owner) : task;
    if (!iterator || typeof iterator.next !== 'function') throw new TypeError('Task must be a generator or iterator');
    const entry = { stack: [iterator], owner, wake: this.frame, cancelled: false, done: false, predicate: null };
    (this.updating ? this.pending : this.tasks).push(entry);
    return entry;
  }
  cancel(entry) {
    if (entry.cancelled || entry.done) return;
    entry.cancelled = true;
    if (entry.executing) return; // A generator cannot .return() itself while .next() is running.
    this.close(entry);
  }
  close(entry) {
    for (let i = entry.stack.length - 1; i >= 0; i--) entry.stack[i].return?.();
    entry.stack.length = 0;
  }
  clear() {
    // Detach before calling generator finally blocks, which may schedule new tasks.
    const tasks = this.tasks.concat(this.pending); this.tasks = []; this.pending = [];
    for (const task of tasks) this.cancel(task);
  }
  update(context) {
    if (this.tasks.length === 0 && this.pending.length === 0) { this.frame++; return; }
    this.updating = true;
    const survivors = [];
    try {
      for (const task of this.tasks) {
        if (task.cancelled || task.done) continue;
        if (task.owner && task.owner.alive === false) { this.cancel(task); continue; }
        if (task.wake > this.frame || (task.predicate && !task.predicate(context))) { survivors.push(task); continue; }
        task.predicate = null;
        let budget = 10000;
        while (task.stack.length && !task.cancelled) {
          if (--budget === 0) throw new Error('Task exceeded synchronous yield budget');
          let result;
          task.executing = true;
          try { result = task.stack[task.stack.length - 1].next(context); }
          finally { task.executing = false; }
          if (task.cancelled) { this.close(task); break; }
          if (result.done) { task.stack.pop(); continue; }
          const value = result.value;
          if (value && typeof value.next === 'function') { task.stack.push(value); continue; }
          if (typeof value === 'function') task.predicate = value;
          else if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
            throw new TypeError('Tasks yield a nonnegative frame count, iterator, predicate, or undefined');
          }
          task.wake = this.frame + Math.max(1, Math.ceil(typeof value === 'number' ? value : 1));
          break;
        }
        if (!task.cancelled && task.stack.length) survivors.push(task);
        else task.done = true;
      }
    } finally {
      this.updating = false;
      this.tasks = survivors.concat(this.pending).filter(task => !task.cancelled);
      this.pending = [];
      this.frame++;
    }
  }
}
