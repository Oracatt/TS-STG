/** Round to IEEE-754 binary32. */
export const f32: (value: number) => number;
/** Round both inputs and the result to binary32 at each operation. */
export function f32Add(a: number, b: number): number;
export function f32Sub(a: number, b: number): number;
export function f32Mul(a: number, b: number): number;
export function f32Div(a: number, b: number): number;
/** ECMAScript Math transcendental with binary32 input/output rounding. */
export function f32Sin(value: number): number;
export function f32Cos(value: number): number;
export function f32Sqrt(value: number): number;
export function f32Atan2(y: number, x: number): number;
