export { f32, f32Add as add, f32Sub as sub, f32Mul as mul, f32Div as div,
  f32Sin as sin, f32Cos as cos, f32Sqrt as sqrt, f32Atan2 as atan2 } from '../index.js';
export const PI:number;
export function trunc32(x:number):number;
export function wrapAngle(x:number):number;export function angleDifference(first:number,second:number):number;
export function polar(angle:number,length:number):{x:number;y:number};export function snap(x:number):number;
export function rotate(x:number,y:number,angle:number):{x:number;y:number};
export function rectangleCircle(cx:number,cy:number,width:number,height:number,angle:number,px:number,py:number,radius:number):boolean;
export class TouhouTimer{constructor(value?:number);current:number;previous:number;value:number;set(value:number):this;tick(rate?:number):number;add(delta:number,rate?:number):number;}
export class TouhouRNG{constructor(seed?:number,modulus?:number);state:number;last:number;modulus:number;next():number;uint():number;signed():number;signedUnit():number;unit():number;}
