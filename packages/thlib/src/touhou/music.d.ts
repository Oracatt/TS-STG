import type {NativeHost} from '../native-host.js';
import type {TouhouMusicFade} from './music-fade.js';

export interface TouhouMusicTrack {
  file:string;
  /** Regional loop bounds in seconds. Without loopEnd, use the host default. */
  loopStart?:number;
  loopEnd?:number;
}
export type TouhouMusicTracks=Record<string,TouhouMusicTrack>;
export type TouhouMusicHost=Pick<NativeHost,'loadMusic'>&Partial<Pick<NativeHost,
  'playMusic'|'stopMusic'|'unloadMusic'|'pauseMusic'|'resumeMusic'|'setMusicVolume'|'setMusicLoop'|'seekMusic'|'getMusicTime'>>;
export interface TouhouMusicOptions {basePath?:string;volume?:number;}
export interface TouhouMusicInterruption {
  /** Restore the previous track, cursor, pause state and frozen fade once.
   * Uses the current global volume. Without getMusicTime/seekMusic support,
   * adapters cannot preserve the original playback position. */
  restore():void;
  /** Stop the temporary track without restoring the previous track. */
  discard():void;
}
export class TouhouMusic {
  constructor(host:TouhouMusicHost,tracks:TouhouMusicTracks,options?:TouhouMusicOptions);
  host:TouhouMusicHost;tracks:TouhouMusicTracks;basePath:string;volume:number;
  readonly handles:Map<string,number>;readonly current:number|null;readonly key:string|null;
  readonly paused:boolean;readonly fade:TouhouMusicFade|null;readonly disposed:boolean;
  /** Unknown tracks and continuous requests for the current track return false.
   * Any known explicit play invalidates an outstanding interruption token. */
  play(key:string,options?:{restart?:boolean}):boolean;
  pause():void;resume():void;stop():void;setVolume(volume:number):void;
  fadeOut(seconds?:number):TouhouMusicFade|null;
  /** Tick once per fixed simulation frame. Paused fades do not advance. */
  update():void;
  /** Start a temporary track at zero; unknown tracks throw. A second interrupt
   * replaces the temporary track and invalidates its token, preserving the
   * original recovery point. play/stop/dispose invalidate tokens permanently. */
  interrupt(key:string):TouhouMusicInterruption;
  dispose():void;
}
