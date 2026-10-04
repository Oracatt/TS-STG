/** Source graphics_callbacks.cpp: initial 019c capture (1..13), first
 * composition/distortion (14/15), 01a0 -> 019c (25/26), 019c -> 01a0
 * (47/48), and final backbuffer composition (66/67). ANM numbers are never
 * changed: callback priorities determine both the pass and its camera clip.
 *
 * The host's targetBegin clears a surface. Copying the completed incoming
 * surface with replacement blending before the next pass preserves its color
 * and alpha without requiring host-specific D3D target/depth operations.
 */
import {TOUHOU_OWNER_PRIORITIES} from './render-order.js';
import {add,mul} from './math.js';

// Host-independent camera translation. Work on only newly emitted commands,
// copy mutable geometry, and leave scissors/target copies at fixed viewport
// coordinates. This corresponds to camera0/1/3/5's source screen-shake offsets;
// camera2/4 and full-screen HUD callbacks remain stationary.
function translateCommands(commands,start,x,y){
  const vertices=values=>values.map(value=>[add(value[0],x),add(value[1],y),...value.slice(2)]);
  for(let i=start;i<commands.length;i++){
    const original=commands[i],command=original.slice(),type=command[0];
    if(['circle','ring','point','rect'].includes(type)){command[1]=add(command[1],x);command[2]=add(command[2],y);}
    else if(type==='line'||type==='triangle'){
      for(let index=1;index<=(type==='line'?3:5);index+=2){command[index]=add(command[index],x);command[index+1]=add(command[index+1],y);}
    }else if(type==='sprite'||type==='text'){command[2]=add(command[2],x);command[3]=add(command[3],y);}
    else if(type==='spriteRegion'){command[6]=add(command[6],x);command[7]=add(command[7],y);}
    else if(type==='quad'||type==='statefulQuad'){command[6]=add(command[6],x);command[7]=add(command[7],y);}
    else if(type==='lineStrip')command[1]=vertices(command[1]);
    // Type4 projected billboards and sprite fallback quads pass through the
    // source submit_animation_quad and receive its camera offset. Type8 uses
    // projected_draw::p441f00's world matrix without that offset; colored fans
    // (including inversion26..30) and pretransformed strips likewise use only
    // viewport placement. Do not translate those native mesh/mesh3d commands.
    else if(type==='mesh'&&command[1]!==0&&command[2].length===4&&command[3].length===6)command[2]=vertices(command[2]);
    else continue;
    commands[i]=command;
  }
}
export class TouhouGameplayCompositor {
  constructor({renderTarget=null,compositeTarget=null,viewport={x:48,y:24,width:576,height:672},
    width=960,height=720,scale=1.5,clearColor=0x000000ff,cameraViewport=null}={}) {
    if(renderTarget!==null&&compositeTarget===renderTarget)throw new RangeError('Gameplay render targets must be distinct');
    if(compositeTarget!==null&&renderTarget===null)throw new TypeError('A composite target requires the initial render target');
    Object.assign(this,{renderTarget,compositeTarget,width,height,scale,clearColor});
    this.viewport={...viewport};
    // Camera 0/3 includes the 16-unit margin around the 384x448 playfield;
    // camera 1/5 clips exactly to it (viewports.cpp, dispatch.cpp).
    this.cameraViewport=cameraViewport??{x:viewport.x-16*scale,y:viewport.y-16*scale,
      width:viewport.width+32*scale,height:viewport.height+32*scale};
  }
  _clipped(draw,rectangle,callback){draw.scissor(rectangle.x,rectangle.y,rectangle.width,rectangle.height);callback();draw.scissorEnd();}
  _offset(draw,offset,callback){
    if(!offset||(!offset.x&&!offset.y)){callback();return;}
    if(!Number.isFinite(offset.x)||!Number.isFinite(offset.y))throw new TypeError('Camera offset coordinates must be finite');
    const start=draw.commands.length;callback();translateCommands(draw.commands,start,mul(offset.x,this.scale),mul(offset.y,this.scale));
  }
  _copy(draw,texture){
    draw.sampler(texture,'point','clamp','clamp').blendFactors('one','zero','add','one','zero','add');
    draw.sprite(texture,this.width/2,this.height/2,this.width,this.height).blendEnd();
  }
  _opaqueCapture(draw){
    // graphics_callbacks.cpp composite_mask (priority 14): preserve RGB,
    // replace alpha with 255 before Boss strips sample this surface. Source
    // strips select vertex alpha; the opaque capture prevents texture alpha
    // from attenuating the already blended SpellCardAttack/rings a second time.
    const v=this.cameraViewport;
    draw.alphaTest(0).blendFactors('zero','one','add','one','zero','add');
    draw.rect(v.x,v.y,v.width,v.height,0x000000ff).blendEnd();
  }
  _flush(draw,queue,minimumPriority,maximumPriority,cameraOffset){
    if(minimumPriority>maximumPriority)return;
    // Scheduler ranges at camera switches. Full-screen callbacks interleaved
    // with the playfield HUD must not inherit a previous scissor rectangle.
    for(const [low,high,rectangle]of [[-Infinity,9,null],[10,46,this.cameraViewport],
      [47,62,this.viewport],[63,79,null],[80,83,this.viewport],[84,Infinity,null]]){
      const minimum=Math.max(low,minimumPriority),maximum=Math.min(high,maximumPriority);
      if(minimum>maximum)continue;
      const flush=()=>queue.flush(draw,{minimumPriority:minimum,maximumPriority:maximum});
      if(rectangle)this._clipped(draw,rectangle,()=>this._offset(draw,cameraOffset,flush));else flush();
    }
  }
  draw(draw,queue,{drawBackground,drawDistortion,cameraOffset}={}){
    const a=this.renderTarget,b=this.compositeTarget;
    if(drawBackground)queue.enqueuePriority(TOUHOU_OWNER_PRIORITIES.stageBackground,
      target=>this._clipped(target,this.cameraViewport,()=>this._offset(target,cameraOffset,()=>drawBackground(target))));
    if(a===null){
      this._flush(draw,queue,-Infinity,Infinity,cameraOffset);return draw;
    }
    draw.targetBegin(a,this.clearColor);
    this._flush(draw,queue,-Infinity,13,cameraOffset);this._opaqueCapture(draw);draw.targetEnd();
    if(b===null){
      this._copy(draw,a);
      // RenderMesh's pretransformed strips sample the already shifted capture.
      // geometry_draw.cpp offset_geometry adds viewport placement only, never
      // camera shake. Moving these strips again would displace the warp twice.
      if(drawDistortion)this._clipped(draw,this.cameraViewport,()=>drawDistortion(draw,a));
      this._flush(draw,queue,14,Infinity,cameraOffset);return draw;
    }
    draw.targetBegin(b,this.clearColor);this._copy(draw,a);
    if(drawDistortion)this._clipped(draw,this.cameraViewport,()=>drawDistortion(draw,a));
    this._flush(draw,queue,14,24,cameraOffset);draw.targetEnd();
    draw.targetBegin(a,this.clearColor);this._copy(draw,b);
    this._flush(draw,queue,25,46,cameraOffset);draw.targetEnd();
    draw.targetBegin(b,this.clearColor);this._copy(draw,a);
    this._flush(draw,queue,47,65,cameraOffset);draw.targetEnd();
    draw.clear(this.clearColor);this._copy(draw,b);this._flush(draw,queue,66,Infinity,cameraOffset);return draw;
  }
}
