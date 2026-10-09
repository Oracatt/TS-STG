export interface TouhouMusicFadeOptions {
  /** Seconds at the original 60 fixed frames per second; defaults to 2. */
  seconds?:number;
  /** Original music setting, 0..100; defaults to 100. */
  volume?:number;
  /** Apply linear audio gain without restarting, seeking or resuming playback. */
  setVolume?:((gain:number)=>void)|null;
  stop?:(()=>void)|null;
}

export interface TouhouMusicFadeState {frame:number;alive:boolean;remaining:number;duration:number;attenuation:number;volume:number;}

import { f32, mul } from './math.js';
import { touhouMusicVolume } from './audio.js';

function checkVolume(volume: number) {
  if(!Number.isFinite(volume)||volume<0||volume>100)throw new RangeError('Music volume must be between 0 and 100');
  return volume;
}

/** Source MusicStream::fade_out/tick_fade mode1, independent of tracks and host.
 * Call once per fixed simulation frame. Pausing the owner preserves the fade.
 * The adapter receives linear gain, suitable for native setMusicVolume. */
export class TouhouMusicFade {
  declare applyVolume: ((gain: number) => void) | null;
  declare stop: (() => void) | null;

  declare readonly frame: number;
  declare readonly alive: boolean;
  declare readonly remaining: number;
  declare readonly duration: number;
  declare readonly attenuation: number;
  declare readonly volume: number;

  constructor({seconds=2,volume=100,setVolume=null,stop=null}: TouhouMusicFadeOptions={} as TouhouMusicFadeOptions) {
    if(!Number.isFinite(seconds)||seconds<0||mul(seconds,60)>2147483647)
      throw new RangeError('Music fade duration must be finite, nonnegative and fit the source frame counter');
    if(setVolume!==null&&typeof setVolume!=='function')throw new TypeError('Music fade setVolume must be a function');
    if(stop!==null&&typeof stop!=='function')throw new TypeError('Music fade stop must be a function');
    this.duration=Math.trunc(mul(f32(seconds),60));this.remaining=this.duration;
    this.volume=checkVolume(volume);this.frame=0;this.attenuation=0;this.alive=true;
    this.applyVolume=setVolume;this.stop=stop;
  }
  update(): this {
    if(!(this as {alive:boolean}).alive)return this;
    (this as {frame:number}).frame++;(this as {remaining:number}).remaining--;
    // The source stops before applying a final -5000 attenuation sample.
    if(this.remaining<1){(this as {alive:boolean}).alive=false;this.stop?.();return this;}
    (this as {attenuation:number}).attenuation=Math.trunc(Math.imul(this.remaining,5000)/this.duration)-5000;
    this.apply();return this;
  }
  apply(){this.applyVolume?.(Math.pow(10,touhouMusicVolume(this.attenuation,this.volume)/2000));}
  setVolume(volume: number): this{(this as {volume:number}).volume=checkVolume(volume);if(this.alive)this.apply();return this;}
  destroy(): void{(this as {alive:boolean}).alive=false;}
  snapshot(): TouhouMusicFadeState{return{frame:this.frame,alive:this.alive,remaining:this.remaining,duration:this.duration,attenuation:this.attenuation,volume:this.volume};}
}
