import type { ResourceHost } from './api-types.js';
/** A backend-independent cache. Pass globalThis.tsstg in a native game. */
type ResourceKind = 'texture' | 'sound' | 'music' | 'font';
export class Resources {
  declare host: ResourceHost;
  declare cache: Map<string, number>;



  constructor(host: ResourceHost) {
    if (!host) throw new TypeError('Resources requires a host adapter');
    this.host = host; this.cache = new Map();
  }
  load(kind: 'texture' | 'sound' | 'music' | 'font', path: string): number {
    if (!['texture', 'sound', 'music', 'font'].includes(kind)) throw new RangeError(`Unknown resource kind: ${kind}`);
    const key = `${kind}:${path}`;
    if (!this.cache.has(key)) {
      const method = `load${kind[0].toUpperCase()}${kind.slice(1)}` as 'loadTexture' | 'loadSound' | 'loadMusic' | 'loadFont';
      if (typeof this.host[method] !== 'function') throw new Error(`Host does not support ${kind}`);
      this.cache.set(key, this.host[method]!(path));
    }
    return this.cache.get(key)!;
  }
  texture(path: string): number { return this.load('texture', path); }
  sound(path: string): number { return this.load('sound', path); }
  music(path: string): number { return this.load('music', path); }
  font(path: string): number { return this.load('font', path); }
  release(kind: 'texture' | 'sound' | 'music' | 'font', path: string): boolean {
    const key = `${kind}:${path}`;
    if (!this.cache.has(key)) return false;
    const method = `unload${kind[0].toUpperCase()}${kind.slice(1)}` as 'unloadTexture' | 'unloadSound' | 'unloadMusic' | 'unloadFont';
    if (typeof this.host[method] !== 'function') throw new Error(`Host does not support releasing ${kind}`);
    this.host[method]!(this.cache.get(key)!); this.cache.delete(key); return true;
  }
  dispose(): void {
    for (const key of [...this.cache.keys()]) {
      const split = key.indexOf(':'); this.release(key.slice(0, split) as ResourceKind, key.slice(split + 1));
    }
  }
  readJSON<T = unknown>(path: string, fallback?: T): T {
    let text;
    try { text = this.host.readText(path); }
    catch (error) { if (fallback !== undefined) return fallback; throw error; }
    // A corrupt save must be visible to the caller instead of silently resetting data.
    return JSON.parse(text);
  }
  writeJSON(path: string, data: unknown): void { this.host.writeText(path, JSON.stringify(data, null, 2)); }
}
