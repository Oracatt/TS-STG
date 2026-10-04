const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
};
const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
};
const positiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
  return value;
};
const bool = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
};
const filePath = file => {
  if (typeof file !== 'string' || !file || /[:%?#\x00-\x1f]/.test(file))
    throw new TypeError('Texture file must be a plain relative path');
  const normalized = file.replace(/\\/g, '/'), segments = normalized.split('/');
  if (segments.some(part => !part || part === '.' || part === '..' || part.trim() !== part || /^[. ]+$/.test(part)))
    throw new TypeError('Texture file must stay inside the supplied basePath');
  return normalized;
};

function normalizeManifest(input) {
  record(input, 'Sprite pack');
  if (input.format !== 'ts-stg-sprite-pack-v1') throw new TypeError('Unsupported sprite pack format');
  const textures = Object.create(null), sprites = Object.create(null), clips = Object.create(null);
  for (const [name, source] of Object.entries(record(input.textures, 'textures'))) {
    if (!name) throw new TypeError('Texture names must not be empty');
    record(source, `Texture ${name}`);
    textures[name] = Object.freeze({ ...source, file: filePath(source.file),
      width: positiveInteger(source.width, `Texture ${name} width`),
      height: positiveInteger(source.height, `Texture ${name} height`) });
  }
  for (const [name, source] of Object.entries(record(input.sprites, 'sprites'))) {
    if (!name) throw new TypeError('Sprite names must not be empty');
    record(source, `Sprite ${name}`);
    if (typeof source.texture !== 'string' || !own(textures, source.texture)) throw new RangeError(`Unknown texture for sprite ${name}`);
    const texture = textures[source.texture], rectangle = {};
    for (const key of ['x', 'y', 'width', 'height']) rectangle[key] = finite(source[key], `Sprite ${name} ${key}`);
    if (rectangle.x < 0 || rectangle.y < 0 || rectangle.width <= 0 || rectangle.height <= 0 ||
      rectangle.x + rectangle.width > texture.width || rectangle.y + rectangle.height > texture.height)
      throw new RangeError(`Sprite ${name} lies outside its texture canvas`);
    sprites[name] = Object.freeze({ ...source, ...rectangle });
  }
  for (const [name, source] of Object.entries(record(input.clips ?? {}, 'clips'))) {
    if (!name) throw new TypeError('Clip names must not be empty');
    record(source, `Clip ${name}`);
    if (!Array.isArray(source.frames) || !source.frames.length) throw new TypeError(`Clip ${name} needs at least one sprite frame`);
    const frames = source.frames.map(frame => {
      if (typeof frame !== 'string' || !own(sprites, frame)) throw new RangeError(`Unknown sprite frame in clip ${name}`);
      return frame;
    });
    clips[name] = Object.freeze({ ...source, frames: Object.freeze(frames),
      frameDuration: positiveInteger(source.frameDuration ?? 6, `Clip ${name} frameDuration`),
      loop: bool(source.loop ?? true, `Clip ${name} loop`) });
  }
  return Object.freeze({ ...input, textures: Object.freeze(textures), sprites: Object.freeze(sprites), clips: Object.freeze(clips) });
}

/** Data-driven named sprite resources. Supply parsed JSON and a synchronous
 * loadTexture/unloadTexture adapter; no filesystem or native globals are used.
 * All handles are owned by this atlas and remain loaded until release/dispose.
 */
export class SpriteAtlas {
  constructor(manifest, host, { basePath = '' } = {}) {
    if (!host || typeof host.loadTexture !== 'function' || typeof host.unloadTexture !== 'function')
      throw new TypeError('SpriteAtlas requires loadTexture and unloadTexture adapter methods');
    if (typeof basePath !== 'string' || /[\x00-\x1f]/.test(basePath)) throw new TypeError('basePath must be a plain path string');
    this.manifest = normalizeManifest(manifest);
    const normalizedBase = basePath.replace(/\\/g, '/');
    this.host = host; this.basePath = normalizedBase.replace(/\/+$/, '') || (normalizedBase.startsWith('/') ? '/' : '');
    this.handles = new Map(); this.disposed = false;
  }
  assertLive() { if (this.disposed) throw new Error('SpriteAtlas has been disposed'); }
  getSprite(name) {
    if (typeof name !== 'string' || !own(this.manifest.sprites, name)) throw new RangeError(`Unknown sprite: ${name}`);
    return this.manifest.sprites[name];
  }
  getClip(name) {
    if (typeof name !== 'string' || !own(this.manifest.clips, name)) throw new RangeError(`Unknown clip: ${name}`);
    return this.manifest.clips[name];
  }
  texture(name) {
    this.assertLive();
    if (typeof name !== 'string' || !own(this.manifest.textures, name)) throw new RangeError(`Unknown texture: ${name}`);
    if (!this.handles.has(name)) {
      const texture = this.manifest.textures[name], path = this.basePath ? `${this.basePath}${this.basePath.endsWith('/') ? '' : '/'}${texture.file}` : texture.file;
      const handle = this.host.loadTexture(path, texture.width, texture.height);
      if (!Number.isSafeInteger(handle) || handle < 0) throw new TypeError(`Texture adapter returned an invalid handle for ${name}`);
      this.handles.set(name, handle);
    }
    return this.handles.get(name);
  }
  /** Preload all textures. If loading fails, dispose() still releases successes. */
  loadAll() { this.assertLive(); for (const name of Object.keys(this.manifest.textures)) this.texture(name); return this; }
  releaseTexture(name) {
    if (!this.handles.has(name)) return false;
    this.host.unloadTexture(this.handles.get(name)); this.handles.delete(name); return true;
  }
  /** Release each owned handle once. Failed releases remain retryable. */
  dispose() {
    if (this.disposed) return;
    let failure, failed = false;
    for (const name of this.handles.keys()) {
      try { this.releaseTexture(name); } catch (error) { if (!failed) { failure = error; failed = true; } }
    }
    this.disposed = this.handles.size === 0;
    if (failed) throw failure;
  }
  /** Position is the destination center; rotation is radians, color is RGBA.
   * Destination dimensions = (override or source size) * scale * scaleX/Y.
   */
  drawNamed(name, draw, x, y, { width, height, scale = 1, scaleX = 1, scaleY = 1, rotation = 0, color = 0xffffffff } = {}) {
    this.assertLive(); const sprite = this.getSprite(name);
    finite(x, 'Sprite x'); finite(y, 'Sprite y'); finite(rotation, 'Sprite rotation'); finite(color, 'Sprite color');
    const dimensions = [width ?? sprite.width, height ?? sprite.height, scale, scaleX, scaleY];
    if (dimensions.some(value => !Number.isFinite(value) || value < 0)) throw new RangeError('Sprite dimensions and scales must be finite and nonnegative');
    const w = dimensions[0] * scale * scaleX, h = dimensions[1] * scale * scaleY;
    finite(w, 'Sprite destination width'); finite(h, 'Sprite destination height');
    draw.spriteRegion(this.texture(sprite.texture), sprite.x, sprite.y, sprite.width, sprite.height, x, y, w, h, rotation, color >>> 0);
    return draw;
  }
  clip(name, options) { this.assertLive(); return new SpriteClip(this, name, options); }
}

/** Integer-frame animation over named sprites, including frames on different
 * textures. Every frame uses one uniform frameDuration; the last frame holds
 * when a nonlooping clip finishes. Time advancement never loads resources.
 */
export class SpriteClip {
  constructor(atlas, name, { frameDuration, loop, onComplete } = {}) {
    if (!(atlas instanceof SpriteAtlas)) throw new TypeError('SpriteClip requires a SpriteAtlas');
    atlas.assertLive(); const source = atlas.getClip(name);
    this.atlas = atlas; this.name = name; this.frames = source.frames;
    this.frameDuration = positiveInteger(frameDuration ?? source.frameDuration, 'Clip frameDuration');
    this.loop = bool(loop ?? source.loop, 'Clip loop');
    if (onComplete !== undefined && typeof onComplete !== 'function') throw new TypeError('Clip onComplete must be a function');
    this.onComplete = onComplete; this.reset();
  }
  get spriteName() { return this.frames[this.index]; }
  reset() { this.index = 0; this.elapsed = 0; this.finished = false; return this; }
  update(frames = 1) {
    if (!Number.isSafeInteger(frames) || frames < 0) throw new RangeError('Advance clips by nonnegative safe integer frames');
    if (this.finished || frames === 0) return this;
    const total = this.elapsed + frames;
    if (!Number.isSafeInteger(total)) throw new RangeError('Clip time advance exceeds safe integer precision');
    const advance = Math.floor(total / this.frameDuration);
    if (!this.loop && advance >= this.frames.length - this.index) {
      this.index = this.frames.length - 1; this.elapsed = 0; this.finished = true; this.onComplete?.(this);
    } else {
      this.index = (this.index + advance % this.frames.length) % this.frames.length;
      this.elapsed = total % this.frameDuration;
    }
    return this;
  }
  draw(draw, x, y, options) { return this.atlas.drawNamed(this.spriteName, draw, x, y, options); }
  snapshot() { return { name: this.name, index: this.index, elapsed: this.elapsed, finished: this.finished }; }
}
