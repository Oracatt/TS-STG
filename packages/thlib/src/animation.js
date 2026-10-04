const finite = (value, name) => { if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`); return value; };
export const Easing = Object.freeze({
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outSine: t => Math.sin(t * Math.PI / 2)
});

/** Frame-based interpolation, compatible with Entity.tasks.add(tween(...)). */
export function* tween(target, values, frames, easing = Easing.linear) {
  if (!Number.isInteger(frames) || frames < 0) throw new RangeError('Tween frames must be a nonnegative integer');
  const keys = Object.keys(values), start = {};
  for (const key of keys) { start[key] = finite(target[key], key); finite(values[key], key); }
  if (frames === 0) { Object.assign(target, values); return; }
  for (let frame = 1; frame <= frames; frame++) {
    const t = finite(easing(frame / frames), 'Easing result');
    for (const key of keys) target[key] = start[key] + (values[key] - start[key]) * t;
    yield 1;
  }
  Object.assign(target, values);
}

/** Animation owns time; Texture handles and frame rectangles are supplied by the game. */
export class SpriteAnimation {
  constructor({ texture, frames, frameDuration = 6, loop = true, onComplete } = {}) {
    if (!Array.isArray(frames) || !frames.length) throw new TypeError('Animation needs at least one frame');
    this.texture = texture;
    this.frames = frames.map(frame => {
      const out = { ...frame, duration: frame.duration ?? frameDuration };
      for (const key of ['x', 'y', 'width', 'height', 'duration']) finite(out[key], key);
      if (out.width <= 0 || out.height <= 0 || !Number.isInteger(out.duration) || out.duration < 1)
        throw new RangeError('Animation rectangles and duration must be positive');
      return out;
    });
    this.loop = loop; this.onComplete = onComplete; this.reset();
  }
  static grid(texture, { width, height, columns, count, start = 0, ...options }) {
    if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(count) || count < 1)
      throw new RangeError('Grid columns and count must be positive integers');
    const frames = Array.from({ length: count }, (_, i) => ({
      x: ((start + i) % columns) * width, y: Math.floor((start + i) / columns) * height, width, height
    }));
    return new SpriteAnimation({ texture, frames, ...options });
  }
  reset() { this.index = 0; this.elapsed = 0; this.finished = false; return this; }
  update(frames = 1) {
    if (!Number.isInteger(frames) || frames < 0) throw new RangeError('Advance by integer frames');
    while (frames > 0 && !this.finished) {
      const remaining = this.frames[this.index].duration - this.elapsed;
      if (frames < remaining) { this.elapsed += frames; break; }
      frames -= remaining; this.elapsed = 0;
      if (this.index + 1 < this.frames.length) this.index++;
      else if (this.loop) this.index = 0;
      else { this.finished = true; this.onComplete?.(this); }
    }
    return this;
  }
  draw(draw, x, y, { scaleX = 1, scaleY = 1, rotation = 0, color = 0xffffffff } = {}) {
    const f = this.frames[this.index];
    draw.spriteRegion(this.texture, f.x, f.y, f.width, f.height, x, y, f.width * scaleX, f.height * scaleY, rotation, color);
  }
  snapshot() { return { index: this.index, elapsed: this.elapsed, finished: this.finished }; }
}

/** Camera projection for script-defined pseudo-3D stage scenery. Angles are radians. */
export class Camera3D {
  constructor({ x = 0, y = 0, z = -400, focalLength = 400, centerX = 320, centerY = 200, near = 1 } = {}) {
    Object.assign(this, { x, y, z, focalLength, centerX, centerY, near });
  }
  project(x, y, z) {
    const depth = z - this.z;
    if (depth < this.near) return null;
    const scale = this.focalLength / depth;
    return { x: this.centerX + (x - this.x) * scale, y: this.centerY + (y - this.y) * scale, scale, depth };
  }
}
