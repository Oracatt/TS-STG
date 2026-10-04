// Bitmap glyph selection and layout: text_renderer/ascii.cpp (46d300),
// text_renderer/format.cpp. Input coordinates are original 640x480 units.
import { f32, add, sub, mul, div, sin, cos } from './math.js';
import { argbToRgba } from './distortion.js';

export function touhouGlyphIndex(code, font) {
  switch(font) {
    case 0: return code-0x20;
    case 1: return code+0x42;
    case 2: case 3:
      if(code>=97&&code<=122)return code+0x74;
      if(code>=65&&code<=90)return code+0x94;
      return ({47:0xce,58:0xcf,45:0xd0,42:0xd1,37:0xd2,36:0x11f,46:0xd3,43:0xd4})[code] ?? code+0x94;
    case 4: case 5: case 10: case 11: {
      const base=font===10?0x10d:font===11?0xfe:0xef;
      return base+(({47:10,46:11,115:12,42:13,44:14})[code] ?? code-48);
    }
    case 6:return code+0x120; case 7:return code+0x1e4;
    case 8:return code+0x182; case 9:return code+0x246;
    case 12:return code<32?0x349-code:code+0x2a8;
    case 13:return code<32?0x3ad-code:code+0x30c;
    default:throw new RangeError(`Unknown original bitmap font ${font}`);
  }
}
const variable = font => font>=6&&font<=9||font===12||font===13;
const shadowFonts={6:8,7:9,10:11,12:13};
const cacheNumber=value=>value===0&&1/value<0?'-0':value;

export class TouhouBitmapFont {
  constructor(data,{loadTexture,screenScale=1.5}={}) {
    this.data=data;this.screenScale=f32(screenScale);this.loadTexture=loadTexture;this.textures=new Map();
    // Draw-only cache: public layout() continues returning independent glyphs.
    // A bound also covers continuously changing score/timer strings.
    this._drawLayouts=new Map();this._layoutData=data;
  }
  texture(entry) {
    const cached=this.textures.get(entry.index);
    if(cached!==undefined)return cached;
    if(!entry.texture.path)throw new Error(`Missing original font texture ${entry.name}`);
    const texture=this.loadTexture(entry.texture.path,entry.width,entry.height);
    this.textures.set(entry.index,texture);return texture;
  }
  _drawLayout(text,{font=10,x=0,y=0,scaleX=1,scaleY=scaleX,alignX=1,alignY=1,rotation=0}={}) {
    if(this._layoutData!==this.data){this._drawLayouts.clear();this._layoutData=this.data;}
    // Keep the complete text and every geometric option in the key. Colors and
    // queue priority remain dynamic at submission time, including shadow tint.
    const key=[this.screenScale,font,x,y,scaleX,scaleY,alignX,alignY,rotation].map(cacheNumber).join(':')+'\0'+String(text);
    let glyphs=this._drawLayouts.get(key);
    if(glyphs)return glyphs;
    glyphs=this.layout(text,{font,x,y,scaleX,scaleY,alignX,alignY,rotation});
    const cs=cos(rotation),sn=sin(rotation);
    for(const glyph of glyphs){
      const {width,height}=glyph;
      glyph.x=add(glyph.x,sub(mul(width/2,cs),mul(height/2,sn)));
      glyph.y=add(glyph.y,add(mul(height/2,cs),mul(width/2,sn)));
    }
    if(this._drawLayouts.size>=256)this._drawLayouts.delete(this._drawLayouts.keys().next().value);
    this._drawLayouts.set(key,glyphs);return glyphs;
  }
  layout(text,{font=10,x=0,y=0,scaleX=1,scaleY=scaleX,alignX=1,alignY=1,rotation=0}={}) {
    text=String(text);const S=this.screenScale, sx=f32(scaleX),sy=f32(scaleY);
    let width=mul([9,6,7,7,12,12,12,17.5,12,17.5,12,12,7,7][font],sx);
    const height=mul([14,9,10,10,16,16,16,23.5,16,23.5,16,16,11.5,11.5][font],sy);
    let ox=0,oy=alignY===0?mul(div(-height,2),S):alignY===2?mul(-height,S):0;
    if(alignX===0||alignX===2) {
      if(font>=2&&font<=5||font===10||font===11) {
        for(const ch of text) {const advance=ch===(font===2||font===3?'.':',')?mul(-4,sx):-width;ox=add(mul(alignX===0?div(advance,2):advance,S),ox);}
      } else if(variable(font)) {
        let distance=0;
        for(const ch of text) {
          const code=ch.charCodeAt(0), index=font===12||font===13?(code<32?0x349-code:code+0x2a8):code-32+(font===6||font===8?0x140:0x204);
          const sprite=this.data.sprites[index];if(!sprite)throw new RangeError(`Missing original glyph ${index}`);
          distance=add(div(sprite.width,sub(3,S)),distance);
        }
        ox=mul(-distance,sx);if(alignX===0)ox=div(ox,2);
      } else {ox=mul(-text.length,width);if(alignX===0)ox=div(ox,2);ox=mul(ox,S);}
    }
    const start=ox,result=[],cs=cos(rotation),sn=sin(rotation);
    for(const ch of text) {
      const code=ch.charCodeAt(0);
      if(code===10){ox=start;oy=add(mul(mul(height,sy),S),oy);continue;}
      if(code===32&&!(font>=6&&font<=9)){ox=add(mul(width,S),ox);continue;}
      const index=touhouGlyphIndex(code,font),sprite=this.data.sprites[index];
      if(!sprite)throw new RangeError(`Missing original glyph ${index} for ${ch}`);
      let dy=0;
      if(font===2||font===3)width=mul(code===46?4:7,sx);
      if(font===4||font===5||font===10||font===11){width=mul(code===44?4:12,sx);if(code===44)dy=mul(3,S);}
      let w=sprite.width,h=sprite.height;
      if(variable(font)){width=mul(div(div(w,sub(3,S)),S),sx);w=mul(div(w,2),S);h=mul(div(h,2),S);}
      const py=add(oy,dy);
      result.push({index,sprite,x:add(sub(mul(ox,cs),mul(py,sn)),mul(x,S)),y:add(add(mul(py,cs),mul(ox,sn)),mul(y,S)),width:mul(w,sx),height:mul(h,sy),rotation});
      ox=add(mul(width,S),ox);
    }
    return result;
  }
  draw(draw,text,options={}) {
    if(draw.enqueuePriority){draw.enqueuePriority(options.drawPriority??102,target=>this.draw(target,text,options));return draw;}
    const font=options.font??10;
    const shadowFont=shadowFonts[font];
    if(shadowFont!==undefined&&options.shadowColor!==null)
      this.draw(draw,text,{...options,font:shadowFont,color:options.shadowColor??0xff000000,shadowColor:null});
    // Original bitmap text is submitted through the normal ANM render state.
    draw.alphaTest(1/255).blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
    const color=argbToRgba(options.color??0xffffffff);
    const filter=(font===3||font===5||!(font>=1&&font<=11))?'bilinear':'point';
    for(const glyph of this._drawLayout(text,options)) {
      const {sprite,x,y,width,height,rotation}=glyph,entry=this.data.entries[sprite.entry],texture=this.texture(entry);
      draw.sampler(texture,filter,'clamp','clamp');
      draw.spriteRegion(texture,sprite.x,sprite.y,sprite.width,sprite.height,x,y,width,height,rotation,color);
    }
    draw.blendEnd().alphaTest(0);
    return draw;
  }
}

export function touhouGroupedScore(score,finalDigit=0) {
  const bits=BigInt.asIntN(64,BigInt(score)*10n+BigInt(finalDigit));
  const text=bits.toString(),sign=text.startsWith('-')?'-':'',digits=sign?text.slice(1):text;
  return sign+digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');
}
