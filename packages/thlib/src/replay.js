/** Stable integer hash for deterministic replay checkpoints. */
export function stateHash(value) {
  const canonical = item => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    return `{${Object.keys(item).sort().filter(key => item[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
  };
  const text = canonical(value); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class ReplayRecorder {
  constructor(config = {}) {
    this.config = JSON.parse(JSON.stringify(config));
    this.runs = []; this.frames = 0; this.checkpoints = [];
  }
  record(mask) {
    mask = mask >>> 0;
    const last = this.runs[this.runs.length - 1];
    if (last && last[0] === mask) last[1]++;
    else this.runs.push([mask, 1]);
    this.frames++;
  }
  checkpoint(snapshot) { this.checkpoints.push({ frame: this.frames, hash: stateHash(snapshot) }); }
  toJSON() { return { format: 'ts-stg-replay', version: 1, config: this.config, frames: this.frames,
    runs: this.runs.map(run => run.slice()), checkpoints: this.checkpoints.map(point => ({ ...point })) }; }
  serialize() { return JSON.stringify(this.toJSON()); }
}

export class ReplayPlayer {
  constructor(source) {
    const data = typeof source === 'string' ? JSON.parse(source) : source;
    if (!data || data.format !== 'ts-stg-replay' || data.version !== 1 || !Array.isArray(data.runs))
      throw new Error('Unsupported TS-STG replay');
    let total = 0;
    for (const run of data.runs) {
      if (!Array.isArray(run) || run.length !== 2 || !Number.isInteger(run[0]) || run[0] < 0 || run[0] > 1023 ||
        !Number.isInteger(run[1]) || run[1] <= 0) throw new Error('Invalid replay input run');
      total += run[1];
      if (!Number.isSafeInteger(total) || total > 100000000) throw new Error('Replay exceeds frame limit');
    }
    if (total !== data.frames) throw new Error('Replay frame count mismatch');
    this.data = data; this.config = data.config ?? {}; this.frame = 0;
    this.runIndex = 0; this.runFrame = 0; this.desync = null;
    this.checkpoints = new Map((data.checkpoints ?? []).map(point => [point.frame, point.hash]));
  }
  get finished() { return this.frame >= this.data.frames; }
  next() {
    if (this.finished) return null;
    const run = this.data.runs[this.runIndex], mask = run[0];
    this.frame++; this.runFrame++;
    if (this.runFrame >= run[1]) { this.runIndex++; this.runFrame = 0; }
    return mask;
  }
  verify(snapshot) {
    const expected = this.checkpoints.get(this.frame);
    if (!expected) return true;
    const actual = stateHash(snapshot);
    if (expected !== actual) {
      this.desync = { frame: this.frame, expected, actual };
      throw new Error(`Replay desync at frame ${this.frame}: expected ${expected}, got ${actual}`);
    }
    return true;
  }
}

/** Sync storage adapter: native host, localStorage-shaped adapter, or in-memory fallback. */
export class SaveStore {
  constructor(adapter = null, prefix = 'tsstg') { this.adapter = adapter; this.prefix = prefix; this.memory = new Map(); }
  get(key, fallback = null) {
    try {
      const name = `${this.prefix}-${key}.json`;
      const raw = this.adapter?.readText ? this.adapter.readText(name) :
        this.adapter?.getItem ? this.adapter.getItem(name) : this.memory.get(name);
      return raw == null || raw === '' ? fallback : JSON.parse(raw);
    } catch (error) { return fallback; }
  }
  set(key, value) {
    const name = `${this.prefix}-${key}.json`, text = JSON.stringify(value);
    if (this.adapter?.writeText) this.adapter.writeText(name, text);
    else if (this.adapter?.setItem) this.adapter.setItem(name, text);
    else this.memory.set(name, text);
    return value;
  }
}
