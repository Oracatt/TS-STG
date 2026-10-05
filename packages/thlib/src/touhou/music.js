import {TouhouMusicFade} from './music-fade.js';
import {touhouMusicVolume} from './audio.js';

const checkedVolume=value=>{
  if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Music volume must be between 0 and 1');
  return value;
};
const gain=(volume,attenuation=0)=>Math.pow(10,touhouMusicVolume(attenuation,volume*100)/2000);

/** Cached music transport. Track selection and temporary-screen policy belong
 * to the application; playback is provided by an injected host adapter. */
export class TouhouMusic {
  constructor(host,tracks,{basePath='',volume=1}={}) {
    this.host=host;this.tracks=tracks;this.basePath=basePath;this.volume=checkedVolume(volume);
    this.handles=new Map();this.current=null;this.key=null;this.paused=false;this.fade=null;this.disposed=false;
    this._interruption=null;
  }
  play(key,{restart=false}={}) {
    this._checkAlive();
    if(!Object.hasOwn(this.tracks,key)||!this.tracks[key])return false;
    this._cancelInterruption();
    // Dialogue and combat may request the same continuous track. A new run
    // explicitly restarts it, including when its decoder is already cached.
    if(this.key===key&&!restart)return false;
    this._start(key);return true;
  }
  pause(){if(this.current!==null&&!this.paused){this.host.pauseMusic?.(this.current);this.paused=true;}}
  resume(){if(this.current!==null&&this.paused){this.host.resumeMusic?.(this.current);this.paused=false;}}
  stop(){this._cancelInterruption();this._stopCurrent();}
  setVolume(value){
    this.volume=checkedVolume(value);
    if(this.current!==null){
      if(this.fade?.alive)this.fade.setVolume(value*100);
      else this.host.setMusicVolume?.(this.current,gain(value));
    }
  }
  fadeOut(seconds=2){
    if(this.current===null)return null;
    const id=this.current;
    const fade=new TouhouMusicFade({seconds,volume:this.volume*100,
      setVolume:value=>{if(this.current===id)this.host.setMusicVolume?.(id,value);},
      stop:()=>{if(this.current===id)this.stop();}});
    this.fade?.destroy();this.fade=fade;return fade;
  }
  update(){if(!this.paused)this.fade?.update();}
  interrupt(key){
    this._checkAlive();
    if(!Object.hasOwn(this.tracks,key)||!this.tracks[key])throw new RangeError(`Unknown music track: ${key}`);
    const existing=this._interruption;
    const saved=existing?.saved??{key:this.key,time:this.current===null?0:(this.host.getMusicTime?.(this.current)??0),
      paused:this.paused,fade:this.fade};
    // Detach the original fade before stopping its stream so its clock can be
    // restored. Replacing a temporary track keeps the first recovery point.
    if(!existing)this.fade=null;
    try{this._start(key);}catch(error){if(!existing)this.fade=saved.fade;throw error;}
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
  dispose(){
    if(this.disposed)return;this.disposed=true;this.stop();
    for(const id of this.handles.values()){this.host.stopMusic?.(id);this.host.unloadMusic?.(id);}
    this.handles.clear();
  }
  _checkAlive(){if(this.disposed)throw new Error('Music owner has been disposed');}
  _cancelInterruption(){this._interruption?.saved.fade?.destroy();this._interruption=null;}
  _stopCurrent(){
    this.fade?.destroy();this.fade=null;
    if(this.current!==null)this.host.stopMusic?.(this.current);
    this.current=null;this.key=null;this.paused=false;
  }
  _start(key,{time=0,paused=false,fade=null}={}){
    const track=this.tracks[key],cached=this.handles.has(key);
    if(!cached){
      const path=this.basePath?`${this.basePath.replace(/[\\/]$/,'')}/${track.file}`:track.file;
      const id=this.host.loadMusic(path);this.handles.set(key,id);
      if(track.loopEnd!==undefined)this.host.setMusicLoop?.(id,track.loopStart??0,track.loopEnd);
    }
    const id=this.handles.get(key),previous=this.current;
    this._stopCurrent();
    if(cached&&id!==previous)this.host.stopMusic?.(id);
    this.current=id;this.key=key;
    this.host.seekMusic?.(id,time);
    this.host.playMusic?.(id,gain(this.volume,fade?.alive?fade.attenuation:0));
    if(paused)this.pause();
    if(fade?.alive){this.fade=fade;fade.setVolume(this.volume*100);}
  }
}
