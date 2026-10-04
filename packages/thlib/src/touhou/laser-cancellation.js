// Source: laser_system/type{0,1,2}_cancellation.cpp.
// Source mask sampling/splitting is independent of external movement and rendering.
import {f32,add,sub,mul,div,sqrt,polar,rotate} from './math.js';
const vector=(x=0,y=0,z=0)=>({x:f32(x),y:f32(y),z:f32(z)});
const plus=(a,b)=>vector(add(a.x,b.x),add(a.y,b.y),add(a.z??0,b.z??0));
const scale=(a,s)=>vector(mul(a.x,s),mul(a.y,s),mul(a.z??0,s));
const direction=(angle,length)=>({...polar(angle,length),z:0});
const square=(x,y)=>add(mul(x,x),mul(y,y));
const outside=(p,w,h)=>add(p.x,w)<=-192||sub(p.x,w)>=192||add(p.y,h)<=0||sub(p.y,h)>=448;

function segmentIntersection(p,q,r,t){
  const first=add(mul(sub(p.x,q.x),sub(r.y,p.y)),mul(sub(p.y,q.y),sub(p.x,r.x)));
  const second=add(mul(sub(p.x,q.x),sub(t.y,p.y)),mul(sub(p.y,q.y),sub(p.x,t.x)));
  if(!(0>=mul(first,second)))return false;
  if(first===0&&second===0){if(q.x<p.x)[p,q]=[q,p];if(t.x<r.x)[r,t]=[t,r];return !(t.x<p.x||t.y<p.y||q.x<r.x||q.y<r.y);}
  return 0>=mul(add(mul(sub(r.x,t.x),sub(p.y,r.y)),mul(sub(r.y,t.y),sub(r.x,p.x))),add(mul(sub(r.x,t.x),sub(q.y,r.y)),mul(sub(r.y,t.y),sub(r.x,q.x))));
}
const rectPoint=(c,w,h,a,p)=>{const v=rotate(sub(p.x,c.x),sub(p.y,c.y),-a);return div(w,2)>=Math.abs(v.x)&&div(h,2)>=Math.abs(v.y);};
function rectangleRectangle(c,w,h,a,p,pw,ph,pa){
  const reach=add(sqrt(square(div(w,2),div(h,2))),sqrt(square(div(pw,2),div(ph,2))));if(!(reach>sqrt(square(sub(c.x,p.x),sub(c.y,p.y)))))return false;
  const corners=(c,w,h,a)=>[[-1,-1],[-1,1],[1,1],[1,-1]].map(([x,y])=>plus(c,rotate(div(mul(w,x),2),div(mul(h,y),2),a)));
  const first=corners(c,w,h,a),second=corners(p,pw,ph,pa);
  if(second.some(p=>rectPoint(c,w,h,a,p))||first.some(c=>rectPoint(p,pw,ph,pa,c)))return true;
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(segmentIntersection(first[i],first[(i+1)%4],second[j],second[(j+1)%4]))return true;return false;
}

/** Apply original16-unit straight sampling or curve sample masks, then mutate
 * the retained source owner and emit new source straight/curve parameters.
 * External callers supply only effect/entity creation; they do not choose the
 * trim, split thresholds, speed8 debris, timing, or protected-frame rules. */
export function cancelTouhouLaser(l,center,width,height,angle=0,circle=false,{check=true,clockScale=1,onEffect=null,onCancel=null,onSpawnStraight=null,onSpawnCurve=null}={}){
    if(check&&l.protectedFrames)return 0;const mask=[];let count=0;
    const test=(p,step)=>circle?square(sub(center.x,p.x),sub(center.y,p.y))<=mul(width,width):l.kind===2?rectPoint(center,width,height,angle,p):rectangleRectangle(center,width,height,angle,p,step.x,step.y,l.angle);
    if(l.kind===2){for(let i=0;i<l.p.count;i++){const p=l.samples[i].position;mask.push(test(p)?1:0);if(mask[i]){count++;if(i%20===0)onEffect?.(l,p,circle);}}}
    else{const step=direction(l.angle,16);let p=plus(l.position,direction(l.angle,8));for(let distance=8;(l.kind===0||!circle)?add(8,distance)<=l.length:add(8,distance)<l.length;distance=add(distance,16)){
      mask.push(test(p,step)?1:0);if(mask.at(-1)){count++;if(l.kind===0?(!circle||(count-1)%4===0):(!circle||!outside(p,32,32)))onEffect?.(l,p,circle);}p=plus(p,step);
    }}
    if(count){onCancel?.(count,l);if(l.kind===0){if(count===mask.length)l.killPending=true;else splitStraight(l,mask,onSpawnStraight);}else if(l.kind===1)splitInfinite(l,mask,onSpawnStraight);else{if(count===l.p.count)l.killPending=true;else splitCurve(l,mask,clockScale,onSpawnCurve);}}
    return count;
  }
function splitStraight(l,mask,onSpawnStraight){
    const old={...l.position},step=direction(l.angle,16);let index=0;while(index<mask.length&&mask[index])index++;
    if(index){l.position=plus(l.position,scale(step,f32(index)));l.length=sub(l.length,mul(f32(index),16));if(!(l.length>24)){l.killPending=true;return;}l.p.length=l.length;l.travel=mul(f32(index),16);}
    let length=0;while(index<mask.length&&!mask[index]){index++;length++;}if(index>=mask.length)return;
    l.p.length=sub(l.p.length,sub(l.length,mul(f32(length),16)));l.length=mul(f32(length),16);if(l.length<24)l.killPending=true;
    while(index<mask.length){while(index<mask.length&&mask[index])index++;if(index>=mask.length)break;const start=index;length=0;while(index<mask.length&&!mask[index]){index++;length++;}if(length*16>24){const p=plus(old,scale(step,f32(start)));onSpawnStraight?.({...l.p,x:p.x,y:p.y,z:p.z,length:mul(f32(length),16),initialLength:mul(f32(length),16)});}}
  }
function splitInfinite(l,mask,onSpawnStraight){
    let index=0,length=0;const step=direction(l.angle,16);while(index<mask.length&&mask[index])index++;
    if(!index){while(index<mask.length&&!mask[index]){index++;length++;}if(index>=mask.length)return;l.length=mul(f32(length),16);}else l.length=0;
    while(index<mask.length){while(index<mask.length&&mask[index])index++;if(index>=mask.length)break;const start=index;length=0;while(index<mask.length&&!mask[index]){index++;length++;}const p=plus(l.position,scale(step,f32(start)));onSpawnStraight?.({x:p.x,y:p.y,z:p.z,speed:8,angle:l.angle,width:l.width,type:l.p.type,color:l.p.color,length:mul(f32(length),16),initialLength:mul(f32(length),16),lengthLimit:sub(l.p.lengthLimit,mul(f32(start),16)),flags:(l.p.flags>>1)&1});}
  }
function splitCurve(l,mask,clockScale,onSpawnCurve){
    const originalCount=l.p.count;let index=0;while(index<l.p.count&&mask[index])index++;
    if(index){mask=mask.slice(index);if(l.live)l.samples=l.samples.slice(index);l.time.add(f32(-index),clockScale);l.p.count-=index;if(l.p.count<4){l.killPending=true;return;}index=0;}
    while(index<l.p.count&&!mask[index])index++;const retained=index;
    while(index<l.p.count){while(index<l.p.count&&mask[index])index++;const start=index;if(index>=originalCount)break;let length=0;while(index<l.p.count&&!mask[index]){index++;length++;}if(!l.live&&length>3)onSpawnCurve?.({...l.p,path:l.path,count:length,time:sub(l.time.value,f32(start)),sound:-1});}
    if(retained<4)l.killPending=true;else{l.p.count=retained;l.samples.length=retained;}
  }
/** Explicit erase uses the source effect spacing and state1 retirement. */
export function eraseTouhouLaser(l,{check=true,onEffect=null}={}){if(check&&l.protectedFrames)return 0;let count=0;if(l.kind===2){for(let i=0;i<l.p.count;i++)if(i%3===0)onEffect?.(l,l.samples[i].position,true);}else{const step=direction(l.angle,16);let p=plus(l.position,direction(l.angle,8));for(let d=8;add(8,d)<l.length;d=add(d,16)){count++;if(l.kind===0||!outside(p,16,16))onEffect?.(l,p,true);p=plus(p,step);}}l.state=1;return count;}
