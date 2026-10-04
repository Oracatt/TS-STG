// Source reconstruction: sprite_renderer/render_mesh.cpp (49d850/49ddc0/49df40),
// stage_background/mesh_distortion.cpp (4722e0), gameplay/enemy_mesh.cpp (4a4190).
// These are mesh/state ports, not a claim of pixel-identical GPU output.
import { f32, PI, add, sub, mul, div, sin, sqrt, wrapAngle, trunc32, TouhouTimer } from './math.js';

import { GridMesh } from '../grid-mesh.js';
import { RadialDistortion } from '../radial-distortion.js';
export { argbToRgba } from '../grid-mesh.js';

/** Original viewport and vertex-color configuration for the shared grid. */
export class TouhouRenderMesh extends GridMesh {
  constructor(columns = 17, rows = 17, { viewOffsetX = 224, viewOffsetY = 16, screenWidth = 640, screenHeight = 480 } = {}) {
    super(columns, rows, { offsetX: viewOffsetX | 0, offsetY: viewOffsetY | 0,
      textureWidth: screenWidth | 0, textureHeight: screenHeight | 0, uvMin: 0, colorFormat: 'argb' });
  }
  get viewOffsetX() { return this.offsetX; }
  set viewOffsetX(value) { this.offsetX = value; }
  get viewOffsetY() { return this.offsetY; }
  set viewOffsetY(value) { this.offsetY = value; }
  get screenWidth() { return this.textureWidth; }
  set screenWidth(value) { this.textureWidth = value; }
  get screenHeight() { return this.textureHeight; }
  set screenHeight(value) { this.textureHeight = value; }
}
/** Per-view STD distortion. The original copies strip buffers before deformation. */
export class TouhouStageDistortion {
  constructor({ mode = 1, phaseX = 0, phaseY = 0, columns = 17, rows = mode === 1 ? 7 : 17, ...options } = {}) {
    this.mode = mode; this.phaseX = f32(phaseX); this.phaseY = f32(phaseY);
    this.timer = new TouhouTimer(); this.mesh = new TouhouRenderMesh(columns, rows, options);
  }
  update(rate = 1) {
    if (this.mode !== 1 && this.mode !== 2) return this;
    const mesh = this.mesh;
    mesh.initialize(-192, 0, 384, this.mode === 1 ? 128 : 448);
    let phaseX = this.phaseX, phaseY = this.phaseY, index = 0;
    for (let col = 0; col < mesh.columns; col++) {
      for (let row = 0; row < mesh.rows; row++, index++) {
        const v = mesh.vertices[index], p = mesh.positions[index];
        v.color = ((v.color & 0xffffff) | 0xc0000000) >>> 0;
        const amplitude = sub(24, div(mul(f32(row), 24), f32(mesh.rows - 1)));
        const x = mul(sin(phaseX), amplitude), y = mul(sin(phaseY), amplitude);
        if (col && row && col !== mesh.columns - 1 && row !== mesh.rows - 1) {
          v.x = add(v.x, x); v.y = add(v.y, y); v.z = p.z = 0;
        }
        phaseX = wrapAngle(add(phaseX, div(PI, f32(4.7))));
      }
      phaseY = wrapAngle(sub(phaseY, div(PI, f32(2.1))));
    }
    this.phaseX = wrapAngle(add(this.phaseX, div(PI, 64)));
    this.phaseY = wrapAngle(add(this.phaseY, div(PI, 80)));
    if (this.mode === 2) this.timer.tick(rate === null ? 1 : f32(rate));
    return this;
  }
  draw(draw, textureId, options) { return this.mesh.draw(draw, textureId, options); }
}

/** Original ARGB tint interpolation. The white fast path needs no callback. */
function enemyDistortionColor(weight, color) {
  for (const shift of [16, 8, 0]) {
    const old = (color >>> shift) & 255;
    const value = trunc32(sub(255, mul(f32(255 - old), weight))) & 255;
    color = ((color & ~(255 << shift)) | (value << shift)) >>> 0;
  }
  return color;
}

/** Original ECL enemy/Boss configuration over the reusable radial deformation. */
export class TouhouEnemyDistortion extends RadialDistortion {
  constructor({ radius = 112, currentRadius = 16, color = 0xffffffff, phaseX = 0, phaseY = 0, columns = 17, rows = 17, ...options } = {}) {
    const mesh = new TouhouRenderMesh(columns, rows, options);
    super({ mesh, radius, currentRadius, color, phaseX, phaseY,
      margin: 20, growth: 2, displacement: 32, waveAmplitude: 8,
      vertexPhaseStepX: div(PI, 32), vertexPhaseStepY: -div(PI, 64),
      phaseVelocityX: div(PI, 16), phaseVelocityY: div(PI, 32),
      normalizationEpsilon: f32(.01), wrapPhase: wrapAngle, forceOpaque: true,
      positionBounds: { minX: 0, minY: 0, maxX: mesh.screenWidth, maxY: mesh.screenHeight, insetX: 1, insetY: 1 } });
  }
  update(center, clockScale = 1) {
    this.colorAt = (this.color & 0xffffff) === 0xffffff ? null : enemyDistortionColor;
    this.positionBounds.maxX = f32(this.mesh.screenWidth); this.positionBounds.maxY = f32(this.mesh.screenHeight);
    return super.update(center, clockScale);
  }
}
