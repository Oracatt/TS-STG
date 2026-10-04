// Frozen pre-optimization scalar construction: differential geometry reference.
import { PI, add, sub, mul, div, sin, cos, wrapAngle, rotate, polar } from '../../../games/touhou20/src/math.js';
import { UnsupportedAnmError } from '../../../games/touhou20/src/anm-vm.js';

const convertColor = argb => (((argb & 0xffffff) << 8) | (argb >>> 24)) >>> 0;
const factors = [
  ['srcAlpha', 'oneMinusSrcAlpha', 'add'], ['srcAlpha', 'one', 'add'],
  ['srcAlpha', 'one', 'reverseSubtract'], ['one', 'zero', 'add'],
  ['oneMinusDstColor', 'oneMinusSrcColor', 'add'], ['dstColor', 'zero', 'add'],
  ['oneMinusSrcColor', 'oneMinusSrcAlpha', 'add'], ['dstAlpha', 'oneMinusDstAlpha', 'add'],
  ['srcAlpha', 'one', 'min'], ['srcAlpha', 'one', 'max'],
];
const colorMultiply = (a, b, normalized) => {
  let result = 0;
  for (let shift = 0; shift < 32; shift += 8) { const product = ((a >>> shift) & 255) * ((b >>> shift) & 255); result |= Math.min(255, normalized ? Math.floor(product / 255) : product >>> 7) << shift; }
  return result >>> 0;
};
function colors(vm) {
  const mode = (vm.U(0x4a0) >>> 10) & 7, primary = vm.U(0x490), secondary = vm.U(0x494);
  if (mode === 0 || mode === 1 || mode === 4) {
    let color = mode === 0 ? primary : mode === 1 ? secondary : colorMultiply(primary, secondary, true);
    if ((vm.U(0x49c) & 0x1000000) && vm.parent) color = colorMultiply(color, vm.parent.U(0x5cc), false);
    vm.U(0x5cc, color); return [color, color, color, color];
  }
  if (mode === 2) return [primary, secondary, primary, secondary];
  if (mode === 3) return [primary, primary, secondary, secondary];
  throw new UnsupportedAnmError(vm, `color mode ${mode}`);
}
function scaleMode(vm, view) {
  if (view.screenScale === undefined) return 1;
  const mode = vm.B(0x4a4);
  return mode === 1 || mode === 5 ? view.screenScale : mode === 2 || mode === 6 ? mul(view.screenScale, .5) : 1;
}
const anchors = [[-.5, .5], [0, 1], [-1, 0]];
const project = (point, view) => [add(view.x ?? 0, mul(point.x, view.scale ?? 1)), add(view.y ?? 0, mul(point.y, view.scale ?? 1))];
const vertex = (point, view, color, u = 0, v = 0) => [...project(point, view), u, v, convertColor(color)];

/** Recovered sprite corner and UV construction; testable without a renderer. */
export function anmSpriteVertices(vm, view = {}) {
  const sprite = vm.bank.data.sprites[vm.spriteIndex];
  if (!sprite) throw new UnsupportedAnmError(vm, `text-renderer fallback sprite ${vm.spriteIndex}`);
  const entry = vm.bank.data.entries[sprite.entry];
  const position = vm.worldPosition(view), rotated = vm.renderType === 1 || vm.renderType === 3;
  const angle = rotated ? wrapAngle(add(vm.inheritedRotation(), sprite.rotation)) : 0;
  let sx = mul(vm.scaleX, vm.scale2X), sy = mul(vm.scaleY, vm.scale2Y);
  if (vm.parent && !(vm.U(0x49c) & 0x1000)) { sx = mul(mul(vm.parent.scaleX, vm.parent.scale2X), sx); sy = mul(mul(vm.parent.scaleY, vm.parent.scale2Y), sy); }
  sx = mul(sx, scaleMode(vm, view)); sy = mul(sy, scaleMode(vm, view));
  const anchorX = anchors[vm.U(0x4a8)], anchorY = anchors[vm.U(0x4ac)];
  if (!anchorX || !anchorY) throw new UnsupportedAnmError(vm, 'sprite anchor outside 0..2');
  const dx = sub(sprite.pivotX, vm.F(0x80)), dy = sub(sprite.pivotY, vm.F(0x84));
  const baseColors = colors(vm), points = [];
  const textureWidth = vm.bank.environment.paddedTextures ? entry.width : entry.texture.width ?? entry.width;
  const textureHeight = vm.bank.environment.paddedTextures ? entry.height : entry.texture.height ?? entry.height;
  const u0 = add(div(sprite.x, textureWidth), mul(vm.F(0x78), div(entry.width, textureWidth)));
  const v0 = add(div(sprite.y, textureHeight), mul(vm.F(0x7c), div(entry.height, textureHeight)));
  const u1 = add(u0, mul(div(sprite.width, textureWidth), vm.textureScaleX));
  const v1 = add(v0, mul(div(sprite.height, textureHeight), vm.textureScaleY));
  for (let i = 0; i < 4; i++) {
    const x = mul(mul(sub(mul(anchorX[i & 1], vm.width), dx), sprite.scaleX), sx);
    const y = mul(mul(sub(mul(anchorY[i >> 1], vm.height), dy), sprite.scaleY), sy);
    const offset = rotated ? rotate(x, y, angle) : { x, y };
    const point = vertex({ x: add(position.x, offset.x), y: add(position.y, offset.y) }, view, baseColors[i], i & 1 ? u1 : u0, i >> 1 ? v1 : v0);
    if (vm.renderType === 0 && view.pixelSnap !== false) {
      for (let axis = 0; axis < 2; axis++) point[axis] = sub(Math.sign(point[axis]) * Math.floor(Math.abs(point[axis]) + .5), .5);
    }
    points.push(point);
  }
  return points;
}


export function referenceWorldPosition(view = {}) {
    let x = add(add(this.x, this.F(0x2c)), this.F(0x484));
    let y = add(add(this.y, this.F(0x30)), this.F(0x488));
    let z = add(add(this.z, this.F(0x34)), this.F(0x48c));
    const mode = this.B(0x4a4);
    if (view.screenScale !== undefined && mode >= 1 && mode <= 4) { const scale = mode === 2 || mode === 4 ? mul(view.screenScale, .5) : view.screenScale; x = mul(x, scale); y = mul(y, scale); z = mul(z, scale); }
    if (this.transformParent && !(this.U(0x49c) & 0x1000)) {
      if (this.U(0x49c) & 0x20) { const rotated = rotate(x, y, this.transformParent.rotation); x = rotated.x; y = rotated.y; }
      if (this.U(0x49c) & 0x400000) { x = mul(x, this.transformParent.scaleX); y = mul(y, this.transformParent.scaleY); }
      const parent = referenceWorldPosition.call(this.transformParent,view); x = add(x, parent.x); y = add(y, parent.y); z = add(z, parent.z);
    } else {
      const preset = this.B(0x4a3) & 3;
      if (preset && view.screenOffsets) { const offset = view.screenOffsets[preset === 1 ? 0 : 1]; x = add(x, offset.x); y = add(y, offset.y); }
    }
    return { x, y, z };
  }
