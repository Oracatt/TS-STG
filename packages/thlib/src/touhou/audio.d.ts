export interface TouhouAudioManifest {definitions:Array<{id:number;fileIndex:number;volume:number;cooldown:number;playFlags:number;retained:number}>;files:Array<{name:string;path:string;sha256:string}>;}
export function touhouSoundPan(x:number,panRange?:number):number;
export function touhouEffectVolume(attenuation:number,volume:number):number;
/** Original music attenuation in hundredths of a decibel; volume is 0..100. */
export function touhouMusicVolume(attenuation:number,volume:number):number;
export class TouhouAudio {constructor(manifest:TouhouAudioManifest,adapter:{load:(path:string)=>number;play:(id:number,settings:{attenuation:number;pan:number;loop:boolean})=>void;stop?:(id:number)=>void},options?:{volume?:number;panRange?:number});volume:number;request(id:number,x?:number):void;stop(id:number):void;flush():void;}
