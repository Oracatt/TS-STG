import { f32, mul } from './math.js';
import { touhouMusicVolume } from './audio.js';

function checkVolume(volume) {
  if(!Number.isFinite(volume)||volume<0||volume>100)throw new RangeError('Music volume must be between 0 and 100');
  return volume;
}

/** Source MusicStream::fade_out/tick_fade mode1, independent of tracks and host.
 * Call once per fixed simulation frame. Pausing the owner preserves the fade.
 * The adapter receives linear gain, suitable for native setMusicVolume. */
export class TouhouMusicFade {
  constructor({seconds=2,volume=100,setVolume=null,stop=null}={}) {
    if(!Number.isFinite(seconds)||seconds<0||mul(seconds,60)>2147483647)
      throw new RangeError('Music fade duration must be finite, nonnegative and fit the source frame counter');
    if(setVolume!==null&&typeof setVolume!=='function')throw new TypeError('Music fade setVolume must be a function');
    if(stop!==null&&typeof stop!=='function')throw new TypeError('Music fade stop must be a function');
    this.duration=Math.trunc(mul(f32(seconds),60));this.remaining=this.duration;
    this.volume=checkVolume(volume);this.frame=0;this.attenuation=0;this.alive=true;
    this.applyVolume=setVolume;this.stop=stop;
  }
  update() {
    if(!this.alive)return this;
    this.frame++;this.remaining--;
    // The source stops before applying a final -5000 attenuation sample.
    if(this.remaining<1){this.alive=false;this.stop?.();return this;}
    this.attenuation=Math.trunc(Math.imul(this.remaining,5000)/this.duration)-5000;
    this.apply();return this;
  }
  apply(){this.applyVolume?.(Math.pow(10,touhouMusicVolume(this.attenuation,this.volume)/2000));}
  setVolume(volume){this.volume=checkVolume(volume);if(this.alive)this.apply();return this;}
  destroy(){this.alive=false;}
  snapshot(){return{frame:this.frame,alive:this.alive,remaining:this.remaining,duration:this.duration,attenuation:this.attenuation,volume:this.volume};}
}
