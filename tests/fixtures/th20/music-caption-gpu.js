// Public dynamic-caption native fixture. No PNGs, ANM files or private demo
// assets are loaded. Run120 frames, then inspect the original footer rectangle.
import {DrawList} from '../../../packages/thlib/src/index.js';
import {TouhouMusicCaption} from '../../../packages/thlib/src/touhou/index.js';
const caption=new TouhouMusicCaption({host:tsstg,text:'BGM. 恩惠Summer Rain',codePage:936});
let frame=0;
globalThis.__tsstg_game={update(){frame++;if(frame<=120)caption.update();},render(){
  const draw=new DrawList();draw.clear(0x1d324cff);
  for(let y=0;y<720;y+=24)for(let x=0;x<960;x+=24)if((x/24+y/24)%2)draw.rect(x,y,24,24,0x53728cff);
  draw.rect(48,672,576,24,0x26485aff);draw.text('Public music caption / original footer: x48..624, y672..696',20,20,18);
  caption.draw(draw);return draw.commands;
},snapshot(){const surface=tsstg.readTexturePixels(caption.texture);let pixels=0,minX=1024,maxX=-1,minY=64,maxY=-1;
 for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++)if(surface.pixels[(y*surface.width+x)*4+3]){pixels++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(!pixels)throw Error('Dynamic Chinese caption is empty');return{frame,caption:caption.snapshot(),ink:{pixels,minX,maxX,minY,maxY},originalArtworkLoaded:false};}};
