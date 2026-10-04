/** IEEE-754 binary32 arithmetic. Inputs and results round at each operation.
 * Transcendentals use the host ECMAScript Math function, then round to binary32;
 * this does not promise a correctly-rounded or identical libm on every backend.
 */
export const f32 = Math.fround;
export const f32Add = (a, b) => f32(f32(a) + f32(b));
export const f32Sub = (a, b) => f32(f32(a) - f32(b));
export const f32Mul = (a, b) => f32(f32(a) * f32(b));
export const f32Div = (a, b) => f32(f32(a) / f32(b));
export const f32Sin = value => f32(Math.sin(f32(value)));
export const f32Cos = value => f32(Math.cos(f32(value)));
export const f32Sqrt = value => f32(Math.sqrt(f32(value)));
export const f32Atan2 = (y, x) => f32(Math.atan2(f32(y), f32(x)));
