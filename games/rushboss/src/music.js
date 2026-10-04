// SPDX-License-Identifier: GPL-3.0-only
// Track identities, file paths and loop markers belong to the demo. The source
// volume curve and frame-based fade remain portable public thlib owners.
import {TouhouMusicFade,touhouMusicVolume} from '@ts-stg/thlib/touhou';

const checkedVolume=value=>{
  if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('Music volume must be between 0 and 1');
  return value;
};
const gain=value=>Math.pow(10,touhouMusicVolume(0,value*100)/2000);

export class RushMusic {
  constructor(host,tracks,{basePath='games/rushboss/assets',volume=.7}={}) {
    this.host=host;this.tracks=tracks;this.basePath=basePath;this.volume=checkedVolume(volume);
    this.handles=new Map();this.current=null;this.key=null;this.paused=false;this.fade=null;this.disposed=false;
  }
  play(key,{restart=false}={}) {
    if(this.disposed)throw new Error('Music owner has been disposed');
    const track=this.tracks[key];if(!track)return false;
    // A dialogue and its combat handoff may intentionally request the same
    // continuous track. New sessions/retries explicitly request a restart.
    if(this.key===key&&!restart)return false;
    const cached=this.handles.has(key);
    if(!cached){
      const id=this.host.loadMusic(`${this.basePath}/${track.file}`);this.handles.set(key,id);
      this.host.setMusicLoop?.(id,track.loopBegin/(track.sampleRate*track.channels),track.loopEnd/(track.sampleRate*track.channels));
    }
    const id=this.handles.get(key),previous=this.current;
    this.stop();
    // Reset a reused decoder as well as its transport buffer before starting;
    // pause/resume below deliberately use neither this path nor seek.
    if(cached&&id!==previous)this.host.stopMusic?.(id);
    this.current=id;this.key=key;
    this.host.seekMusic?.(id,0);this.host.playMusic?.(id,gain(this.volume));return true;
  }
  pause(){if(this.current!==null&&!this.paused){this.host.pauseMusic?.(this.current);this.paused=true;}}
  resume(){if(this.current!==null&&this.paused){this.host.resumeMusic?.(this.current);this.paused=false;}}
  stop(){
    this.fade?.destroy();this.fade=null;
    if(this.current!==null)this.host.stopMusic?.(this.current);
    this.current=null;this.key=null;this.paused=false;
  }
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
  dispose(){
    if(this.disposed)return;this.disposed=true;this.stop();
    for(const id of this.handles.values()){this.host.stopMusic?.(id);this.host.unloadMusic?.(id);}
    this.handles.clear();
  }
}
