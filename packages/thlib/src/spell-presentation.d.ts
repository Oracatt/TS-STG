import type {DrawList} from './index.js';
export type PresentationVector3={x:number;y:number;z?:number};
export function identityPresentationMatrix():number[];
export function multiplyPresentationMatrix(a:number[],b:number[]):number[];
export function presentationQuaternion(pitch?:number,yaw?:number,roll?:number):number[];
export function multiplyPresentationQuaternion(a:number[],b:number[]):number[];
export function presentationWorldMatrix(position?:PresentationVector3,scale?:PresentationVector3,rotation?:number[]):number[];
export class PerspectiveCamera {
  constructor(options?:{width?:number;height?:number;fieldOfView?:number;near?:number;far?:number;viewport?:{x:number;y:number;width:number;height:number};canvasWidth?:number;canvasHeight?:number});
  projection:number[];clip:number[];
  screenToWorld(x:number,y:number,depth:number):PresentationVector3;
  worldToScreen(position:PresentationVector3):{x:number;y:number};
  matrix(position?:PresentationVector3,scale?:PresentationVector3,rotation?:number[]):number[];
}
export class PerspectiveSprite {
  constructor(camera:PerspectiveCamera,options?:{uv?:number[];anchorX?:number;anchorY?:number});
  vertices:number[][];indices:number[];
  draw(draw:DrawList,texture:number,options:{position:PresentationVector3;scale:PresentationVector3;rotation?:number[];color?:number}):DrawList;
}
export class TexturedRing {
  constructor(options?:{segments?:number;rounds?:number;uv?:number[];closedSeam?:boolean});
  vertices:number[][];indices:number[];
  draw(draw:DrawList,texture:number,options?:{x?:number;y?:number;inner?:number;outer?:number;rotation?:number;rotationMatrix?:number[];scale?:number;color?:number;screenX?:(x:number)=>number;screenY?:(y:number)=>number}):DrawList;
}
