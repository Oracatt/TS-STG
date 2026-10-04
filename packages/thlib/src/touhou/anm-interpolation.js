import { f32, PI, add, sub, mul, div, sin, trunc32, wrapAngle, angleDifference } from './math.js';
const power = (x, n) => { let result = x; for (let i = 1; i < n; i++) result = mul(result, x); return result; };
const shifted = (t, k) => { const denominator = mul(sub(1, k), sub(1, k)), offset = div(mul(k, k), denominator); return div(sub(div(mul(sub(t, k), sub(t, k)), denominator), offset), sub(1, offset)); };
const shiftedOffsets = [.25, .3, .35, .38, .4];

/** Direct float32 translation of ecl_vm/math.cpp::easing. */
export function anmEasing(mode, time, duration) {
  if (duration === 0) return 1;
  let t = div(time, duration);
  if(mode===0)return t;
  if (mode >= 1 && mode <= 3) return power(t, mode + 1);
  if (mode >= 4 && mode <= 6) return sub(1, power(sub(1, t), mode - 2));
  if (mode >= 9 && mode <= 11) { t = mul(t, 2); return div(t >= 1 ? sub(2, power(sub(2, t), mode - 7)) : power(t, mode - 7), 2); }
  if (mode >= 12 && mode <= 14) { t = mul(t, 2); return t >= 1 ? add(div(power(sub(t, 1), mode - 10), 2), .5) : sub(.5, div(power(sub(1, t), mode - 10), 2)); }
  if (mode === 15) return 0;
  if (mode === 16) return 1;
  if (mode === 18) return sin(div(mul(t, PI), 2));
  if (mode === 19) return sub(1, sin(add(div(mul(t, PI), 2), div(PI, 2))));
  if (mode === 20) { t = mul(t, 2); return t >= 1 ? add(div(sub(1, sin(div(mul(t, PI), 2))), 2), .5) : div(sin(div(mul(t, PI), 2)), 2); }
  if (mode === 21) { t = mul(t, 2); return t >= 1 ? add(div(sin(div(mul(sub(t, 1), PI), 2)), 2), .5) : div(sub(1, sin(add(div(mul(t, PI), 2), div(PI, 2)))), 2); }
  if (mode >= 22 && mode <= 26) return shifted(t, f32(shiftedOffsets[mode - 22]));
  if (mode >= 27 && mode <= 31) return sub(1, shifted(sub(1, t), f32(shiftedOffsets[mode - 27])));
  return t;
}

/** Mirrors the scalar/vector float, color integer and wrapped-angle samplers. */
export class AnmInterpolation {
  constructor(start, end, duration, mode, { integer = false, angle = false, tangents = null } = {}) {
    this.start = start.slice(); this.end = end.slice(); this.current = start.slice();
    this.duration = duration | 0; this.mode = mode | 0; this.integer = integer; this.angle = angle;
    this.time = 0; this.tangentStart = tangents?.[0]?.slice() ?? start.map(() => 0);
    this.tangentEnd = tangents?.[1]?.slice() ?? start.map(() => 0);
  }
  // copy=false is reserved for the VM's immediate read. Public callers keep
  // independent return arrays, including after a track reaches its endpoint.
  sample(rate = 1, copy = true) {
    if (this.duration > 0) { this.time = add(this.time, rate); if (trunc32(this.time) >= this.duration) { this.time = this.duration; this.duration = 0; } }
    if (this.duration === 0) { const result=this.mode === 7 || this.mode === 17 ? this.start : this.end;return copy?result.slice():result; }
    // Hermite bases are irrelevant to the ordinary linear/easing tracks used
    // by most bullets. Do not evaluate their float32 polynomial every frame.
    const t = this.mode===8?div(this.time, this.duration):0;
    const bases = this.mode===8?[mul(mul(sub(t, 1), sub(t, 1)), add(mul(2, t), 1)), mul(mul(t, t), sub(3, mul(2, t))), mul(mul(sub(1, t), sub(1, t)), t), mul(mul(sub(t, 1), t), t)]:null;
    const easing=this.mode!==7&&this.mode!==8&&this.mode!==17?anmEasing(this.mode,this.time,this.duration):0;
    const wrap = value => this.angle ? wrapAngle(value) : value;
    for (let i = 0; i < this.start.length; i++) {
      let value;
      if (this.mode === 7) value = this.start[i] = this.integer ? (this.start[i] + this.end[i]) | 0 : wrap(add(this.start[i], this.end[i]));
      else if (this.mode === 17) {
        value = this.start[i] = this.integer ? (this.start[i] + this.tangentEnd[i]) | 0 : wrap(add(this.start[i], this.tangentEnd[i]));
        this.tangentEnd[i] = this.integer ? (this.tangentEnd[i] + this.end[i]) | 0 : wrap(add(this.tangentEnd[i], this.end[i]));
      } else if (this.mode === 8) {
        const values = [this.start[i], this.end[i], this.tangentStart[i], this.tangentEnd[i]];
        if (this.integer && this.start.length === 1) {
          // Scalar integer Hermite multiplies the control into each factor
          // before summing; vector integers multiply the precomputed basis.
          const term0=mul(mul(mul(values[0],sub(t,1)),sub(t,1)),add(mul(2,t),1));
          const term1=mul(mul(mul(values[1],t),t),sub(3,mul(2,t)));
          const term2=mul(mul(mul(values[2],sub(1,t)),sub(1,t)),t);
          const term3=mul(mul(mul(values[3],sub(t,1)),t),t);
          value=trunc32(add(add(add(term0,term1),term2),term3));
        } else if (this.integer && this.start.length > 1) value = values.reduce((sum, item, j) => (sum + trunc32(mul(item, bases[j]))) | 0, 0);
        else { value = wrap(mul(values[0], bases[0])); for (let j = 1; j < 4; j++) value = wrap(add(value, wrap(mul(values[j], bases[j])))); if (this.integer) value = trunc32(value); }
      } else {
        const delta = this.angle ? wrapAngle(angleDifference(this.end[i], this.start[i])) : this.integer ? (this.end[i] - this.start[i]) | 0 : sub(this.end[i], this.start[i]);
        const offset = wrap(mul(delta, easing));
        value = this.integer ? this.start.length === 1 ? trunc32(add(offset, this.start[i])) : (trunc32(offset) + this.start[i]) | 0 : wrap(add(offset, this.start[i]));
      }
      this.current[i] = value;
    }
    return copy?this.current.slice():this.current;
  }
}
