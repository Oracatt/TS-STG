// Source sound queue and volume/pan arithmetic, platform playback is injected.
import { f32,sub,mul,div,trunc32 } from './math.js';
export const touhouSoundPan=(x,panRange=192)=>trunc32(div(mul(x,1000),panRange));
export function touhouEffectVolume(attenuation,volume) {
  if(volume===0)return -10000;
  const inverse=sub(1,div(f32(volume),100)),squared=mul(inverse,inverse),gain=sub(1,mul(squared,inverse));
  return (trunc32(mul((attenuation|0)+5000,gain))-5000)|0;
}
// audio_runtime/audio_state.cpp::music_volume. Music uses the source squared
// setting curve; effects above deliberately keep their separate cubic curve.
export function touhouMusicVolume(attenuation,volume) {
  if(volume===0)return -10000;
  const inverse=sub(1,div(f32(volume),100)),gain=sub(1,mul(inverse,inverse));
  return (trunc32(mul((attenuation|0)+5000,gain))-5000)|0;
}
export class TouhouAudio {
  constructor(manifest,adapter,{volume=100,panRange=192}={}) {
    this.manifest=manifest;this.adapter=adapter;this.volume=volume;this.panRange=panRange;this.queue=[];this.handles=new Map();
    this.definitions=new Map(manifest.definitions.map(d=>[d.id,d]));
  }
  request(id,x=0) {
    if(!Number.isInteger(id)||id<0||id>=90)throw new RangeError('Original sound id outside0..89');
    let item=this.queue.find(item=>item.id===id);if(!item){if(this.queue.length>=12)return;item={id,pans:[]};this.queue.push(item);}
    if(item.pans.length<60&&!item.stop)item.pans.push(touhouSoundPan(x,this.panRange));
  }
  stop(id) {const item=this.queue.find(item=>item.id===id);if(item)item.stop=true;else if(this.queue.length<12)this.queue.push({id,stop:true,pans:[]});}
  flush() {
    for(const item of this.queue) {
      const definition=this.definitions.get(item.id);if(!definition)throw new Error(`Missing original sound definition ${item.id}`);
      if(item.stop){const handle=this.handles.get(item.id);if(handle!==undefined)this.adapter.stop?.(handle);continue;}
      if(!this.handles.has(item.id))this.handles.set(item.id,this.adapter.load(this.manifest.files[definition.fileIndex].path));
      let sum=0;for(const pan of item.pans)sum=(sum+pan)|0;
      const pan=item.pans.length?Math.trunc(sum/item.pans.length):sum,attenuation=touhouEffectVolume(definition.volume,this.volume);
      this.adapter.play(this.handles.get(item.id),{attenuation,pan,loop:!!(definition.playFlags&1)});
    }
    this.queue.length=0;
  }
}
