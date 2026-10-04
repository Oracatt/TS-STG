// SPDX-License-Identifier: GPL-3.0-only
// LifeBar.h's bitmap blood border, partial 512-segment bar and time target.
import {withAlpha} from '@ts-stg/thlib';
import {screenX,screenY,SOURCE_SCALE as S} from './assets.js';
const F=Math.fround;
const normal=draw=>draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
export class RushBossHud {
  constructor(host,assets) {
    this.host=host;this.assets=assets;this.timeTarget=host.createRenderTarget(160,120);
    this.border=this.ring(60,65,.25);this.bar=this.ring(61,64,0);this.indexPrefixes=new Map();
  }
  ring(inner,outer,u) {
    const vertices=[],positions=[],indices=[];
    for(let i=0;i<=512;i++){
      const a=i*Math.PI/256,c=F(Math.cos(a)),s=F(Math.sin(a));
      // The original world matrix rotates this local ring by pi/2.
      positions.push([-F(s*outer),F(c*outer)],[-F(s*inner),F(c*inner)]);
      vertices.push([0,0,u+.25,i/512,0xffffffff],[0,0,u,i/512,0xffffffff]);
      if(i<512){const n=i*2;indices.push(n,n+2,n+1,n+2,n+3,n+1);}
    }
    indices.push(1024,0,1025,0,1,1025);return{vertices,positions,indices};
  }
  place(ring,boss,color) {for(let i=0;i<ring.vertices.length;i++){const p=ring.positions[i],v=ring.vertices[i];v[0]=screenX(boss.x+p[0]);v[1]=screenY(boss.y+p[1]);v[4]=color;}}
  draw(draw,battle) {
    const state=battle.presentation.hud;if(!state||battle.transition||battle.finished)return;
    draw.sampler(this.assets.texture('src_lifebar'),'anisotropic4x','wrap','wrap');
    draw.sampler(this.assets.texture('src_ascii'),'anisotropic4x','wrap','wrap');
    const b=battle.boss,cfg=battle.phase.lifeBar??{min:0,max:1},color=withAlpha(0xffffffff,state.bloodAlpha);
    normal(draw);
    if(!battle.phase.survival&&!cfg.nodraw){
      const percent=(cfg.startFull??cfg.full)||battle.phaseFrame>60?cfg.min+(cfg.max-cfg.min)*Math.max(0,b.hp/b.maxHp):battle.phaseFrame/60;
      this.place(this.border,b,color);draw.mesh(this.assets.texture('src_lifebar'),this.border.vertices,this.border.indices);
      this.place(this.bar,b,color);
      const count=Math.max(0,Math.min(3078,Math.trunc(F(1026*F(percent)))*3));
      if(count){if(!this.indexPrefixes.has(count))this.indexPrefixes.set(count,this.bar.indices.slice(0,count));draw.mesh(this.assets.texture('src_lifebar'),this.bar.vertices,this.indexPrefixes.get(count));}
      if(cfg.showTag??cfg.tag)this.assets.region(draw,'src_lifebar',[18,0,10,12],b.x+Math.cos(144/180*Math.PI)*62.5,b.y+Math.sin(144/180*Math.PI)*62.5,5,6,54/180*Math.PI,color);
    }
    draw.blendEnd();
    const t=Math.min(99.99,Math.max(0,state.time)),digit=(n,x,y,size)=>draw.spriteRegion(this.assets.texture('src_ascii'),32*n,288,32,32,80+x/4,60-y/4,size/4,size/4,0,0xffffffff);
    draw.targetBegin(this.timeTarget,0);normal(draw);
    digit(Math.trunc(t/10)%10,-100,0,72*state.timeSize);digit(Math.trunc(t)%10,-45,0,72*state.timeSize);digit(11,10,0,72);
    digit(Math.trunc(t*10)%10,40,-12,48);digit(Math.trunc(t*100)%10,80,-12,48);
    draw.blendEnd();draw.targetEnd();normal(draw);
    draw.sprite(this.timeTarget,screenX(0),screenY(200),160*S,120*S,0,withAlpha(state.red?0xff0000ff:0xffffffff,state.timeAlpha));draw.blendEnd();
  }
  dispose(){this.host.unloadTexture(this.timeTarget);this.indexPrefixes.clear();}
}
