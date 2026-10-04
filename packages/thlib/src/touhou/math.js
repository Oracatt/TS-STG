// Source: ecl_vm/math.cpp, runtime_state/motion.cpp, native_recovered/native_core.hpp.
// Every SSE single-precision arithmetic boundary is explicit. Transcendentals
// use ECMAScript libm followed by float32 conversion, as the source does.
import { f32, f32Add as add, f32Sub as sub, f32Mul as mul, f32Div as div,
  f32Sin as sin, f32Cos as cos, f32Sqrt as sqrt, f32Atan2 as atan2 } from '../float32.js';
export { f32, add, sub, mul, div, sin, cos, sqrt, atan2 };
export const PI = f32(Math.PI);
export const trunc32 = x => { x = f32(x); return !Number.isFinite(x) || x < -2147483648 || x >= 2147483648 ? -2147483648 : Math.trunc(x) | 0; };
export function wrapAngle(value) {
  value = f32(value);
  if (value > PI) { let count = 0; do { value = sub(value, mul(PI, 2)); if (count > 32) break; count++; } while (value > PI); }
  else if (value < -PI) { let count = 0; do { value = add(mul(PI, 2), value); if (count > 32) break; count++; } while (value < -PI); }
  return value;
}
export function angleDifference(first, second) {
  if (sub(first, second) > PI) return sub(first, add(mul(PI, 2), second));
  if (sub(second, first) > PI) return sub(first, sub(second, mul(PI, 2)));
  return sub(first, second);
}
export const polar = (angle, length) => ({ x: mul(cos(angle), length), y: mul(sin(angle), length) });
export const snap = value => div(f32(Math.floor(mul(value, 100))), 100);
export function rotate(x, y, angle) { const s = sin(angle), c = cos(angle); return { x: sub(mul(x, c), mul(y, s)), y: add(mul(y, c), mul(x, s)) }; }
export class TouhouTimer {
  constructor(value = 0) { this.set(value); }
  set(value) { this.current = value | 0; this.previous = (value - 1) | 0; this.value = f32(value); return this; }
  tick(rate = 1) {
    this.previous = this.current;
    if (rate > f32(.99) && rate < f32(1.01)) { this.current = (this.current + 1) | 0; this.value = add(this.value, 1); }
    else { this.value = add(this.value, rate); this.current = trunc32(this.value); }
    return this.current;
  }
  add(delta, rate = 1) {
    this.previous = this.current;
    this.value = add(this.value, rate > f32(.99) && rate < f32(1.01) ? delta : mul(rate, delta));
    this.current = trunc32(this.value); return this.current;
  }
}
export class TouhouRNG {
  constructor(seed = 1, modulus = 0x7fffffff) { this.state = (seed >>> 0) % 0x7fffffff || 1; this.modulus = modulus >>> 0; this.last = seed >>> 0; }
  next() {
    const product = this.state * 48271;
    let folded = Math.floor(product / 0x80000000) + product % 0x80000000;
    if (folded >= 0x7fffffff) folded -= 0x7fffffff;
    this.last = this.state = folded >>> 0;
    if (!this.modulus) throw new RangeError('Original RNG zero modulus');
    return this.last % this.modulus;
  }
  uint() { return this.next(); }
  unit() { return div(f32(this.next()), sub(f32(this.modulus), 1)); }
  signed() { return sub(div(f32(this.next()), sub(div(f32(this.modulus), 2), 1)), 1); }
  signedUnit() { return this.signed(); }
}
export function rectangleCircle(cx, cy, width, height, angle, px, py, radius) {
  const local = rotate(sub(px, cx), sub(py, cy), -angle);
  const hw = div(width, 2), hh = div(height, 2), ax = Math.abs(local.x), ay = Math.abs(local.y);
  if (add(hw, radius) >= ax && hh >= ay) return true;
  if (hw >= ax && add(hh, radius) >= ay) return true;
  const squared = (x, y) => add(mul(x, x), mul(y, y)), rr = mul(radius, radius);
  return rr > squared(sub(local.x, hw), sub(local.y, hh)) || rr > squared(add(local.x, hw), sub(local.y, hh)) ||
    rr > squared(sub(local.x, hw), add(local.y, hh)) || rr > squared(add(local.x, hw), add(local.y, hh));
}
