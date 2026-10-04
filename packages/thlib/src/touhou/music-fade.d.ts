export interface TouhouMusicFadeOptions {
  /** Seconds at the original 60 fixed frames per second; defaults to 2. */
  seconds?:number;
  /** Original music setting, 0..100; defaults to 100. */
  volume?:number;
  /** Apply linear audio gain without restarting, seeking or resuming playback. */
  setVolume?:(gain:number)=>void;
  stop?:()=>void;
}
export interface TouhouMusicFadeState {frame:number;alive:boolean;remaining:number;duration:number;attenuation:number;volume:number;}
export class TouhouMusicFade {
  constructor(options?:TouhouMusicFadeOptions);
  readonly frame:number;readonly alive:boolean;readonly remaining:number;readonly duration:number;readonly attenuation:number;readonly volume:number;
  /** Call once per running fixed frame; omit updates while paused. */
  update():this;
  /** Change the original volume setting without changing the fade frame. */
  setVolume(volume:number):this;
  /** Cancel without stopping the external stream. */
  destroy():void;
  snapshot():TouhouMusicFadeState;
}
