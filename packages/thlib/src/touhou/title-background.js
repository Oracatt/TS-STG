// title_system/background{,_math}.cpp and sprite_renderer/render_mesh.cpp.
import {f32,PI,add,sub,mul,div,sin,cos,wrapAngle,trunc32,TouhouRNG} from './math.js';
import {TouhouRenderMesh} from './distortion.js';
export function titleShade(component,weight,direction){return Math.max(0,Math.min(255,trunc32(sub(f32(component),mul(div(mul(f32(component),direction),1),weight)))))&255;}
export class TouhouTitleBackground {
  constructor({textureId=null,width=960,height=720,displayOffsetX=0,displayOffsetY=0,rng=new TouhouRNG(1)}={}){
    Object.assign(this,{textureId,width,height,displayOffsetX,displayOffsetY,rng});this.wave=-3000;this.color=[208,208,208,255];
    this.mesh=new TouhouRenderMesh(64,48,{viewOffsetX:0,viewOffsetY:0,screenWidth:width,screenHeight:height});this.initialize();
  }
  prepareGrid(){
    const m=this.mesh,key=[this.width,this.height,this.displayOffsetX,this.displayOffsetY,m.screenWidth,m.screenHeight,m.columns,m.rows].join(',');
    if(this.baseKey!==key){
      this.baseKey=key;this.baseGrid=new Float32Array(m.vertices.length*6);
      const sx=div(f32(this.width),f32(m.columns-1)),sy=div(f32(this.height),f32(m.rows-1));let x=0,index=0;
      for(let col=0;col<m.columns;col++){let y=0;for(let row=0;row<m.rows;row++,index++){
        const base=index*6;this.baseGrid[base]=x;this.baseGrid[base+1]=y;
        this.baseGrid[base+2]=add(x,f32(this.displayOffsetX));this.baseGrid[base+3]=add(y,f32(this.displayOffsetY));
        this.baseGrid[base+4]=Math.max(0,div(x,f32(m.screenWidth)));this.baseGrid[base+5]=Math.max(0,div(y,f32(m.screenHeight)));y=add(y,sy);
      }x=add(x,sx);}
    }
    return this.baseGrid;
  }
  initialize(copyStrips=true){
    const m=this.mesh,base=this.prepareGrid();for(let index=0;index<m.vertices.length;index++){
      const i=index*6,p=m.positions[index],v=m.vertices[index];p.x=base[i];p.y=base[i+1];p.z=0;
      v.x=base[i+2];v.y=base[i+3];v.z=0;v.rhw=1;v.color=0xffffffff;v.u=base[i+4];v.v=base[i+5];
    }
    if(copyStrips)m.updateStrips();return this;
  }
  update(){
    const base=this.prepareGrid(),m=this.mesh,F=f32,pi2=mul(PI,2),wave=this.wave;let index=0;
    const red=F(this.color[2]),green=F(this.color[1]),blue=F(this.color[0]),alpha=(this.color[3]&255)<<24;
    const flatColor=(titleShade(blue,0,0)|(titleShade(green,0,0)<<8)|(titleShade(red,0,0)<<16)|alpha)>>>0;
    for(let col=0;col<m.columns;col++)for(let row=0;row<m.rows;row++,index++){
      const offset=index*6,p=m.positions[index],v=m.vertices[index];p.x=base[offset];p.y=base[offset+1];p.z=0;
      const vx=base[offset+2],vy=base[offset+3];v.x=vx;v.y=vy;v.z=0;v.rhw=1;v.u=base[offset+4];v.v=base[offset+5];
      const delta=F(wave-F(vx-vy)),distance=Math.abs(delta);
      // With zero weight the original expression contributes exactly zero to
      // all interior coordinates and shade channels; no trig result is retained.
      if(distance>1000){v.color=flatColor;continue;}
      const weight=F(F(1000-distance)/1000),angle=wrapAngle(F(F(pi2*F(delta/40))/60)),x=-F(Math.sin(angle)),y=-F(Math.cos(angle));
      if(col&&row&&col!==m.columns-1&&row!==m.rows-1){v.x=F(vx+F(F(x*30)*weight));v.y=F(vy+F(F(y*30)*weight));}
      const direction=F(-x+y),r=Math.max(0,Math.min(255,trunc32(F(red-F(F(red*direction)*weight)))))&255;
      const g=green===red?r:Math.max(0,Math.min(255,trunc32(F(green-F(F(green*direction)*weight)))))&255;
      const b=blue===red?r:blue===green?g:Math.max(0,Math.min(255,trunc32(F(blue-F(F(blue*direction)*weight)))))&255;
      v.color=(b|(g<<8)|(r<<16)|alpha)>>>0;
    }
    this.wave=add(this.wave,8);if(this.wave>3000)this.wave=sub(this.wave,add(f32(this.rng.next()%1000),4000));
    // The title draws shared grid vertices. Materialize identical strip copies
    // only when an observer requests them; STD retains eager old-strip timing.
    m.invalidateStrips();return this;
  }
  draw(draw,textureId=this.textureId){
    if(typeof textureId!=='number')throw new Error('Title background needs the captured pre-layer-27 render target');
    draw.sampler(textureId,'bilinear','wrap','wrap');draw.blendFactors('one','zero','add');this.mesh.draw(draw,textureId,{strips:false});draw.blendEnd();return draw;
  }
}
