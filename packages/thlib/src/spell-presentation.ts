import type { Game } from './game.js';
import type { DrawList } from './render.js';
export type PresentationVector3={x:number;y:number;z?:number};

// SPDX-License-Identifier: MIT
// Portable presentation primitives. Game-specific timing, colors and artwork
// are supplied by the caller; no game classes, host globals or file paths.
const F=Math.fround;
const add=(a: number,b: number)=>F(F(a)+F(b)),sub=(a: number,b: number)=>F(F(a)-F(b)),mul=(a: number,b: number)=>F(F(a)*F(b)),div=(a: number,b: number)=>F(F(a)/F(b));
// DirectXMath-compatible binary32 minimax coefficients and operation order.
// Copyright (c) Microsoft Corporation. MIT; retained in this package LICENSE.
// Vector angle reduction rounds ties to even, then maps to [-pi/2, pi/2].
function presentationSinCos(angle: number){
  const quotient=mul(angle,F(1/(Math.PI*2))),floor=Math.floor(quotient),fraction=quotient-floor;
  const rounded=fraction<.5?floor:fraction>.5?floor+1:floor%2===0?floor:floor+1;
  let x=sub(angle,mul(F(Math.PI*2),rounded)),sign=1;
  if(Math.abs(x)>F(Math.PI/2)){x=sub(x<0?-F(Math.PI):F(Math.PI),x);sign=-1;}
  const x2=mul(x,x);
  const sine=mul(add(mul(add(mul(add(mul(add(mul(add(mul(-2.3889859e-8,x2),2.7525562e-6),x2),-.00019840874),x2),.0083333310),x2),-.16666667),x2),1),x);
  const cosine=mul(add(mul(add(mul(add(mul(add(mul(add(mul(-2.6051615e-7,x2),2.4760495e-5),x2),-.0013888378),x2),.041666638),x2),-.5),x2),1),sign);
  return[sine,cosine];
}
export const identityPresentationMatrix=(): number[]=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function multiplyPresentationMatrix(a: number[],b: number[]): number[] {
  const out=Array(16);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)out[r*4+c]=add(add(mul(a[r*4],b[c]),mul(a[r*4+2],b[8+c])),add(mul(a[r*4+1],b[4+c]),mul(a[r*4+3],b[12+c])));
  return out;
}
/** Left-handed pitch/yaw/roll quaternion, radians. */
export function presentationQuaternion(pitch: number=0,yaw: number=0,roll: number=0): number[] {
  const [sp,cp]=presentationSinCos(mul(pitch,.5)),[sy,cy]=presentationSinCos(mul(yaw,.5)),[sr,cr]=presentationSinCos(mul(roll,.5));
  return [add(mul(mul(sp,cy),cr),mul(mul(cp,sy),sr)),F(mul(mul(cp,sy),cr)-mul(mul(sp,cy),sr)),F(mul(mul(cp,cy),sr)-mul(mul(sp,sy),cr)),add(mul(mul(cp,cy),cr),mul(mul(sp,sy),sr))];
}
/** Composition matches row-vector transforms: apply a, then b. */
export function multiplyPresentationQuaternion(a: number[],b: number[]): number[] {
  const [x,y,z,w]=b,[X,Y,Z,W]=a;
  return [add(add(mul(w,X),mul(x,W)),sub(mul(y,Z),mul(z,Y))),add(sub(mul(w,Y),mul(x,Z)),add(mul(y,W),mul(z,X))),add(add(mul(w,Z),mul(x,Y)),sub(mul(z,W),mul(y,X))),add(sub(mul(w,W),mul(x,X)),F(-add(mul(y,Y),mul(z,Z))))];
}
export function presentationWorldMatrix(position: PresentationVector3={x:0,y:0,z:0},scale: PresentationVector3={x:1,y:1,z:1},rotation: number[]=[0,0,0,1]): number[] {
  const [x,y,z,w]=rotation,x2=add(x,x),y2=add(y,y),z2=add(z,z),xx=mul(x,x2),yy=mul(y,y2),zz=mul(z,z2),xy=mul(x,y2),xz=mul(x,z2),yz=mul(y,z2),wx=mul(w,x2),wy=mul(w,y2),wz=mul(w,z2),sx=scale.x??1,sy=scale.y??1,sz=scale.z??1;
  return [mul(sx,sub(sub(1,yy),zz)),mul(sx,add(xy,wz)),mul(sx,sub(xz,wy)),0,
    mul(sy,sub(xy,wz)),mul(sy,sub(sub(1,xx),zz)),mul(sy,add(yz,wx)),0,
    mul(sz,add(xz,wy)),mul(sz,sub(yz,wx)),mul(sz,sub(sub(1,xx),yy)),0,F(position.x??0),F(position.y??0),F(position.z??0),1];
}
/** Origin camera looking along positive Z. Keeps clip W for GPU texture sampling. */
export class PerspectiveCamera {
  declare width: number; declare height: number; declare fieldOfView: number; declare near: number; declare far: number; declare inverseProjection: number[];

  declare projection:number[];
  declare clip:number[];

  constructor({width=640,height=480,fieldOfView=Math.PI/4,near=.1,far=1000,viewport={x:0,y:0,width,height},canvasWidth=viewport.width,canvasHeight=viewport.height}: {width?:number;height?:number;fieldOfView?:number;near?:number;far?:number;viewport?:{x:number;y:number;width:number;height:number};canvasWidth?:number;canvasHeight?:number}={}) {
    if(!(width>0&&height>0&&near>0&&far>near&&fieldOfView>0&&fieldOfView<Math.PI))throw new RangeError('Invalid perspective camera');
    this.width=width;this.height=height;this.fieldOfView=F(fieldOfView);this.near=F(near);this.far=F(far);
    const [sine,cosine]=presentationSinCos(mul(this.fieldOfView,.5)),ys=div(cosine,sine),zs=div(this.far,sub(this.far,this.near));
    this.projection=[F(ys/F(width/height)),0,0,0,0,ys,0,0,0,0,zs,1,0,0,F(-this.near*zs),0];
    // Cofactors of this origin-camera projection in the same binary32 order
    // as XMMatrixInverse. An algebraic z shortcut loses several dozen ULPs
    // near the far plane because it bypasses the rounded determinant.
    const a=this.projection[0],b=this.projection[5],c=this.projection[10],d=this.projection[14],ab=mul(a,b),negativeBD=F(-mul(b,d)),reciprocal=div(1,mul(negativeBD,a));
    this.inverseProjection=[mul(negativeBD,reciprocal),0,0,0,0,mul(F(-mul(a,d)),reciprocal),0,0,0,0,0,mul(F(-ab),reciprocal),0,0,mul(F(-mul(d,ab)),reciprocal),mul(mul(c,ab),reciprocal)];
    const convert=identityPresentationMatrix();convert[0]=F(viewport.width/canvasWidth);convert[5]=F(viewport.height/canvasHeight);convert[10]=2;
    convert[12]=F((viewport.x*2+viewport.width)/canvasWidth-1);convert[13]=F(1-(viewport.y*2+viewport.height)/canvasHeight);convert[14]=-1;
    this.clip=multiplyPresentationMatrix(this.projection,convert);
  }
  /** Inverse projection of centered Y-up screen coordinates at D3D depth 0..1. */
  screenToWorld(x: number,y: number,depth: number): PresentationVector3 {
    const inverse=this.inverseProjection,w=add(mul(depth,inverse[11]),inverse[15]);
    return {x:div(mul(div(mul(x,2),this.width),inverse[0]),w),y:div(mul(div(mul(y,2),this.height),inverse[5]),w),z:div(inverse[14],w)};
  }
  worldToScreen({x,y,z}: PresentationVector3): {x:number;y:number} {return{x:mul(div(mul(x,this.projection[0]),z!),mul(this.width,.5)),y:mul(div(mul(y,this.projection[5]),z!),mul(this.height,.5))};}
  matrix(position?: PresentationVector3,scale?: PresentationVector3,rotation?: number[]): number[] {return multiplyPresentationMatrix(presentationWorldMatrix(position,scale,rotation),this.clip);}
}
/** Four-corner 3D sprite with perspective-correct UV interpolation. */
export class PerspectiveSprite {
  declare camera: PerspectiveCamera;

  declare vertices:number[][];
  declare indices:number[];

  constructor(camera: PerspectiveCamera,{uv=[0,0,1,1],anchorX=.5,anchorY=.5}: {uv?:number[];anchorX?:number;anchorY?:number}={}) {
    this.camera=camera;const [u,v,du,dv]=uv,x=-anchorX,y=anchorY;
    this.vertices=[[x,y,0,u,v,0xffffffff],[x+1,y,0,u+du,v,0xffffffff],[x,y-1,0,u,v+dv,0xffffffff],[x+1,y-1,0,u+du,v+dv,0xffffffff]];
    this.indices=[0,1,2,1,3,2];
  }
  draw(draw: DrawList,texture: number,{position,scale,rotation,color=0xffffffff}: {position:PresentationVector3;scale:PresentationVector3;rotation?:number[];color?:number}): DrawList {
    for(const v of this.vertices)v[5]=color>>>0;
    return draw.mesh3d(texture,this.vertices as [number,number,number,number,number,number][],this.indices,this.camera.matrix(position,scale,rotation));
  }
}
/** Textured annulus. Topology, UVs and unit circle are cached for its lifetime. */
export class TexturedRing {
  declare units: [number, number][];

  declare vertices:number[][];
  declare indices:number[];

  constructor({segments=512,rounds=1,uv=[0,0,1,1],closedSeam=false}: {segments?:number;rounds?:number;uv?:number[];closedSeam?:boolean}={}) {
    if(!Number.isInteger(segments)||segments<3||segments>16384)throw new RangeError('Invalid ring segments');
    const [u,v,du,dv]=uv;this.units=[];this.vertices=[];this.indices=[];
    for(let i=0;i<=segments;i++){const a=i*Math.PI*2/segments;this.units.push([F(Math.cos(a)),F(Math.sin(a))]);this.vertices.push([0,0,u+du,v+i*rounds/segments*dv,0xffffffff],[0,0,u,v+i*rounds/segments*dv,0xffffffff]);if(i<segments){const n=i*2;this.indices.push(n,n+2,n+1,n+2,n+3,n+1);}}
    if(closedSeam){const n=segments*2;this.indices.push(n,0,n+1,0,1,n+1);}
  }
  draw(draw: DrawList,texture: number,{x=0,y=0,inner=0,outer=0,rotation=0,rotationMatrix=null,scale=1,color=0xffffffff,screenX=x=>x,screenY=y=>y}: {x?:number;y?:number;inner?:number;outer?:number;rotation?:number;rotationMatrix?:number[] | null;scale?:number;color?:number;screenX?:(x:number)=>number;screenY?:(y:number)=>number}={}): DrawList {
    const c=Math.cos(rotation),s=Math.sin(rotation),m=rotationMatrix??[c,s,-s,c];
    for(let i=0;i<this.units.length;i++){const u=this.units[i];
      for(let n=0;n<2;n++){const radius=n?inner:outer,dx=F(F(u[0]*radius)*scale),dy=F(F(u[1]*radius)*scale),v=this.vertices[i*2+n];v[0]=screenX(F(x+F(F(dx*m[0])+F(dy*m[2]))));v[1]=screenY(F(y+F(F(dx*m[1])+F(dy*m[3]))));v[4]=color>>>0;}}
    return draw.mesh(texture,this.vertices as [number,number,number,number,number][],this.indices);
  }
}
