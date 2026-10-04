/** Fixed-frame 32-button edges and configurable, independent repeat channels.
 * A channel first repeats on held frame delay+1, then every interval frames.
 * Press/release/repeat masks use JavaScript's signed 32-bit bitwise semantics;
 * current/previous masks and per-button counters are unsigned 32-bit values.
 */
export class RepeatingInput {
  constructor({delay=20,interval=5,channels,defaultChannel}={}) {
    const definitions=channels??{default:{delay,interval}},names=Object.keys(definitions);
    if(!names.length)throw new RangeError('RepeatingInput requires at least one repeat channel');
    this.defaultChannel=defaultChannel??names[0];this.channels=Object.create(null);this._channels=[];
    for(const name of names){
      const definition=definitions[name],wait=definition.delay??delay,period=definition.interval??interval;
      if(!Number.isInteger(wait)||wait<0||wait>=0xffffffff)throw new RangeError(`Invalid repeat delay for ${name}`);
      if(!Number.isInteger(period)||period<1||period>0xffffffff)throw new RangeError(`Invalid repeat interval for ${name}`);
      const channel={delay:wait,interval:period,mask:0,counters:new Uint32Array(32)};
      // The accumulator directly preserves short-period frame arithmetic.
      // Long periods need a separate cooldown rather than unsigned underflow.
      channel.cooldowns=period>wait+1?new Uint32Array(32):null;
      this.channels[name]=channel;this._channels.push(channel);
    }
    this._channel(this.defaultChannel);
    this.current=this.previous=this.pressed=this.released=0;this.held=new Uint32Array(32);
  }
  _channel(name){const channel=this.channels[name];if(!channel)throw new RangeError(`Unknown repeat channel ${name}`);return channel;}
  update(mask=0){
    this.previous=this.current;this.current=mask>>>0;
    for(const channel of this._channels)channel.mask=0;
    for(let i=0;i<32;i++){
      const bit=1<<i;
      if(!(this.current&bit)){
        this.held[i]=0;
        for(const channel of this._channels){channel.counters[i]=0;if(channel.cooldowns)channel.cooldowns[i]=0;}
        continue;
      }
      this.held[i]++;
      for(const channel of this._channels){
        if(channel.cooldowns?.[i]){channel.cooldowns[i]--;continue;}
        channel.counters[i]++;
        if(channel.counters[i]>channel.delay){
          channel.mask|=bit;
          if(channel.interval>channel.counters[i]){channel.cooldowns[i]=channel.interval-channel.counters[i];channel.counters[i]=0;}
          else channel.counters[i]-=channel.interval;
        }
      }
    }
    this.pressed=(this.current^this.previous)&this.current;
    this.released=(this.current^this.previous)&~this.current;return this;
  }
  down(mask){return !!(this.current&mask);}
  justPressed(mask){return !!(this.pressed&mask);}
  justReleased(mask){return !!(this.released&mask);}
  repeatMask(channel=this.defaultChannel,includePressed=false){return this._channel(channel).mask|(includePressed?this.pressed:0);}
  repeat(mask,channel=this.defaultChannel,includePressed=true){return !!(this.repeatMask(channel,includePressed)&mask);}
  reset(){
    this.current=this.previous=this.pressed=this.released=0;this.held.fill(0);
    for(const channel of this._channels){channel.mask=0;channel.counters.fill(0);channel.cooldowns?.fill(0);}return this;
  }
}
