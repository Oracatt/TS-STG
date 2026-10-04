import { f32, f32Div } from './float32.js';

export const argbToRgba = color => (((color << 8) >>> 0) | (color >>> 24)) >>> 0;

/** A deformable column-major grid with independent position, vertex and strip
 * snapshots. Coordinates and UVs have explicit binary32 arithmetic boundaries.
 * Defaults describe a unit texture at the origin, not a game viewport.
 */
export class GridMesh {
  constructor(columns = 2, rows = 2, {
    offsetX = 0, offsetY = 0, textureWidth = 1, textureHeight = 1,
    uvMin = -Infinity, uvMax = Infinity, colorFormat = 'rgba',
  } = {}) {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2 || columns * rows > 65536)
      throw new RangeError('Mesh dimensions must be integer grid sizes >= 2, at most 65536 vertices');
    if (!(Number.isFinite(textureWidth) && Number.isFinite(textureHeight) && textureWidth > 0 && textureHeight > 0))
      throw new RangeError('Positive finite texture dimensions required');
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) throw new RangeError('Finite mesh offsets required');
    if (!(uvMin <= uvMax)) throw new RangeError('Ordered UV bounds required');
    if (colorFormat !== 'rgba' && colorFormat !== 'argb') throw new TypeError('Mesh color format must be rgba or argb');
    Object.assign(this, { columns, rows, offsetX, offsetY, textureWidth, textureHeight, uvMin, uvMax, colorFormat });
    this.vertices = Array.from({ length: columns * rows }, () => ({ x: 0, y: 0, z: 0, rhw: 1, color: 0xffffffff, u: 0, v: 0 }));
    this.positions = Array.from({ length: columns * rows }, () => ({ x: 0, y: 0, z: 0 }));
    this._strips = []; this.stripsDirty = false;
  }
  get strips() { if (this.stripsDirty) this.updateStrips(); return this._strips; }
  set strips(value) { this._strips = value; this.stripsDirty = false; }
  invalidateStrips() { this.stripsDirty = true; return this; }
  uv(position, vertex) {
    vertex.u = Math.min(this.uvMax, Math.max(this.uvMin, f32Div(position.x, f32(this.textureWidth))));
    vertex.v = Math.min(this.uvMax, Math.max(this.uvMin, f32Div(position.y, f32(this.textureHeight))));
  }
  initialize(x, y, width, height, copyStrips = true) {
    const firstY = f32(f32(this.offsetY) + f32(y)), sw = f32(this.textureWidth), sh = f32(this.textureHeight);
    let px = f32(f32(this.offsetX) + f32(x)), py = firstY, index = 0;
    const stepX = f32(f32(width) / f32(f32(this.columns) - 1)), stepY = f32(f32(height) / f32(f32(this.rows) - 1));
    const lo = this.uvMin, hi = this.uvMax;
    for (let col = 0; col < this.columns; col++) {
      for (let row = 0; row < this.rows; row++, index++) {
        const p = this.positions[index], v = this.vertices[index];
        p.x = v.x = px; p.y = v.y = py; p.z = v.z = 0;
        v.rhw = 1; v.color = 0xffffffff;
        v.u = Math.min(hi, Math.max(lo, f32(px / sw))); v.v = Math.min(hi, Math.max(lo, f32(py / sh))); py = f32(py + stepY);
      }
      py = firstY; px = f32(px + stepX);
    }
    if (copyStrips) this.updateStrips(); else this.invalidateStrips(); return this;
  }
  updateStrips() {
    this.stripsDirty = false; const strips = this._strips; strips.length = this.columns - 1;
    for (let col = 0; col < this.columns - 1; col++) {
      const strip = strips[col] ?? (strips[col] = []); strip.length = this.rows * 2;
      for (let row = 0; row < this.rows; row++) {
        for (let side = 0; side < 2; side++) {
          const source = this.vertices[(col + side) * this.rows + row], index = row * 2 + side;
          const target = strip[index] ?? (strip[index] = {});
          target.x = source.x; target.y = source.y; target.z = source.z; target.rhw = source.rhw;
          target.color = source.color; target.u = source.u; target.v = source.v;
        }
      }
    }
    return this;
  }
  geometry({ scale = 1, offsetX = 0, offsetY = 0, strips = true } = {}) {
    const convert = this.colorFormat === 'argb';
    if (!strips) {
      const key = `${this.columns},${this.rows}`;
      if (this.gridIndexKey !== key) {
        this.gridIndexKey = key; const indices = [];
        for (let col = 0; col < this.columns - 1; col++) for (let row = 0; row < this.rows - 1; row++) {
          const a = col * this.rows + row, b = a + this.rows; indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
        this.gridIndices = indices;
      }
      const vertices = new Array(this.vertices.length);
      for (let i = 0; i < vertices.length; i++) {
        const v = this.vertices[i], color = v.color;
        vertices[i] = [offsetX + v.x * scale, offsetY + v.y * scale, v.u, v.v, convert ? ((color << 8) | (color >>> 24)) >>> 0 : color >>> 0];
      }
      return { vertices, indices: this.gridIndices.slice() };
    }
    const vertices = [], indices = [];
    for (const strip of this.strips) {
      const start = vertices.length;
      for (const v of strip) vertices.push([offsetX + v.x * scale, offsetY + v.y * scale, v.u, v.v, convert ? argbToRgba(v.color) : v.color >>> 0]);
      for (let i = 0; i < strip.length - 2; i++) indices.push(start + i, start + i + 1 + (i & 1), start + i + 2 - (i & 1));
    }
    return { vertices, indices };
  }
  draw(draw, textureId, options) { const geometry = this.geometry(options); draw.mesh(textureId, geometry.vertices, geometry.indices); return draw; }
}
