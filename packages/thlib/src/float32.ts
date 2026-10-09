


/** IEEE-754 binary32 arithmetic. Inputs and results round at each operation.
 * Transcendentals use the host ECMAScript Math function, then round to binary32;
 * this does not promise a correctly-rounded or identical libm on every backend.
 */
export const f32: (value: number) => number = Math.fround;
export const f32Add = (a: number, b: number): number => f32(f32(a) + f32(b));
export const f32Sub = (a: number, b: number): number => f32(f32(a) - f32(b));
export const f32Mul = (a: number, b: number): number => f32(f32(a) * f32(b));
export const f32Div = (a: number, b: number): number => f32(f32(a) / f32(b));
export const f32Sin =(value: number): number => f32(Math.sin(f32(value)));
export const f32Cos =(value: number): number => f32(Math.cos(f32(value)));
export const f32Sqrt =(value: number): number => f32(Math.sqrt(f32(value)));
export const f32Atan2 = (y: number, x: number): number => f32(Math.atan2(f32(y), f32(x)));
