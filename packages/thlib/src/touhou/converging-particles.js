// effect_system/converging_particles.cpp, original effect descriptor 1.
// The callback owns 200 separate effect149/150 ANMs, not a replacement sprite.
import {f32,add,sub,mul,div,PI,polar,TouhouTimer} from './math.js';
const plus=(a,b)=>({x:add(a.x,b.x),y:add(a.y,b.y),z:add(a.z,b.z)});
const minus=(a,b)=>({x:sub(a.x,b.x),y:sub(a.y,b.y),z:sub(a.z,b.z)});
const vector=(angle,length)=>({...polar(angle,length),z:0});
const unit=v=>{
  const length=f32(Math.sqrt(add(add(mul(v.x,v.x),mul(v.y,v.y)),mul(v.z,v.z))));
  return !(f32(.01)>Math.abs(length))?{x:div(v.x,length),y:div(v.y,length),z:div(v.z,length)}:v;
};
const lengthen=(v,length)=>{v=unit(v);return{x:mul(v.x,length),y:mul(v.y,length),z:mul(v.z,length)};};
const values=v=>[v.x,v.y,v.z];
const randomUnit=random=>div(f32(random.next()),sub(f32(random.modulus??0x7fffffff),1));
function curve(vm,duration,start,tangentStart,end,tangentEnd){
  vm.interpolate('position',0x2c,3,values(end),duration,8,{tangents:[values(tangentStart),values(tangentEnd)]});
  const interpolation=vm.interpolations.get('position').value;
  interpolation.start=values(start);interpolation.current=values(start);
}

export class TouhouConvergingParticles {
  constructor(animation){this.animation=animation;this.age=new TouhouTimer(0);this.particles=[];this.spawned=0;this.random=animation.bank.rng;}
  randomOffset(radius){const length=mul(randomUnit(this.random),radius),angle=mul(this.random.signed(),PI);return vector(angle,length);}
  update(){
    const parent=this.animation,bank=parent.bank,center={x:parent.x,y:parent.y,z:parent.z};
    this.center=center;this.farCenter=plus(center,vector(parent.rotation,300));
    this.nearCenter=plus(center,vector(add(parent.rotation,parent.F(0x46c)),150));
    if(this.age.current!==this.age.previous&&this.age.current<50){
      const group=[];
      // All four named spawns (including their ANM RNG reads) happen before
      // setting color or consuming the callback's position/tangent RNG.
      for(let index=0;index<4;index++){
        const vm=bank.create(index<3?149:150,{detached:true});vm.effectTrackedAge=1;
        group.push({vm,stage:0,target:null,tangent:null});this.spawned++;
      }
      let color=parent.U(0x490);
      for(let index=0;index<4;index++){
        if(index===3)for(let byte=0;byte<3;byte++){const shift=byte*8;const channel=(300-((color>>>shift)&255))&255;color=((color&~(255<<shift))|(channel<<shift))>>>0;}
        group[index].vm.U(0x490,color);group[index].vm.U(0x444,parent.U(0x444));
      }
      this.particles.push(...group);
    }
    let active=0;
    for(const particle of this.particles){const child=particle.vm;if(!child.alive)continue;
      child.F(0x560,parent.F(0x560));
      const duration=parent.U(0x444)|0;
      if(particle.stage===0){
        const start=plus(this.farCenter,this.randomOffset(150)),end=plus(this.nearCenter,this.randomOffset(50));
        let tangentEnd=plus(unit(minus(end,start)),unit(minus(center,end)));
        tangentEnd=lengthen(tangentEnd,add(mul(randomUnit(this.random),200),200));
        const tangentStart=lengthen(minus(end,start),add(mul(randomUnit(this.random),100),100));
        curve(child,duration,start,tangentStart,end,tangentEnd);particle.target=end;particle.tangent=tangentEnd;particle.stage=1;
      }else if(child.effectTrackedAge>=((parent.U(0x444)+1)|0)&&particle.stage===1){
        const end=plus(center,this.randomOffset(20)),tangentEnd=this.randomOffset(20);
        curve(child,duration,particle.target,particle.tangent,end,tangentEnd);particle.stage=2;
      }
      active++;
    }
    if(!active)return -1;
    this.age.tick();return 0;
  }
  interrupt(value){if(value===1)this.age.add(300);}
  retire(){for(const particle of this.particles)if(particle.vm.alive)particle.vm.destroy();}
  snapshot(){return{age:this.age.current,spawned:this.spawned,active:this.particles.filter(p=>p.vm.alive).length,stages:this.particles.map(p=>p.stage)};}
}

export function createTouhouAttachedEffect(animation,type){
  if(type!==1)throw new RangeError(`Unsupported Touhou attached effect descriptor ${type}`);
  if(!animation.bank.scripts[149]||!animation.bank.scripts[150])throw new Error('Converging particles require original effect149/150 animations');
  return new TouhouConvergingParticles(animation);
}
