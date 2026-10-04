import { f32, f32Add, f32Sub, f32Mul } from './float32.js';
import { GridMesh } from './grid-mesh.js';

const identity = value => value;

/** Configurable radial mesh deformation. Radius growth, radial displacement,
 * waves, phase wrapping, tint and clipping are supplied by the application.
 * An update uses the current radius, then advances it for the following frame.
 */
export class RadialDistortion {
  constructor({
    mesh = new GridMesh(), radius = 1, currentRadius = radius, color = 0xffffffff,
    phaseX = 0, phaseY = 0, margin = 0, growth = 0, displacement = 0, waveAmplitude = 0,
    vertexPhaseStepX = 0, vertexPhaseStepY = 0, phaseVelocityX = 0, phaseVelocityY = 0,
    normalizationEpsilon = 0, wrapPhase = identity, colorAt = null, forceOpaque = false,
    positionBounds = null,
  } = {}) {
    if (!(radius > 0)) throw new RangeError('Distortion radius must be positive');
    Object.assign(this, { mesh, margin, growth, displacement, waveAmplitude, vertexPhaseStepX,
      vertexPhaseStepY, phaseVelocityX, phaseVelocityY, normalizationEpsilon, wrapPhase, colorAt,
      forceOpaque, positionBounds });
    this.radius = f32(radius); this.currentRadius = f32(currentRadius); this.color = color >>> 0;
    this.phaseX = f32(phaseX); this.phaseY = f32(phaseY);
  }
  update(center, clockScale = 1) {
    const mesh = this.mesh, radius = f32(this.currentRadius), clock = f32(clockScale), margin = f32(this.margin);
    let phaseX = f32(this.phaseX), phaseY = f32(this.phaseY);
    if (this.currentRadius < this.radius) this.currentRadius = f32Add(this.currentRadius, f32Mul(clock, this.growth));
    const cx = f32(center.x), cy = f32(center.y), cz = f32(center.z ?? 0);
    mesh.initialize(f32Sub(f32Sub(cx, radius), margin), f32Sub(f32Sub(cy, radius), margin),
      f32Add(f32Mul(radius, 2), f32Mul(margin, 2)), f32Add(f32Mul(radius, 2), f32Mul(margin, 2)), false);
    const screenX = f32Add(f32(mesh.offsetX), cx), screenY = f32Add(f32(mesh.offsetY), cy);
    const squaredRadius = f32(radius * radius), stepX = f32(this.vertexPhaseStepX), stepY = f32(this.vertexPhaseStepY);
    const epsilon = f32(this.normalizationEpsilon), push = f32(this.displacement), wave = f32(this.waveAmplitude);
    const sw = f32(mesh.textureWidth), sh = f32(mesh.textureHeight), lo = mesh.uvMin, hi = mesh.uvMax;
    const alphaMask = mesh.colorFormat === 'argb' ? 0xff000000 : 0xff;
    const opaque = this.forceOpaque ? alphaMask : 0, colorAt = this.colorAt, wrapPhase = this.wrapPhase, bounds = this.positionBounds;
    for (let index = 0; index < mesh.vertices.length; index++) {
      const v = mesh.vertices[index], p = mesh.positions[index];
      let dx = f32(p.x - screenX), dy = f32(p.y - screenY), dz = f32(p.z - cz);
      const squaredXY = f32(f32(dx * dx) + f32(dy * dy));
      let weight = f32(squaredRadius - squaredXY);
      if (weight < 0) v.color = (v.color & ~alphaMask) >>> 0;
      else {
        weight = f32(weight / squaredRadius);
        v.color = ((colorAt ? colorAt(weight, this.color) : this.color) | opaque) >>> 0;
        const length = f32(Math.sqrt(f32(squaredXY + f32(dz * dz)))), magnitude = f32(weight * push);
        if (Math.abs(length) >= epsilon && length !== 0) { dx = f32(f32(dx / length) * magnitude); dy = f32(f32(dy / length) * magnitude); }
        else { dx = f32(dx * magnitude); dy = f32(dy * magnitude); }
        dx = f32(f32(f32(f32(Math.sin(phaseX)) * weight) * wave) + dx);
        dy = f32(f32(f32(f32(Math.sin(phaseY)) * weight) * wave) + dy);
        v.x = f32(v.x + dx); v.y = f32(v.y + dy); v.z = p.z = 0;
      }
      phaseX = wrapPhase(f32(phaseX + stepX)); phaseY = wrapPhase(f32(phaseY + stepY));
      if (bounds) {
        if (p.x > bounds.minX) { if (bounds.maxX <= p.x) v.x = p.x = f32(f32(bounds.maxX) - f32(bounds.insetX ?? 0)); }
        else v.x = p.x = f32(f32(bounds.minX) + f32(bounds.insetX ?? 0));
        if (p.y > bounds.minY) { if (bounds.maxY <= p.y) v.y = p.y = f32(f32(bounds.maxY) - f32(bounds.insetY ?? 0)); }
        else v.y = p.y = f32(f32(bounds.minY) + f32(bounds.insetY ?? 0));
      }
      v.u = Math.min(hi, Math.max(lo, f32(p.x / sw))); v.v = Math.min(hi, Math.max(lo, f32(p.y / sh)));
    }
    this.phaseX = wrapPhase(f32Add(this.phaseX, f32Mul(this.phaseVelocityX, clock)));
    this.phaseY = wrapPhase(f32Add(this.phaseY, f32Mul(this.phaseVelocityY, clock)));
    mesh.updateStrips(); return this;
  }
  draw(draw, textureId, options) { return this.mesh.draw(draw, textureId, options); }
}
