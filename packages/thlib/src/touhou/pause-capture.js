// pause_system/capture.cpp. Platform adapters provide pixel IO; crop, resample,
// raw RNG order, color arithmetic and the original text87 ANM remain pure JS.
export function nextRawPauseRandom(random){
  const product=(random.state>>>0)*48271;
  let folded=Math.floor(product/0x80000000)+product%0x80000000;
  if(folded>=0x7fffffff)folded-=0x7fffffff;
  return random.last=random.state=folded>>>0;
}
function rectangle(rect,width,height){
  for(const key of['left','top','right','bottom'])if(!Number.isInteger(rect[key]))throw new TypeError('Pixel rectangle coordinates must be integers');
  if(rect.left<0||rect.top<0||rect.right>width||rect.bottom>height||rect.right<=rect.left||rect.bottom<=rect.top)throw new RangeError('Pixel rectangle is outside texture');
}
/** D3DX_FILTER_POINT top-left sampling, verified against D3DX9_43 itself. */
export function copyPauseSurface(source,destination,sourceRect,destinationRect){
  rectangle(sourceRect,source.width,source.height);rectangle(destinationRect,destination.width,destination.height);
  const sw=sourceRect.right-sourceRect.left,sh=sourceRect.bottom-sourceRect.top,dw=destinationRect.right-destinationRect.left,dh=destinationRect.bottom-destinationRect.top;
  const stepX=Math.floor(sw*65536/dw),stepY=Math.floor(sh*65536/dh);
  // Copy complete RGBA words when the supplied byte views are aligned. This
  // preserves their exact bytes on either endian order and keeps the fallback
  // for callers passing an unaligned Uint8Array subview.
  if(source.pixels.byteOffset%4===0&&destination.pixels.byteOffset%4===0&&source.pixels.byteLength%4===0&&destination.pixels.byteLength%4===0){
    const from=new Uint32Array(source.pixels.buffer,source.pixels.byteOffset,source.pixels.byteLength/4);
    const to=new Uint32Array(destination.pixels.buffer,destination.pixels.byteOffset,destination.pixels.byteLength/4);
    const columns=new Int32Array(dw);for(let x=0;x<dw;x++)columns[x]=sourceRect.left+Math.floor(x*stepX/65536);
    for(let y=0;y<dh;y++){
      const sy=(sourceRect.top+Math.floor(y*stepY/65536))*source.width;
      let target=(destinationRect.top+y)*destination.width+destinationRect.left;
      for(let x=0;x<dw;x++)to[target++]=from[sy+columns[x]];
    }
    return destination;
  }
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx=sourceRect.left+Math.floor(x*stepX/65536),sy=sourceRect.top+Math.floor(y*stepY/65536);
    const from=(sy*source.width+sx)*4,to=((destinationRect.top+y)*destination.width+destinationRect.left+x)*4;
    for(let channel=0;channel<4;channel++)destination.pixels[to+channel]=source.pixels[from+channel];
  }
  return destination;
}
/** Preserve the original swapped width/height loop, including padding writes. */
export function applyPauseNoise(surface,rect,random){
  rectangle(rect,surface.width,surface.height);
  const width=rect.right-rect.left,height=rect.bottom-rect.top;
  if(rect.top+width>surface.height||rect.left+height>surface.width)throw new RangeError('Original pause noise traversal would exceed texture storage');
  const p=surface.pixels;let state=random.state>>>0,product,folded;
  for(let x=0;x<width;x++)for(let y=0;y<height;y++){
    const offset=((rect.top+x)*surface.width+rect.left+y)*4,r=p[offset],g=p[offset+1],b=p[offset+2];
    // Three draws remain in the original green, blue, red order. Local state
    // avoids six object property writes per pixel in the interpreter.
    // The nonnegative product is an exact JS integer; its quotient is <96542,
    // so truncation and masking equal floor and remainder modulo 2^31.
    product=state*48271;folded=((product/0x80000000)|0)+(product&0x7fffffff);state=(folded>=0x7fffffff?folded-0x7fffffff:folded)>>>0;
    p[offset+1]=g-((g*(state&255)/0x300)|0);
    product=state*48271;folded=((product/0x80000000)|0)+(product&0x7fffffff);state=(folded>=0x7fffffff?folded-0x7fffffff:folded)>>>0;
    p[offset+2]=b-((b*(state&255)/0x300)|0);
    product=state*48271;folded=((product/0x80000000)|0)+(product&0x7fffffff);state=(folded>=0x7fffffff?folded-0x7fffffff:folded)>>>0;
    p[offset]=r-((r*(state&255)/0x500)|0);p[offset+3]=255;
  }
  random.last=random.state=state;
  return surface;
}
export class TouhouPauseCapture {
  constructor({bank,pixels,rng=bank.rng,sourceRect={left:48,top:24,right:624,bottom:696},view={x:0,y:0,scale:1,screenScale:1.5},script=87,secondary=true}){
    Object.assign(this,{bank,pixels,rng,sourceRect,view,script,secondary});this.animation=null;
  }
  capture({sourceTexture=0,practice=false}={}){
    this.animation?.destroy();this.animation=this.bank.create(this.script,{secondary:this.secondary});
    const descriptor=this.bank.data.sprites[this.animation.spriteIndex],texture=this.bank.textureFor(descriptor);
    const surface=this.pixels.readTexturePixels(texture),source=this.pixels.readTexturePixels(sourceTexture);
    const inset=practice?0:1,rect={left:Math.trunc(descriptor.x),top:Math.trunc(descriptor.y),right:Math.trunc(descriptor.x+descriptor.width-inset),bottom:Math.trunc(descriptor.y+descriptor.height-inset)};
    copyPauseSurface(source,surface,this.sourceRect,rect);if(!practice)applyPauseNoise(surface,rect,this.rng);
    this.pixels.updateTexture(texture,surface.pixels);return this;
  }
  update(){this.animation?.update();}
  hide(){this.animation?.interrupt(1,true);}
  draw(draw){this.animation?.draw(draw,this.view);return draw;}
  destroy(){this.animation?.destroy();this.animation=null;this.bank.collect();}
}
