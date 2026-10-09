import type {NativeHost} from '../native-host.js';


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

import {TouhouMusicFade} from './music-fade.js';
import {touhouMusicVolume} from './audio.js';

interface MusicRecovery {key:string|null;time:number;paused:boolean;fade:TouhouMusicFade|null;}
const checkedVolume=(value:number)=>{
  if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Music volume must be between 0 and 1');
  return value;
};
const gain=(volume: number,attenuation=0)=>Math.pow(10,touhouMusicVolume(attenuation,volume*100)/2000);

/** Cached music transport. Track selection and temporary-screen policy belong
 * to the application; playback is provided by an injected host adapter. */
export class TouhouMusic {
  declare _interruption:{saved:MusicRecovery}|null;
  declare host: TouhouMusicHost;
  declare tracks: TouhouMusicTracks;
  declare basePath: string;
  declare volume: number;
  declare readonly handles: Map<string,number>;
  declare readonly current: number|null;
  declare readonly key: string|null;
  declare readonly paused: boolean;
  declare readonly fade: TouhouMusicFade|null;
  declare readonly disposed: boolean;

  constructor(host: TouhouMusicHost,tracks: TouhouMusicTracks,{basePath='',volume=1}: TouhouMusicOptions={} as TouhouMusicOptions) {
    this.host=host;this.tracks=tracks;this.basePath=basePath;this.volume=checkedVolume(volume);
    this.handles=new Map();this.current=null;this.key=null;this.paused=false;this.fade=null;this.disposed=false;
    this._interruption=null;
  }
  play(key: string,{restart=false}: {restart?:boolean}={}): boolean {
    this._checkAlive();
    if(!Object.hasOwn(this.tracks,key)||!this.tracks[key])return false;
    this._cancelInterruption();
    // Dialogue and combat may request the same continuous track. A new run
    // explicitly restarts it, including when its decoder is already cached.
    if(this.key===key&&!restart)return false;
    this._start(key);return true;
  }
  pause(): void{if(this.current!==null&&!(this as {paused:boolean}).paused){this.host.pauseMusic?.(this.current);(this as {paused:boolean}).paused=true;}}
  resume(): void{if(this.current!==null&&this.paused){this.host.resumeMusic?.(this.current);(this as {paused:boolean}).paused=false;}}
  stop(): void{this._cancelInterruption();this._stopCurrent();}
  setVolume(value: number): void{
    this.volume=checkedVolume(value);
    if(this.current!==null){
      if(this.fade?.alive)this.fade.setVolume(value*100);
      else this.host.setMusicVolume?.(this.current,gain(value));
    }
  }
  fadeOut(seconds: number=2): TouhouMusicFade|null{
    if(this.current===null)return null;
    const id=this.current;
    const fade=new TouhouMusicFade({seconds,volume:this.volume*100,
      setVolume:value=>{if(this.current===id)this.host.setMusicVolume?.(id,value);},
      stop:()=>{if(this.current===id)this.stop();}});
    this.fade?.destroy();(this as {fade:TouhouMusicFade|null}).fade=fade;return fade;
  }
  update(): void{if(!(this as {paused:boolean}).paused)this.fade?.update();}
  interrupt(key: string): TouhouMusicInterruption{
    this._checkAlive();
    if(!Object.hasOwn(this.tracks,key)||!this.tracks[key])throw new RangeError(`Unknown music track: ${key}`);
    const existing=this._interruption;
    const saved=existing?.saved??{key:this.key,time:this.current===null?0:(this.host.getMusicTime?.(this.current)??0),
      paused:this.paused,fade:this.fade};
    // Detach the original fade before stopping its stream so its clock can be
    // restored. Replacing a temporary track keeps the first recovery point.
    if(!existing)(this as {fade:TouhouMusicFade|null}).fade=null;
    try{this._start(key);}catch(error){if(!existing)(this as {fade:TouhouMusicFade|null}).fade=saved.fade;throw error;}
    const session={saved};this._interruption=session;
    return{
      restore:()=>{
        if(this._interruption!==session)return;
        this._interruption=null;
        if(saved.key===null)this._stopCurrent();
        else this._start(saved.key,saved);
      },
      discard:()=>{
        if(this._interruption!==session)return;
        this.stop();
      },
    };
  }
  dispose(): void{
    if(this.disposed)return;(this as {disposed:boolean}).disposed=true;this.stop();
    for(const id of this.handles.values()){this.host.stopMusic?.(id);this.host.unloadMusic?.(id);}
    this.handles.clear();
  }
  _checkAlive(){if(this.disposed)throw new Error('Music owner has been disposed');}
  _cancelInterruption(){this._interruption?.saved.fade?.destroy();this._interruption=null;}
  _stopCurrent(){
    this.fade?.destroy();(this as {fade:TouhouMusicFade|null}).fade=null;
    if(this.current!==null)this.host.stopMusic?.(this.current);
    (this as {current:number|null}).current=null;(this as {key:string|null}).key=null;(this as {paused:boolean}).paused=false;
  }
  _start(key: string,{time=0,paused=false,fade=null}:Partial<MusicRecovery>={}){
    const track=this.tracks[key],cached=this.handles.has(key);
    if(!cached){
      const path=this.basePath?`${this.basePath.replace(/[\\/]$/,'')}/${track.file}`:track.file;
      const id=this.host.loadMusic(path);this.handles.set(key,id);
      if(track.loopEnd!==undefined)this.host.setMusicLoop?.(id,track.loopStart??0,track.loopEnd);
    }
    const id=this.handles.get(key)!,previous=this.current;
    this._stopCurrent();
    if(cached&&id!==previous)this.host.stopMusic?.(id);
    (this as {current:number|null}).current=id;(this as {key:string|null}).key=key;
    this.host.seekMusic?.(id,time);
    this.host.playMusic?.(id,gain(this.volume,fade?.alive?fade.attenuation:0));
    if(paused)this.pause();
    if(fade?.alive){(this as {fade:TouhouMusicFade|null}).fade=fade;fade.setVolume(this.volume*100);}
  }
}
