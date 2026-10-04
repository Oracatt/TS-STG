// Source profile: text_renderer/{centered,raster,bitmap}.cpp. Platform font
// probing, code-page conversion and raw GDI drawing are injected services.
const F=Math.fround;
const widths=[8,10,12,14,16,18,20,22,24,30,32,16,12,16,20,24,30,32,15,15,15,15];
const rgba=argb=>((argb<<8)|(argb>>>24))>>>0;

/** Original bitmap dilation uses an immutable copy and strict radius² bounds.
 * Input alpha is the GDI bitmap's inverted convention, not ordinary RGBA. */
export function outlineTouhouTextBitmap(surface,background=0xff000000,radius=2.5){
  const {width,height,pixels}=surface,original=pixels.slice(),square=F(F(radius)*F(radius)),bound=Math.trunc(square),offsets=[];
  for(let x=-bound+1;x<bound;x++)for(let y=-bound+1;y<bound;y++)if(x*x+y*y<square&&(x||y))offsets.push(x,y);
  // The source gathers immutable neighboring alpha. Scatter the same symmetric
  // neighborhood from glyph pixels once; avoid scanning it for every empty pixel.
  const edges=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(original[(y*width+x)*4+3]!==255){
    for(let i=0;i<offsets.length;i+=2){const nx=x+offsets[i],ny=y+offsets[i+1];if(nx>=0&&nx<width&&ny>=0&&ny<height)edges[ny*width+nx]=1;}
  }
  const r=(background>>>16)&255,g=(background>>>8)&255,b=background&255,a=(background>>>24)^255;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;if(pixels[p+3]===0)continue;
    pixels[p]=r;pixels[p+1]=g;pixels[p+2]=b;if(edges[y*width+x])pixels[p+3]=a;
  }
  return surface;
}

/** Restore source text raster/crop and original text ANM, rather than drawing
 * a replacement text label. This class owns no platform global or file path. */
export class TouhouTextRenderer {
  constructor({host,bank}={}){
    if(!bank)throw new TypeError('Touhou text requires the public text ANM bank');
    this.host=host;this.bank=bank;this.cache=new Map();
    this.modern=!!host?.hasSystemFont?.('メイリオ');this.mincho=!!host?.hasSystemFont?.('游明朝');
  }
  font(index){
    if(!Number.isInteger(index)||index<0||index>=22)throw new RangeError('Original font index must be in 0..21');
    const gothic=this.modern?'メイリオ':'ＭＳ ゴシック';
    if(index>=13&&index<=17)return{fontFamily:this.mincho?'Yu Mincho':'ＭＳ 明朝',fontSize:[32,40,48,60,64][index-13],fontWeight:700};
    if(index>=20)return{fontFamily:this.mincho?'Yu Mincho':'ＭＳ 明朝',fontSize:15,fontWeight:700};
    if(index>=18)return{fontFamily:gothic,fontSize:15,fontWeight:400};
    if(index<2||index===12)throw new RangeError('This original font slot is not initialized by the source profile');
    return{fontFamily:gothic,fontSize:this.modern?[24,30,36,42,48,54,60,66,72,90,96,48][index]:[24,28,32,36,40,44,48,60,64,32][index-2],fontWeight:index===11?600:400};
  }
  rasterize(text,{width,height,font=4,color=0xffffff,shadowColor=0xff000000,spacing=0,outline=true,codePage=932,align='center',x:offset=0,outlineScale=1}={}){
    const host=this.host;
    if(!host?.rasterizeBitmapText||!host?.encodeText)throw new Error('Touhou dynamic text requires an injected bitmap text rasterizer and code-page encoder');
    const bytes=host.encodeText(String(text),codePage),advance=F(F(widths[font]*2)-1),x=align==='left'?Math.trunc(offset*2):Math.trunc(F(F(width)-F(F(bytes.length*advance)/2)));
    const radius=F(F([4,5].includes(font)?2.5:[6,8,14,15,20,21].includes(font)?3:font===9?3.5:[10,16,17].includes(font)?4:2)*F(outlineScale));
    const top=font===10?4:font>=12&&font<=17?6:font===18||font===19?2:font>=20?7:3;
    const rw=width+3+Math.trunc(radius),rh=height+3+Math.trunc(radius)+6;
    const options={...this.font(font),allowFontSubstitution:true,width:rw,height:rh,x:spacing?x:x+2,y:top,spacing:spacing*2,charSet:codePage===936?134:128,quality:2,pitchAndFamily:17,codePage,fill:rgba(color|0xff000000),background:0x000000ff};
    let surface=host.rasterizeBitmapText(String(text),options);
    if(outline){outlineTouhouTextBitmap(surface,shadowColor,radius);surface=host.rasterizeBitmapText(String(text),{...options,pixels:surface.pixels});}
    const output=new Uint8Array(width*height*4),cropTop=this.modern&&font!==18&&font!==19?6:0,copyWidth=Math.min(width,1024);
    for(let y=0;y<height;y++)for(let x=0;x<copyWidth;x++){
      const from=((y+cropTop)*surface.width+x)*4,to=(y*width+x)*4;
      output[to]=surface.pixels[from];output[to+1]=surface.pixels[from+1];output[to+2]=surface.pixels[from+2];output[to+3]=surface.pixels[from+3]^255;
    }
    return{width,height,pixels:output};
  }
  writeAnimationText(vm,text,options={}){
    if(vm.bank!==this.bank)throw new TypeError('Text animation belongs to another bank');
    const sprite=this.bank.data.sprites[vm.spriteIndex];if(!sprite)throw new Error('Text animation has no destination sprite');
    const bitmap=this.rasterize(text,{width:sprite.width,height:sprite.height,align:'left',...options}),texture=this.bank.texture(sprite.entry),host=this.host;
    if(host.updateTextureRegion)host.updateTextureRegion(texture,sprite.x,sprite.y,bitmap.width,bitmap.height,bitmap.pixels);
    else{const target=host.readTexturePixels(texture);for(let y=0;y<bitmap.height;y++)target.pixels.set(bitmap.pixels.subarray(y*bitmap.width*4,(y+1)*bitmap.width*4),((sprite.y+y)*target.width+sprite.x)*4);host.updateTexture(texture,target.pixels);}
    vm.U(0x49c,vm.U(0x49c)|0x10000);return vm;
  }
  createNameAnimation(name,{script=22,interrupt=4,color=0xffffff,shadowColor=0xff000000,codePage=932}={}){
    const vm=this.bank.create(script),sprite=this.bank.data.sprites[vm.spriteIndex];
    if(!sprite){vm.destroy();throw new Error('Original text animation has no destination sprite');}
    try{
      const key=JSON.stringify([name,script,color,shadowColor,codePage]);let bitmap=this.cache.get(key);
      if(!bitmap){bitmap=this.rasterize(name,{width:sprite.width,height:sprite.height,color,shadowColor,codePage});this.cache.set(key,bitmap);}
      const texture=this.bank.texture(sprite.entry),host=this.host;
      if(host.updateTextureRegion)host.updateTextureRegion(texture,sprite.x,sprite.y,bitmap.width,bitmap.height,bitmap.pixels);
      else{
        const target=host.readTexturePixels(texture);
        for(let y=0;y<bitmap.height;y++)target.pixels.set(bitmap.pixels.subarray(y*bitmap.width*4,(y+1)*bitmap.width*4),((sprite.y+y)*target.width+sprite.x)*4);
        host.updateTexture(texture,target.pixels);
      }
      vm.U(0x49c,vm.U(0x49c)|0x10000);vm.interruptNow(interrupt);return vm;
    }catch(error){vm.destroy();throw error;}
  }
  dispose(){this.cache.clear();}
}
