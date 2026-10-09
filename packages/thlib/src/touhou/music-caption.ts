import type {AnmDrawList as DrawList} from './anm.js';
import type {AnmInstance,AnmView,AnmData,AnmScript} from './anm.js';
import type {TouhouBitmapTextHost} from './text-renderer.js';

export interface TouhouMusicCaptionHost extends Pick<TouhouBitmapTextHost,'hasSystemFont'|'encodeText'|'rasterizeBitmapText'> {
  createTexture(width:number,height:number,pixels:Uint8Array):number;
  unloadTexture(texture:number):void;
}

export interface TouhouMusicCaptionOptions {
  text:string;host?:TouhouMusicCaptionHost|null;codePage?:number;font?:number;color?:number;shadowColor?:number;view?:AnmView;
}

export interface TouhouMusicCaptionSnapshot {
  text:string;frame:number;alive:boolean;view:AnmView;animation:ReturnType<AnmInstance['snapshot']>;
}

import {AnmBank} from './anm.js';
import {TouhouTextRenderer} from './text-renderer.js';

export const TOUHOU_MUSIC_CAPTION_VIEW: Readonly<{x:0;y:0;scale:1;screenScale:1.5}>=Object.freeze({x:0,y:0,scale:1,screenScale:1.5});

// st01logo/st02logo/st03logo script2 are identical. Preserve their complete
// instruction offsets, timing, layer35, scaleMode2 and bottom-left anchor.
// Only sprite6's static song-name PNG is replaced by an owned blank surface.
// No concrete track name or stage-logo image is part of this public preset.
// Source ANM SHA-256 (independently checked by touhou-music-caption.test.js):
// st01logo a33fa555420d6f6eb089a6febe314067c38f4fed9abb13626ca51c54c4389248
// st02logo c28400993a415c1939d834fed123e3e852027fa316783a775e5b92ae92023597
// st03logo e2c6a2ddd51addc39fdba0ca52a903860c9346ea10c123ded651ca273f94c618
function captionData(): AnmData{
  let offset=0;
  const instructions=[
    [0,300,6],[0,304,35],[0,313,2],[0,311,1],[0,307,1],[0,421,131073],[0,302,0],[0,403,0],
    [0,400,1146093568,1147666432,0],
    [60,407,60,4,1115684864,1147666432,0],[60,409,60,0,255],
    [320,409,20,0,0],[320,407,20,1,1115684864,1147666432,0],[340,1],
  ].map(([time,opcode,...args])=>{const size=8+args.length*4,ins={offset,opcode,size,time,mask:0,args};offset+=size;return ins;});
  instructions.push({offset,opcode:-1,size:0,time:0,mask:0,args:[]});
  const entry={index:1,offset:0,length:0,name:'@music-caption',width:1024,height:64,format:5,x:0,y:448,
    memoryPriority:0,lowResScale:1,hasData:0,originalWidth:768,originalHeight:512,spriteBase:6,scriptBase:2,spriteCount:1,scriptCount:1,
    texture:{kind:'dynamic',width:1024,height:64}};
  return{format:'touhou-anm-v8',name:'music-caption',byteLength:0,opcodeCounts:{},
    entries:[{...entry,index:0,name:'<excluded>',spriteCount:0,scriptCount:0,texture:{kind:'excluded'}},entry],
    sprites:Array.from({length:7},(_,index)=>({index,entry:1,storedId:index,x:0,y:32,width:index===6?768:0,height:index===6?32:0,
      pivotX:0,pivotY:0,scaleX:1,scaleY:1,rotation:0,...(index===6?{}:{excluded:true})})),
    scripts:[0,1].map((index):AnmScript=>({index,entry:0,storedId:index,offset:0,excluded:true,instructions:[{offset:0,opcode:-1,size:0,time:0,mask:0,args:[]}]})).concat({index:2,entry:0,storedId:2,offset:696,instructions})};
}

/** Original music announcement timeline with caller-owned text and music.
 * A null host supports headless animation; rendering uses the same injected
 * bitmap rasterizer as public spell names and dialogue, never a stage PNG. */
export class TouhouMusicCaption {
  declare text: string;
  declare host: TouhouMusicCaptionHost|null;
  declare view: AnmView;
  declare frame: number;
  declare disposed: boolean;
  declare texture: number|null;
  declare bank: AnmBank;
  declare animation: AnmInstance;
  declare renderer: TouhouTextRenderer|null;

  constructor({text,host=null,codePage=932,font=2,color=0xffffff,shadowColor=0xff000000,view=TOUHOU_MUSIC_CAPTION_VIEW}: TouhouMusicCaptionOptions={} as TouhouMusicCaptionOptions){
    if(typeof text!=='string')throw new TypeError('TouhouMusicCaption requires a text string');
    this.text=text;this.host=host;this.view={...view};this.frame=0;this.disposed=false;this.texture=null;this.renderer=null;
    this.bank=new AnmBank(captionData(),{resolveTexture:()=>this.texture!});this.animation=this.bank.create(2);
    if(!host)return;
    try{
      for(const name of ['createTexture','unloadTexture','encodeText','rasterizeBitmapText'] as const)
        if(typeof host[name]!=='function')throw new TypeError(`Music caption host requires ${name}`);
      this.renderer=new TouhouTextRenderer({host,bank:this.bank});
      const bitmap=this.renderer.rasterize(text,{width:768,height:32,font,codePage,color,shadowColor,align:'left'});
      const pixels=new Uint8Array(1024*64*4);let left=768,right=-1;
      // Source logo text is right-aligned. Align actual ink, not an estimated
      // encoded-byte width, and leave two transparent texels at the right edge.
      // This preserves the shared rasterizer's outlines without stretching them.
      for(let y=0;y<32;y++)for(let x=0;x<768;x++)if(bitmap.pixels[(y*768+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);}
      if(right>=left){const width=Math.min(764,right-left+1),x=766-width;
        for(let y=0;y<32;y++)pixels.set(bitmap.pixels.subarray((y*768+left)*4,(y*768+left+width)*4),((y+32)*1024+x)*4);}
      this.texture=host.createTexture(1024,64,pixels);
      if(typeof this.texture!=='number')throw new TypeError('Music caption texture handle must be numeric');
    }catch(error){this.destroy();throw error;}
  }
  get alive(): boolean{return !this.disposed&&this.animation.alive;}
  update(): this{if(!this.alive)return this;this.animation.update();this.frame++;if(!this.animation.alive)this.destroy();return this;}
  draw(draw: DrawList,view: AnmView=this.view): DrawList{if(this.alive&&this.texture!==null)this.animation.draw(draw,view);return draw;}
  snapshot(): TouhouMusicCaptionSnapshot{return{text:this.text,frame:this.frame,alive:this.alive,view:{...this.view},animation:this.animation.snapshot()};}
  destroy(): void{if(this.disposed)return;this.disposed=true;this.bank.dispose();this.renderer?.dispose();
    if(this.texture!==null)this.host?.unloadTexture?.(this.texture);this.texture=null;}
}
