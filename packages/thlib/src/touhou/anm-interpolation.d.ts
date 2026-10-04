export function anmEasing(mode:number,time:number,duration:number):number;
export class AnmInterpolation {
 constructor(start:number[],end:number[],duration:number,mode:number,options?:{integer?:boolean;angle?:boolean;tangents?:[number[],number[]]});
 start:number[];end:number[];current:number[];duration:number;mode:number;time:number;
 /** Returns an independent array; retaining or editing it never changes the track. */
 sample(rate?:number,copy?:true):number[];
 /** @internal Borrowed state for the VM's immediate read. Do not retain or edit. */
 sample(rate:number,copy:false):number[];
}
