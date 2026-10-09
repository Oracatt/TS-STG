// Numeric pickup presentation: small_score/{state,frame}.cpp (510710,
// 50ff70,510110). This owner never awards score or consumes either RNG.
import {f32,add,sub,mul,div,trunc32,TouhouTimer} from './math.js';
import {argbToRgba} from './distortion.js';
import {TOUHOU_OWNER_PRIORITIES} from './render-order.js';

const viewDefault={x:336,y:24,scale:1.5,screenScale:1};
export class TouhouFloatingScores {
  constructor({font=null,player=null,capacity=10,lifetime=60,initialSpeed=1,drag=.95,scale=1,drawPriority=TOUHOU_OWNER_PRIORITIES.floatingScore}={}){
    if(!Number.isSafeInteger(capacity)||capacity<0)throw new RangeError('Floating-score capacity must be a nonnegative integer');
    if(!Number.isSafeInteger(lifetime)||lifetime<1)throw new RangeError('Floating-score lifetime must be a positive integer');
    if(!Number.isFinite(f32(initialSpeed))||initialSpeed<0||!Number.isFinite(drag)||drag<0||drag>1||!Number.isFinite(f32(scale))||f32(scale)<=0||!Number.isFinite(drawPriority))
      throw new RangeError('Floating-score motion, scale and draw priority must be finite and within their valid ranges');
    Object.assign(this,{font,player,capacity,lifetime,drawPriority});
    this.initialSpeed=f32(initialSpeed);this.drag=f32(drag);this.scale=f32(scale);
    this.entries=Array.from({length:capacity},()=>({active:false}));this.nextSlot=0;
  }
  spawn({x,y,amount,color=0xffffffff}={}){
    if(!Number.isFinite(f32(x))||!Number.isFinite(f32(y))||!Number.isInteger(amount)||amount<-2147483648||amount>2147483647)
      throw new RangeError('Floating scores require finite coordinates and a signed 32-bit integer amount');
    if(!this.capacity)return null;
    // Source stores digits least significant first; all negative values select
    // the existing POWER UP glyph rather than a minus sign.
    const digits=[];let value=amount;
    if(value<0)digits.push(10);
    else{do{digits.push(value%10);value=Math.trunc(value/10);}while(value);}
    const entry={active:true,x:f32(x),y:f32(y),amount,color:color>>>0,digits,
      speed:this.initialSpeed,timer:new TouhouTimer()};
    this.entries[this.nextSlot]=entry;this.nextSlot=(this.nextSlot+1)%this.capacity;return entry;
  }
  update({clockScale=1,timerRate=1}={}){
    for(const entry of this.entries)if(entry.active){
      entry.y=sub(entry.y,mul(clockScale,entry.speed));entry.speed=mul(entry.speed,this.drag);
      entry.timer.tick(timerRate);if(entry.timer.current>this.lifetime)entry.active=false;
    }
    return this;
  }
  /** Original world coordinates; atlas glyph dimensions are already pixels in
   * ascii_960 and do not receive the playfield coordinate scale a second time. */
  draw(draw,view=viewDefault){
    if(!this.font)return draw;
    if(draw.enqueuePriority){const capturedView={...view};draw.enqueuePriority(this.drawPriority,target=>this.draw(target,capturedView));return draw;}
    const S=f32(view.scale??1.5),ox=f32(view.x??336),oy=f32(view.y??24),font=this.font;
    let begun=false;
    for(const entry of this.entries){
      if(!entry.active)continue;
      const age=entry.timer.current;
      // The recovered 8 / age.value expression is singular at spawn time.
      // It yields no finite quad in the original; never send Infinity to a host.
      if(age<8&&entry.timer.value<=0)continue;
      const spacing=age<8?div(8,entry.timer.value):8;
      let x=sub(entry.x,div(mul(entry.digits.length,spacing),2));
      const dx=sub(this.player?.x??Infinity,entry.x),dy=sub(this.player?.y??Infinity,entry.y);
      const distance=this.player?trunc32(add(mul(dx,dx),mul(dy,dy))):16385;
      const alpha=distance>16384?255:distance>4096?Math.trunc((distance-4096)*128/12288+128):128;
      const color=argbToRgba(((alpha<<24)|(entry.color&0xffffff))>>>0);
      for(let remaining=entry.digits.length;remaining>0;remaining--){
        const digit=entry.digits[remaining-1];let index=-1;
        if(age<this.lifetime-8-remaining*2||digit===10)index=digit+289;
        else if(age<this.lifetime-4-remaining*2)index=digit+300;
        else if(age<this.lifetime-remaining*2)index=digit+310;
        if(index>=0){
          const sprite=font.data.sprites[index];if(!sprite||sprite.excluded)throw new RangeError('Missing original floating-score glyph '+index);
          const texture=font.texture(font.data.entries[sprite.entry]);
          if(!begun){draw.alphaTest(1/255).blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');begun=true;}
          draw.sampler(texture,'bilinear','wrap','wrap');
          draw.spriteRegion(texture,sprite.x,sprite.y,sprite.width,sprite.height,
            add(ox,mul(x,S)),add(oy,mul(entry.y,S)),mul(sprite.width,this.scale),mul(10,this.scale),0,color);
        }
        x=add(x,spacing);
      }
    }
    if(begun)draw.blendEnd().alphaTest(0);return draw;
  }
  clear(){for(const entry of this.entries)entry.active=false;this.nextSlot=0;return this;}
  destroy(){this.clear();}
  snapshot(){return{nextSlot:this.nextSlot,entries:this.entries.map(entry=>entry.active?{
    active:true,x:entry.x,y:entry.y,amount:entry.amount,color:entry.color,digits:entry.digits.slice(),
    speed:entry.speed,age:entry.timer.current,time:entry.timer.value}: {active:false})};}
}
