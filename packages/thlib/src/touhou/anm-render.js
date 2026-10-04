import { f32, PI, add, sub, mul, div, sin, cos, wrapAngle, rotate, polar } from './math.js';
import { UnsupportedAnmError } from './anm-vm.js';
import {projectedAnmGeometry,projectedAnmBillboard} from './anm-projection.js';

const convertColor = argb => (((argb & 0xffffff) << 8) | (argb >>> 24)) >>> 0;
const factors = [
  ['srcAlpha', 'oneMinusSrcAlpha', 'add'], ['srcAlpha', 'one', 'add'],
  ['srcAlpha', 'one', 'reverseSubtract'], ['one', 'zero', 'add'],
  ['oneMinusDstColor', 'oneMinusSrcColor', 'add'], ['dstColor', 'zero', 'add'],
  ['oneMinusSrcColor', 'oneMinusSrcAlpha', 'add'], ['dstAlpha', 'oneMinusDstAlpha', 'add'],
  ['srcAlpha', 'one', 'min'], ['srcAlpha', 'one', 'max'],
];
const samplerWraps=['wrap','clamp','mirror'],quadStates=[];
function quadState(vm,blendMode,textured){
  const flags=textured?(vm.renderWords?vm.renderWords[0x4a0>>>2]:vm.U(0x4a0)):0,filter=((flags>>>2)&3)!==0,u=(flags>>>16)&3,v=(flags>>>13)&3;
  if(u===3||v===3)throw new UnsupportedAnmError(vm,'inherited sampler state');
  const index=blendMode*32+(filter?16:0)+u*4+v;
  return quadStates[index]??(quadStates[index]=Object.freeze([blendMode===3?0:1/255,...factors[blendMode],'one','zero','add',filter?'point':'bilinear',samplerWraps[u],samplerWraps[v]]));
}
const colorMultiply = (a, b, normalized) => {
  let result = 0;
  for (let shift = 0; shift < 32; shift += 8) { const product = ((a >>> shift) & 255) * ((b >>> shift) & 255); result |= Math.min(255, normalized ? Math.floor(product / 255) : product >>> 7) << shift; }
  return result >>> 0;
};
function colors(vm) {
  const words=vm.renderWords,mode=((words?words[0x4a0>>>2]:vm.U(0x4a0))>>>10)&7,primary=words?words[0x490>>>2]:vm.U(0x490),secondary=words?words[0x494>>>2]:vm.U(0x494);
  const result=vm.spriteColorCache??(vm.spriteColorCache=new Array(4));
  if (mode === 0 || mode === 1 || mode === 4) {
    let color = mode === 0 ? primary : mode === 1 ? secondary : colorMultiply(primary, secondary, true);
    if (((words?words[0x49c>>>2]:vm.U(0x49c)) & 0x1000000) && vm.parent) color = colorMultiply(color, vm.parent.U(0x5cc), false);
    if(words)words[0x5cc>>>2]=color;else vm.U(0x5cc,color);result[0]=result[1]=result[2]=result[3]=color;return result;
  }
  if (mode === 2) {result[0]=result[2]=primary;result[1]=result[3]=secondary;return result;}
  if (mode === 3) {result[0]=result[1]=primary;result[2]=result[3]=secondary;return result;}
  throw new UnsupportedAnmError(vm, `color mode ${mode}`);
}
function scaleMode(vm, view) {
  if (view.screenScale === undefined) return 1;
  const mode = vm.B(0x4a4);
  return mode === 1 || mode === 5 ? view.screenScale : mode === 2 || mode === 6 ? mul(view.screenScale, .5) : 1;
}
const anchors = [[-.5, .5], [0, 1], [-1, 0]];
const project = (point, view) => [add(view.x ?? 0, mul(point.x, view.scale ?? 1)), add(view.y ?? 0, mul(point.y, view.scale ?? 1))];
const vertex = (point, view, color, u = 0, v = 0) => [...project(point, view), u, v, convertColor(color)];

/** Recovered sprite corner and UV construction; testable without a renderer. */
export function anmSpriteVertices(vm, view = {}) {
  return spriteQuad(vm,view);
}

function spriteQuad(vm,view,draw=null,texture=0,state=null){
  const memory=vm.memory,values=vm.renderFloats,words=vm.renderWords,flags=words?words[0x49c>>>2]:memory.getUint32(0x49c,true),type=vm.renderBytes?vm.renderBytes[0x498]:memory.getUint8(0x498);
  const sprite = vm.bank.data.sprites[words?words[0x20>>>2]:memory.getUint32(0x20,true)];
  if (!sprite) throw new UnsupportedAnmError(vm, `text-renderer fallback sprite ${vm.spriteIndex}`);
  const entry = vm.bank.data.entries[sprite.entry];
  const position = vm.worldPosition(view,vm.spritePositionCache??(vm.spritePositionCache={x:0,y:0,z:0})), rotated = type === 1 || type === 3;
  const root=words&&!vm.parent&&!vm.transformParent,raw=vm.spriteRootQuadCache;
  let cached=vm.spriteQuadCache;
  // Compare raw float32 words so signed zero and NaN payload changes are not
  // lost. Root sprites need no inherited transform; cache a completed source
  // calculation only while every input is unchanged. Dynamic parents use the
  // ordinary path and retain each original rounding boundary.
  if(root&&raw&&raw.sprite===sprite&&raw.rotated===rotated&&raw.mode===vm.renderBytes[0x4a4]&&Object.is(raw.screenScale,view.screenScale)&&
    raw.sx===words[0x50>>>2]&&raw.sy===words[0x54>>>2]&&raw.s2x===words[0x58>>>2]&&raw.s2y===words[0x5c>>>2]&&
    raw.width===words[0x70>>>2]&&raw.height===words[0x74>>>2]&&raw.px===words[0x80>>>2]&&raw.py===words[0x84>>>2]&&
    raw.angle===words[0x40>>>2]&&raw.ax===words[0x4a8>>>2]&&raw.ay===words[0x4ac>>>2]&&
    Object.is(raw.spritePivotX,sprite.pivotX)&&Object.is(raw.spritePivotY,sprite.pivotY)&&Object.is(raw.spriteScaleX,sprite.scaleX)&&
    Object.is(raw.spriteScaleY,sprite.scaleY)&&Object.is(raw.spriteRotation,sprite.rotation))cached=raw.shape;
  else{
    const angle = rotated ? wrapAngle(add(vm.inheritedRotation(), sprite.rotation)) : 0;
    let sx=values?f32(values[0x50>>>2]*values[0x58>>>2]):f32(memory.getFloat32(0x50,true)*memory.getFloat32(0x58,true)),sy=values?f32(values[0x54>>>2]*values[0x5c>>>2]):f32(memory.getFloat32(0x54,true)*memory.getFloat32(0x5c,true));
    if (vm.parent && !(flags & 0x1000)) { const p=vm.parent.memory,pv=vm.parent.renderFloats;sx=f32((pv?f32(pv[0x50>>>2]*pv[0x58>>>2]):f32(p.getFloat32(0x50,true)*p.getFloat32(0x58,true)))*sx);sy=f32((pv?f32(pv[0x54>>>2]*pv[0x5c>>>2]):f32(p.getFloat32(0x54,true)*p.getFloat32(0x5c,true)))*sy); }
    const modeScale=f32(scaleMode(vm,view));sx=f32(sx*modeScale);sy=f32(sy*modeScale);
    const anchorX = anchors[words?words[0x4a8>>>2]:memory.getUint32(0x4a8,true)], anchorY = anchors[words?words[0x4ac>>>2]:memory.getUint32(0x4ac,true)];
    if (!anchorX || !anchorY) throw new UnsupportedAnmError(vm, 'sprite anchor outside 0..2');
    const dx=f32(f32(sprite.pivotX)-(values?values[0x80>>>2]:memory.getFloat32(0x80,true))),dy=f32(f32(sprite.pivotY)-(values?values[0x84>>>2]:memory.getFloat32(0x84,true)));
    const width=values?values[0x70>>>2]:memory.getFloat32(0x70,true),height=values?values[0x74>>>2]:memory.getFloat32(0x74,true),ssx=f32(sprite.scaleX),ssy=f32(sprite.scaleY);
    if(!cached||cached.anchorX!==anchorX||cached.anchorY!==anchorY||cached.rotated!==rotated||
      !Object.is(cached.width,width)||!Object.is(cached.height,height)||!Object.is(cached.dx,dx)||!Object.is(cached.dy,dy)||
      !Object.is(cached.ssx,ssx)||!Object.is(cached.ssy,ssy)||!Object.is(cached.sx,sx)||!Object.is(cached.sy,sy)||!Object.is(cached.angle,angle)){
      const x0=f32(f32(f32(f32(anchorX[0]*width)-dx)*ssx)*sx);
      const x1=f32(f32(f32(f32(anchorX[1]*width)-dx)*ssx)*sx);
      const y0=f32(f32(f32(f32(anchorY[0]*height)-dy)*ssy)*sy);
      const y1=f32(f32(f32(f32(anchorY[1]*height)-dy)*ssy)*sy);
      const c=rotated?f32(Math.cos(angle)):1,s=rotated?f32(Math.sin(angle)):0,offsets=new Array(8);
      for(let i=0;i<4;i++){
        const x=i&1?x1:x0,y=i>>1?y1:y0;
        offsets[i*2]=rotated?f32(f32(x*c)-f32(y*s)):x;
        offsets[i*2+1]=rotated?f32(f32(y*c)+f32(x*s)):y;
      }
      // Submitted commands may outlive this animation frame.
      cached=vm.spriteQuadCache={anchorX,anchorY,rotated,width,height,dx,dy,ssx,ssy,sx,sy,angle,offsets:Object.freeze(offsets)};
    }
    if(root){
      const next=raw??(vm.spriteRootQuadCache={});next.sprite=sprite;next.rotated=rotated;next.mode=vm.renderBytes[0x4a4];next.screenScale=view.screenScale;
      next.sx=words[0x50>>>2];next.sy=words[0x54>>>2];next.s2x=words[0x58>>>2];next.s2y=words[0x5c>>>2];next.width=words[0x70>>>2];next.height=words[0x74>>>2];
      next.px=words[0x80>>>2];next.py=words[0x84>>>2];next.angle=words[0x40>>>2];next.ax=words[0x4a8>>>2];next.ay=words[0x4ac>>>2];
      next.spritePivotX=sprite.pivotX;next.spritePivotY=sprite.pivotY;next.spriteScaleX=sprite.scaleX;next.spriteScaleY=sprite.scaleY;next.spriteRotation=sprite.rotation;next.shape=cached;
    }
  }
  const baseColors = colors(vm);
  const textureWidth = vm.bank.environment.paddedTextures ? entry.width : entry.texture.width ?? entry.width;
  const textureHeight = vm.bank.environment.paddedTextures ? entry.height : entry.texture.height ?? entry.height;
  let uv=vm.spriteUVCache;
  const ux=words?words[0x78>>>2]:vm.F(0x78),uy=words?words[0x7c>>>2]:vm.F(0x7c),usx=words?words[0x68>>>2]:vm.F(0x68),usy=words?words[0x6c>>>2]:vm.F(0x6c);
  if(!uv||uv.sprite!==sprite||(words?(uv.ux!==ux||uv.uy!==uy||uv.usx!==usx||uv.usy!==usy):(!Object.is(uv.ux,ux)||!Object.is(uv.uy,uy)||!Object.is(uv.usx,usx)||!Object.is(uv.usy,usy)))||
    !Object.is(uv.textureWidth,textureWidth)||!Object.is(uv.textureHeight,textureHeight)||!Object.is(uv.entryWidth,entry.width)||!Object.is(uv.entryHeight,entry.height)||
    !Object.is(uv.x,sprite.x)||!Object.is(uv.y,sprite.y)||!Object.is(uv.width,sprite.width)||!Object.is(uv.height,sprite.height)){
    const tw=f32(textureWidth),th=f32(textureHeight);
    const u0=f32(f32(f32(sprite.x)/tw)+f32((values?values[0x78>>>2]:memory.getFloat32(0x78,true))*f32(f32(entry.width)/tw)));
    const v0=f32(f32(f32(sprite.y)/th)+f32((values?values[0x7c>>>2]:memory.getFloat32(0x7c,true))*f32(f32(entry.height)/th)));
    const u1=f32(u0+f32(f32(f32(sprite.width)/tw)*(values?values[0x68>>>2]:memory.getFloat32(0x68,true))));
    const v1=f32(v0+f32(f32(f32(sprite.height)/th)*(values?values[0x6c>>>2]:memory.getFloat32(0x6c,true))));
    uv=uv??(vm.spriteUVCache={});uv.sprite=sprite;uv.ux=ux;uv.uy=uy;uv.usx=usx;uv.usy=usy;
    uv.textureWidth=textureWidth;uv.textureHeight=textureHeight;uv.entryWidth=entry.width;uv.entryHeight=entry.height;
    uv.x=sprite.x;uv.y=sprite.y;uv.width=sprite.width;uv.height=sprite.height;uv.u0=u0;uv.v0=v0;uv.u1=u1;uv.v1=v1;
  }
  const {u0,v0,u1,v1}=uv;
  const scale=f32(view.scale??1),vx=f32(view.x??0),vy=f32(view.y??0);
  const snap=type===0&&view.pixelSnap!==false;
  if(draw){
    if(state)return draw.statefulQuad(texture,cached.offsets,position.x,position.y,scale,vx,vy,u0,v0,u1,v1,
      convertColor(baseColors[0]),convertColor(baseColors[1]),convertColor(baseColors[2]),convertColor(baseColors[3]),snap,state);
    return draw.quad(texture,cached.offsets,position.x,position.y,scale,vx,vy,u0,v0,u1,v1,
      convertColor(baseColors[0]),convertColor(baseColors[1]),convertColor(baseColors[2]),convertColor(baseColors[3]),snap);
  }
  const points=new Array(4);
  for(let i=0;i<4;i++){
    const ox=cached.offsets[i*2],oy=cached.offsets[i*2+1];
    let px=f32(vx+f32(f32(position.x+ox)*scale));
    let py=f32(vy+f32(f32(position.y+oy)*scale));
    if(snap){px=f32(f32(Math.sign(px)*Math.floor(Math.abs(px)+.5))-.5);py=f32(f32(Math.sign(py)*Math.floor(Math.abs(py)+.5))-.5);}
    points[i]=[px,py,i&1?u1:u0,i>>1?v1:v0,convertColor(baseColors[i])];
  }
  return points;
}

function primitiveGeometry(vm, view, edge = false) {
  const type = vm.renderType, position = vm.worldPosition(view), inherited = vm.parent && !(vm.U(0x49c) & 0x1000);
  const angle = inherited ? add(vm.rotation, vm.parent.rotation) : vm.rotation;
  let width = mul(vm.inheritedScale(0), vm.width), height = mul(vm.inheritedScale(1), vm.height), auxiliary = vm.inheritedScale(2);
  width = mul(width, scaleMode(vm, view)); height = mul(height, scaleMode(vm, view));
  let primary = vm.U(0x490), secondary = vm.U(0x494); const vertices = [], indices = [];
  if(edge){width=add(width,1);height=add(height,1);primary=(primary&0xffffff)|((primary>>>25)<<24);secondary=(secondary&0xffffff)|((secondary>>>25)<<24);}
  const append = (x, y, color) => { const point = rotate(x, y, angle); vertices.push(vertex({ x: add(position.x, point.x), y: add(position.y, point.y) }, view, color)); };
  if ([16, 20, 21, 22].includes(type)) {
    const ax = anchors[vm.U(0x4a8)], ay = anchors[vm.U(0x4ac)];
    if (!ax || !ay) throw new UnsupportedAnmError(vm, 'primitive anchor outside 0..2');
    for (let i = 0; i < 4; i++) append(mul(ax[i & 1], width), mul(ay[i >> 1], height), (i & 1) && (type === 20 || type === 22) ? secondary : primary);
    indices.push(0, 1, 2, 1, 3, 2);
    return { vertices, indices, softEdge: type === 21 || type === 22, width, height };
  }
  if(type===32)return{vertices:[vertex(position,view,primary)],indices,point:true};
  if([26,27,28].includes(type)){
    const ax=anchors[vm.U(0x4a8)],ay=anchors[vm.U(0x4ac)];
    if(!ax||!ay)throw new UnsupportedAnmError(vm,'primitive anchor outside 0..2');
    if(type===28){
      const x0=vm.U(0x4a8)===0?div(-width,3):vm.U(0x4a8)===1?0:-width;
      const x1=vm.U(0x4a8)===0?div(mul(width,2),3):vm.U(0x4a8)===1?width:0;
      const y0=mul(ay[0],height),y2=mul(ay[1],height),y1=div(add(y0,y2),2);
      append(x0,y0,primary);append(x1,y1,secondary);append(x0,y2,primary);indices.push(0,1,2);return{vertices,indices};
    }
    const lineSecond=((vm.U(0x4a0)>>>10)&7)===0?primary:secondary;
    if(type===26){append(mul(ax[0],width),0,primary);append(mul(ax[1],width),0,lineSecond);}
    else{for(const i of[0,1,3,2,0])append(mul(ax[i&1],width),mul(ay[i>>1],height),(i&1)?lineSecond:primary);}
    return{vertices,indices,outline:true};
  }
  const count = vm.U(0x444) | 0;
  // Original colored_draw primitives submit no triangles for zero, and the
  // outline/ring/ellipse families explicitly return for counts <= 1.
  if(count<=0||count===1&&type!==17)return{vertices,indices};
  if (count > 4096) throw new UnsupportedAnmError(vm, `procedural vertex count ${count}`);
  const step = div(mul(PI, 2), count);
  let theta = angle;
  const ring = [19, 29, 30, 34, 35, 36, 44, 45, 46].includes(type);
  const ellipse = [31, 33, 34, 35, 36].includes(type);
  const star = [42, 43, 44, 45, 46].includes(type);
  const outline = [18, 33, 43].includes(type);
  if (![17, 18, 19, 29, 30, 31, 33, 34, 35, 36, 42, 43, 44, 45, 46].includes(type)) throw new UnsupportedAnmError(vm, `render type ${type}`);
  if (!ring && !outline) vertices.push(vertex(position, view, primary));
  const halfWidth = div(height, 2);
  if ([29, 35, 45].includes(type)) { width = add(halfWidth, width); if (ellipse || star) auxiliary = add(auxiliary, halfWidth); }
  if ([30, 36, 46].includes(type)) { width = sub(width, halfWidth); if (ellipse || star) auxiliary = sub(auxiliary, halfWidth); }
  for (let i = 0; i <= count; i++) {
    const appendPolar = (radiusX, radiusY, color) => {
      let offset;
      if (ellipse) offset = rotate(mul(cos(theta), radiusX), mul(sin(theta), radiusY), angle);
      else offset = polar(theta, radiusX);
      vertices.push(vertex({ x: add(position.x, offset.x), y: add(position.y, offset.y) }, view, color));
    };
    const rx = ellipse ? auxiliary : star && (i & 1) ? auxiliary : width;
    if (ring) { appendPolar(sub(rx, halfWidth), sub(width, halfWidth), primary); appendPolar(add(halfWidth, rx), add(halfWidth, width), secondary); }
    else appendPolar(rx, width, outline ? primary : secondary);
    theta = wrapAngle(add(theta, step));
  }
  if (ring) for (let i = 0; i < count; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  else if (!outline) for (let i = 0; i < count; i++) indices.push(0, i + 1, i + 2);
  return { vertices, indices, outline };
}

function texturedRing(vm, view) {
  const sprite = vm.bank.data.sprites[vm.spriteIndex];
  if (!sprite) throw new UnsupportedAnmError(vm, 'procedural texture fallback');
  const entry = vm.bank.data.entries[sprite.entry], count = vm.U(0x444) | 0;
  if (count < 2) return { vertices: [], indices: [], entry: sprite.entry };
  if (count > vm.geometryCapacity || count > 4096) throw new UnsupportedAnmError(vm, `ring allocation/count ${vm.geometryCapacity}/${count}`);
  const type = vm.renderType, closed = type === 9, center = vm.worldPosition(view);
  let angle = closed || type === 14 ? vm.rotation : wrapAngle(sub(vm.rotation, div(vm.F(0x38), 2)));
  const angleStep = closed ? div(mul(PI, 2), count - 1) : div(vm.F(0x38), count - 1);
  const uvStep = div(vm.U(0x448) | 0, count - 1), vertices = [], indices = [];
  let progress = 0, radius1 = add(mul(vm.scaleX, .5), vm.scaleY), radius2 = sub(vm.scaleY, mul(vm.scaleX, .5));
  if (vm.parent && !(vm.U(0x49c) & 0x1000)) { radius1 = mul(vm.parent.scaleX, radius1); radius2 = mul(vm.parent.scaleY, radius2); }
  radius1 = mul(radius1, scaleMode(vm, view)); radius2 = mul(radius2, scaleMode(vm, view));
  const second = vm.B(0x4a1) & 0x1c ? vm.U(0x494) : vm.U(0x490);
  for (let i = 0; i < count; i++) {
    for (let side = 0; side < 2; side++) {
      const p = closed && i === count - 1 ? null : polar(angle, side ? radius2 : radius1);
      const color = closed && side === 0 ? vm.U(0x490) : second;
      const u = add(div(sprite.x + (side ? sprite.width : 0), entry.width), vm.F(0x78));
      const v = add(progress, vm.F(0x7c));
      vertices.push(p ? vertex({ x: add(p.x, center.x), y: add(p.y, center.y) }, view, color, u, v) : [...vertices[side].slice(0, 3), v, convertColor(color)]);
    }
    progress = add(progress, uvStep); angle = wrapAngle(add(angle, angleStep));
  }
  for (let i = 0; i < count - 1; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  return { vertices, indices, entry: sprite.entry };
}

export function drawAnm(vm, draw, view = {}) {
  const blend = factors[vm.B(0x499)];
  if (!blend) throw new UnsupportedAnmError(vm, `blend mode ${vm.B(0x499)}`);
  const type = vm.renderType;
  if(type===8&&!(vm.U(0x490)&0xff000000))return;
  let geometry, texture = 0;
  const useQuad=type<=3&&typeof draw.quad==='function';
  if (type <= 3) {
    if(!useQuad)geometry = { vertices: anmSpriteVertices(vm, view), indices: [0, 1, 2, 1, 3, 2] };
    const sprite=vm.bank.data.sprites[vm.spriteIndex];if(!sprite)throw new UnsupportedAnmError(vm,`text-renderer fallback sprite ${vm.spriteIndex}`);
    texture = vm.bank.texture(sprite.entry);
  }
  else if(type===4){geometry=projectedAnmBillboard(vm,view);texture=vm.bank.texture(geometry.entry);const tint=colors(vm);for(let i=0;i<geometry.vertices.length;i++)geometry.vertices[i][4]=convertColor(tint[i]);}
  else if(type===8){geometry=projectedAnmGeometry(vm,view);texture=vm.bank.texture(geometry.entry);}
  else if ([9, 13, 14].includes(type)) { geometry = texturedRing(vm, view); texture = vm.bank.texture(geometry.entry); }
  else if (type === 10 || type === 23) return; // Recovered draw switch explicitly has no rendering for these values.
  else geometry = primitiveGeometry(vm, view);
  if(!useQuad&&!geometry.vertices.length)return;
  if(useQuad&&typeof draw.statefulQuad==='function'){
    spriteQuad(vm,view,draw,texture,quadState(vm,vm.B(0x499),texture));return;
  }
  if ((!useQuad&&!draw.mesh) || !draw.blendFactors || !draw.alphaTest) throw new UnsupportedAnmError(vm, 'renderer requires mesh/quad, blendFactors and alphaTest commands');
  // platform_window/render_state.cpp: ALPHAREF=1, ALPHAFUNC=GREATEREQUAL.
  // sprite_renderer/render_state.cpp disables alpha test only for replace mode3.
  draw.alphaTest(vm.B(0x499)===3?0:1/255);
  draw.blendFactors(...blend, 'one', 'zero', 'add');
  if (texture) {
    const filter = ((vm.U(0x4a0) >>> 2) & 3) === 0 ? 'bilinear' : 'point';
    const wraps = ['wrap', 'clamp', 'mirror'];
    const u = (vm.U(0x4a0) >>> 16) & 3, v = (vm.U(0x4a0) >>> 13) & 3;
    if (u === 3 || v === 3) throw new UnsupportedAnmError(vm, 'inherited sampler state');
    draw.sampler(texture, filter, wraps[u], wraps[v]);
  }
  if(useQuad)spriteQuad(vm,view,draw,texture);
  else if(geometry.mvp){
    if(!draw.mesh3d)throw new UnsupportedAnmError(vm,'renderer requires mesh3d command');
    draw.mesh3d(texture,geometry.vertices,geometry.indices,geometry.mvp);
  } else if(geometry.point){
    if(!draw.point)throw new UnsupportedAnmError(vm,'renderer requires point command');
    const p=geometry.vertices[0];draw.point(p[0],p[1],p[4]);
  } else if (geometry.outline) {
    if(!draw.lineStrip)throw new UnsupportedAnmError(vm,'renderer requires lineStrip command');
    draw.lineStrip(geometry.vertices.map(v=>[v[0],v[1],v[4]]));
  } else {
    if (geometry.softEdge) {
      const edge = primitiveGeometry(vm, view, true); draw.mesh(0, edge.vertices, edge.indices);
    }
    draw.mesh(texture, geometry.vertices, geometry.indices);
  }
  draw.blendEnd();
  draw.alphaTest(0);
}
