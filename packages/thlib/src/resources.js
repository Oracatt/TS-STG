/** A backend-independent cache. Pass globalThis.tsstg in a native game. */
export class Resources {
  constructor(host) {
    if (!host) throw new TypeError('Resources requires a host adapter');
    this.host = host; this.cache = new Map();
  }
  load(kind, path) {
    if (!['texture', 'sound', 'music', 'font'].includes(kind)) throw new RangeError(`Unknown resource kind: ${kind}`);
    const key = `${kind}:${path}`;
    if (!this.cache.has(key)) {
      const method = `load${kind[0].toUpperCase()}${kind.slice(1)}`;
      if (typeof this.host[method] !== 'function') throw new Error(`Host does not support ${kind}`);
      this.cache.set(key, this.host[method](path));
    }
    return this.cache.get(key);
  }
  texture(path) { return this.load('texture', path); }
  sound(path) { return this.load('sound', path); }
  music(path) { return this.load('music', path); }
  font(path) { return this.load('font', path); }
  release(kind, path) {
    const key = `${kind}:${path}`;
    if (!this.cache.has(key)) return false;
    const method = `unload${kind[0].toUpperCase()}${kind.slice(1)}`;
    if (typeof this.host[method] !== 'function') throw new Error(`Host does not support releasing ${kind}`);
    this.host[method](this.cache.get(key)); this.cache.delete(key); return true;
  }
  dispose() {
    for (const key of [...this.cache.keys()]) {
      const split = key.indexOf(':'); this.release(key.slice(0, split), key.slice(split + 1));
    }
  }
  readJSON(path, fallback) {
    let text;
    try { text = this.host.readText(path); }
    catch (error) { if (fallback !== undefined) return fallback; throw error; }
    // A corrupt save must be visible to the caller instead of silently resetting data.
    return JSON.parse(text);
  }
  writeJSON(path, data) { this.host.writeText(path, JSON.stringify(data, null, 2)); }
}
