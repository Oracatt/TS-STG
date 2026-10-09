import type {AnmInstance,AnmView} from './anm.js';
export interface TouhouProjectionViewport {x:number;y:number;width:number;height:number}
export interface TouhouProjectionCamera {view:number[];projection:number[];viewport:TouhouProjectionViewport;outputViewport?:TouhouProjectionViewport;screenScale?:number;screenOffsets?:ReadonlyArray<{x:number;y:number}>;billboardAxis?:{x:number;y:number;z:number}}
// Original projected_draw.cpp p441f00 (render type 8), binding.cpp,
// vertex_buffer.cpp, platform_window/viewports.cpp. All matrices are row-major
// D3D row-vector matrices until final conversion to OpenGL clip coordinates.
import {f32,PI,add,sub,mul,div,sin,cos,wrapAngle,rotate} from './math.js';
import {UnsupportedAnmError} from './anm-vm.js';
export const identityMatrix=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function multiplyMatrix(a: number[],b: number[]): number[]{const out=Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)out[r*4+c]=add(add(mul(a[r*4],b[c]),mul(a[r*4+1],b[4+c])),add(mul(a[r*4+2],b[8+c]),mul(a[r*4+3],b[12+c])));return out;}
export function rotationMatrix(axis: number,angle: number): number[]{const m=identityMatrix(),s=sin(angle),c=cos(angle);if(axis===0){m[5]=m[10]=c;m[6]=s;m[9]=-s;}else if(axis===1){m[0]=m[10]=c;m[2]=-s;m[8]=s;}else{m[0]=m[5]=c;m[1]=s;m[4]=-s;}return m;}
/** Source standard camera at zero camera animation; supplied viewport is pixel units. */
export function createTouhouCamera(viewport: TouhouProjectionViewport,{fieldOfView=div(PI,6),near=1,far=10000}: {fieldOfView?:number;near?:number;far?:number}={}): TouhouProjectionCamera{
 // D3DX's reciprocal-square-root refinement leaves these one-ULP residuals.
 // Numeric table is independently measured from OS D3DX9_43, for all original
 // 640/960/1280 window modes and their 448/672/896 playfields. It contains no
 // executable code. Other camera configurations must supply explicit matrices.
 if(fieldOfView!==div(PI,6)||![448,480,672,720,896,960].includes(viewport.height))throw new RangeError('Unverified TOUHOU camera configuration: supply explicit view/projection matrices');
 const cx=add(f32(viewport.x),div(f32(viewport.width),2)),cy=add(f32(viewport.y),div(f32(viewport.height),2));
 const tangent=f32(Math.tan(div(fieldOfView,2))),eyeZ=div(f32(viewport.height>>>1),tangent);
 const view=identityMatrix();view[0]=f32(1-2**-24);view[5]=viewport.height===720?-1:-view[0];view[10]=viewport.height===720?f32(-1-2**-23):-1;view[12]=-mul(cx,view[0]);view[13]=-mul(cy,view[5]);view[14]=-mul(eyeZ,view[10]);
 const projection=Array(16).fill(0),ys=div(cos(div(fieldOfView,2)),sin(div(fieldOfView,2)));projection[0]=div(ys,div(f32(viewport.width),f32(viewport.height)));projection[5]=ys;projection[10]=div(far,sub(far,near));projection[11]=1;projection[14]=-mul(near,projection[10]);
 return{view,projection,viewport:{...viewport}};
}
function inheritedRotation(vm: AnmInstance){const angles=[vm.F(0x38),vm.F(0x3c),vm.F(0x40)],parent=vm.transformParent;if(parent&&!(vm.U(0x49c)&0x1000)){const inherited=inheritedRotation(parent);for(let i=0;i<3;i++){angles[i]=add(angles[i],inherited[i]);vm.F(0x38+i*4,wrapAngle(vm.F(0x38+i*4)));}}return angles;}
function transformedPosition(vm: AnmInstance,position: {x:number;y:number;z:number},view: Required<Pick<AnmView, 'screenScale' | 'screenOffsets'>>){
 let {x,y,z}=position;const mode=vm.B(0x4a4);if(mode>=1&&mode<=4){const factor=mode===2||mode===4?mul(view.screenScale,.5):view.screenScale;x=mul(x,factor);y=mul(y,factor);z=mul(z,factor);}
 const parent=vm.transformParent;if(parent&&!(vm.U(0x49c)&0x1000)){if(vm.U(0x49c)&0x20){const p=rotate(x,y,parent.rotation);x=p.x;y=p.y;}if(vm.U(0x49c)&0x400000){x=mul(x,parent.scaleX);y=mul(y,parent.scaleY);}const p=parent.worldPosition(view);x=add(x,p.x);y=add(y,p.y);z=add(z,p.z);}
 else{const preset=(vm.U(0x4a0)>>>24)&3;if(preset){const p=view.screenOffsets[preset===1?0:1];x=add(x,p.x);y=add(y,p.y);}}return{x,y,z};
}
export function projectedAnmWorld(vm: AnmInstance,screenScale: number,screenOffsets: ReadonlyArray<{x:number;y:number}>): number[]{
 if(vm.U(0x49c)&0x4000000)throw new UnsupportedAnmError(vm,'external cached world matrix');
 const sprite=vm.bank.data.sprites[vm.spriteIndex];if(!sprite)throw new UnsupportedAnmError(vm,'projected sprite fallback');
 let world=identityMatrix();world[0]=mul(mul(vm.scaleX,vm.scale2X),div(sprite.width,256));world[5]=mul(mul(vm.scaleY,vm.scale2Y),div(sprite.height,256));
 const mode=vm.B(0x4a4);if(mode===1||mode===5){world[0]=mul(world[0],screenScale);world[5]=mul(world[5],screenScale);}else if(mode===2||mode===6){world[0]=mul(mul(screenScale,.5),world[0]);world[5]=mul(mul(screenScale,.5),world[5]);}
 const angles=inheritedRotation(vm),orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],order=orders[(vm.U(0x4a0)>>>18)&7];
 if(order)for(const axis of order)if(angles[axis]!==0)world=multiplyMatrix(world,rotationMatrix(axis,angles[axis]));
 const pos=transformedPosition(vm,{x:sub(add(add(vm.F(0x2c),vm.x),vm.F(0x484)),mul(mul(vm.F(0x80),vm.scaleX),vm.scale2X)),y:sub(add(add(vm.F(0x30),vm.y),vm.F(0x488)),mul(mul(vm.F(0x84),vm.scaleY),vm.scale2Y)),z:world[14]},{screenScale,screenOffsets});
 world[12]=pos.x;world[13]=pos.y;world[14]=add(add(vm.F(0x34),vm.z),vm.F(0x48c));return world;
}
export type AnmVertex3D=[number,number,number,number,number,number];
export type AnmVertex2D=[number,number,number,number,number];
export function projectedAnmGeometry(vm: AnmInstance,view: AnmView={}): {vertices:AnmVertex3D[];indices:number[];entry:number;mvp:number[];world:number[];camera:TouhouProjectionCamera}{
 const scale=mul(view.scale??1,view.screenScale??1),canvasWidth=view.canvasWidth??mul(640,scale),canvasHeight=view.canvasHeight??mul(480,scale);
 const sourceRect={x:Math.trunc(mul(128,scale)),y:Math.trunc(mul(16,scale)),width:Math.trunc(mul(384,scale)),height:Math.trunc(mul(448,scale))};
 const layer=vm.effectiveLayer,playfield=(layer>=20&&layer<=23)||(layer>=32&&layer<=33)||(layer>=49&&layer<=50);let camera;
 if(view.projection)camera=view.projection;
 else if(playfield)camera=createTouhouCamera(sourceRect);
 else if(layer>=24)camera=createTouhouCamera({x:0,y:0,width:canvasWidth,height:canvasHeight});
 else if(layer>=3&&layer<=19)camera=createTouhouCamera({x:Math.trunc(canvasWidth/2)-208,y:Math.trunc(canvasHeight/2)-240,width:416,height:480});
 else throw new UnsupportedAnmError(vm,`projected layer ${layer} needs an explicit camera`);
 const screenOffsets=view.projection?.screenOffsets??[{x:Math.trunc(canvasWidth/2),y:Math.trunc((canvasHeight-448)/2)},{x:Math.trunc(canvasWidth/2),y:Math.trunc(mul(16,scale))}];
 const world=projectedAnmWorld(vm,view.projection?.screenScale??scale,screenOffsets);
 const output=view.projection?.outputViewport??(playfield&&view.x!==undefined?{x:sub(view.x,mul(192,scale)),y:view.y??0,width:mul(384,scale),height:mul(448,scale)}:camera.viewport);
 const convert=identityMatrix();convert[0]=div(output.width,canvasWidth);convert[5]=div(output.height,canvasHeight);convert[10]=2;convert[12]=sub(div(add(mul(output.x,2),output.width),canvasWidth),1);convert[13]=sub(1,div(add(mul(output.y,2),output.height),canvasHeight));convert[14]=-1;
 const mvp=multiplyMatrix(multiplyMatrix(multiplyMatrix(world,camera.view),camera.projection),convert);
 const sprite=vm.bank.data.sprites[vm.spriteIndex],entry=vm.bank.data.entries[sprite.entry],ax=vm.U(0x4a8),ay=vm.U(0x4ac);
 if(ax>2||ay>2)throw new UnsupportedAnmError(vm,'projected anchor outside 0..2');
 const offsets=[-128,0,-256],x=offsets[ax],y=offsets[ay],color=((vm.U(0x4a0)>>>10)&7)===0?vm.U(0x490):vm.U(0x494),rgba=((color<<8)|(color>>>24))>>>0;
 const u=add(div(sprite.x,entry.width),vm.F(0x78)),v=add(div(sprite.y,entry.height),vm.F(0x7c)),du=mul(div(sprite.width,entry.width),vm.textureScaleX),dv=mul(div(sprite.height,entry.height),vm.textureScaleY);
 return{vertices:[[x,y,0,u,v,rgba],[x+256,y,0,add(u,du),v,rgba],[x,y+256,0,u,add(v,dv),rgba],[x+256,y+256,0,add(u,du),add(v,dv),rgba]],indices:[0,1,2,1,3,2],entry:sprite.entry,mvp,world,camera};
}

/** Original prepare_projected_billboard / p440310 (render type 4). A stage
 * supplies its camera and normalized direction×up axis, as object_projection
 * does. This path projects the center first; it is not a type-8 world quad. */
const billboardBits=new DataView(new ArrayBuffer(4));
function d3dxReciprocal(value: number){
 billboardBits.setFloat32(0,value,true);const word=billboardBits.getUint32(0,true),exponent=(word>>>23)&255;
 if(exponent===0||exponent>=253)return div(1,value);
 // D3DX9 uses RCPSS and one Newton step. The SSE estimate is constant per
 // 11-bit input mantissa bucket and rounds its midpoint reciprocal to 12 bits.
 // Exhaustively checked against the CPU intrinsic for all 2^23 mantissas.
 const bucket=(word&0x7fffff)>>>12,mantissa=Math.round((2/(1+(bucket+.5)/2048)-1)*4096);
 billboardBits.setUint32(0,((word&0x80000000)|((253-exponent)<<23)|(mantissa<<11))>>>0,true);
 const estimate=billboardBits.getFloat32(0,true);return sub(add(estimate,estimate),mul(mul(value,estimate),estimate));
}
export function projectedAnmBillboard(vm: AnmInstance,view: AnmView={}): {vertices:AnmVertex2D[];indices:number[];entry:number;sourceVertices:number[][];projected:{x:number;y:number;z:number};camera:TouhouProjectionCamera}{
 const camera=view.projection;
 if(!camera)throw new UnsupportedAnmError(vm,'projected billboard needs an explicit stage camera');
 const sprite=vm.bank.data.sprites[vm.spriteIndex];if(!sprite)throw new UnsupportedAnmError(vm,'projected billboard sprite fallback');
 // Source evaluates inherited rotation before projection/clipping; traversing
 // the parent chain also normalizes its local angle storage on clipped quads.
 const angles=inheritedRotation(vm),s=sin(angles[2]),c=cos(angles[2]);
 const world=identityMatrix();for(let i=0;i<3;i++)world[12+i]=add(add(vm.F(0x2c+i*4),vm.F(0x5bc+i*4)),vm.F(0x484+i*4));
 const matrix=multiplyMatrix(multiplyMatrix(world,camera.view),camera.projection),rect=camera.viewport;
 const projectPoint=(p: {x:number;y:number;z:number})=>{
  const c=Array(4);for(let i=0;i<4;i++)c[i]=add(add(mul(p.x,matrix[i]),mul(p.y,matrix[4+i])),add(mul(p.z,matrix[8+i]),matrix[12+i]));
  const inverse=d3dxReciprocal(c[3]),x=mul(c[0],inverse),y=mul(c[1],inverse),z=mul(c[2],inverse);
  // D3DXVec3Project's viewport mapping is x87 arithmetic with one final
  // float store (unlike its SSE matrix/perspective stage).
  return{x:f32((x+1)*.5*rect.width+rect.x),y:f32((1-y)*.5*rect.height+rect.y),z};
 };
 const projected=projectPoint({x:0,y:0,z:0}),result={vertices:[] as AnmVertex2D[],indices:[] as number[],entry:sprite.entry,sourceVertices:[] as number[][],projected,camera};
 if(projected.z<0||projected.z>1)return result;
 const axis=camera.billboardAxis??{x:0,y:0,z:0},up=projectPoint(axis),dx=sub(up.x,projected.x),dy=sub(up.y,projected.y),dz=sub(up.z,projected.z);
 const distance=f32(Math.sqrt(add(add(mul(dx,dx),mul(dy,dy)),mul(dz,dz))));
 const sx=mul(mul(mul(mul(distance,.5),vm.width),vm.scaleX),vm.scale2X),sy=mul(mul(mul(mul(distance,.5),vm.height),vm.scaleY),vm.scale2Y);
 const anchors=[[-.5,.5],[0,1],[-1,0]],ax=anchors[vm.U(0x4a8)],ay=anchors[vm.U(0x4ac)];
 if(!ax||!ay)throw new UnsupportedAnmError(vm,'projected billboard anchor outside 0..2');
 const entry=vm.bank.data.entries[sprite.entry],tw=vm.bank.environment.paddedTextures?entry.width:entry.texture.width??entry.width,th=vm.bank.environment.paddedTextures?entry.height:entry.texture.height??entry.height;
 const u=add(div(sprite.x,tw),mul(vm.F(0x78),div(entry.width,tw))),v=add(div(sprite.y,th),mul(vm.F(0x7c),div(entry.height,th))),du=mul(div(sprite.width,tw),vm.textureScaleX),dv=mul(div(sprite.height,th),vm.textureScaleY);
 const output=camera.outputViewport,color=((vm.U(0x490)<<8)|(vm.U(0x490)>>>24))>>>0;
 for(let i=0;i<4;i++){
  const x=mul(ax[i&1],sx),y=mul(ay[i>>1],sy),px=add(sub(mul(x,c),mul(y,s)),projected.x),py=add(add(mul(x,s),mul(y,c)),projected.y);
  result.sourceVertices.push([px,py,projected.z]);
  result.vertices.push([output?add(output.x,mul(div(sub(px,rect.x),rect.width),output.width)):px,output?add(output.y,mul(div(sub(py,rect.y),rect.height),output.height)):py,i&1?add(u,du):u,i>>1?add(v,dv):v,color]);
 }
 result.indices=[0,1,2,1,3,2];return result;
}
