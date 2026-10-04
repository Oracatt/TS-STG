export interface RepeatChannelOptions {/** First repeat occurs on held frame delay+1. */delay?:number;/** Frames between repeats; positive unsigned integer. */interval?:number;}
export interface RepeatChannelState {readonly delay:number;readonly interval:number;mask:number;readonly counters:Uint32Array;/** @internal Remaining frames for periods longer than the initial delay. */readonly cooldowns:Uint32Array|null;}
export interface RepeatingInputOptions extends RepeatChannelOptions {channels?:Record<string,RepeatChannelOptions>;defaultChannel?:string;}
export class RepeatingInput {
 constructor(options?:RepeatingInputOptions);
 current:number;previous:number;pressed:number;released:number;
 readonly held:Uint32Array;readonly channels:Record<string,RepeatChannelState>;readonly defaultChannel:string;
 update(mask?:number):this;down(mask:number):boolean;justPressed(mask:number):boolean;justReleased(mask:number):boolean;
 repeatMask(channel?:string,includePressed?:boolean):number;
 /** Includes the initial press unless includePressed is false. */
 repeat(mask:number,channel?:string,includePressed?:boolean):boolean;
 reset():this;
}
