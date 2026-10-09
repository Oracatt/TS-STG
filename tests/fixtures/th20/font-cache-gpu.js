// Identical original bitmap text through cold and warm geometry caches.
import {Th20BitmapFont} from '../../../games/touhou20/src/font.js';
import {DrawList} from '../../../packages/thlib/dist/render.js';
const host=globalThis.tsstg,data=JSON.parse(host.readText('games/touhou20/assets/anm/ascii_960.json')),textures=new Map();
const loadTexture=(path,...size)=>{if(!textures.has(path))textures.set(path,host.loadTexture(path,...size));return textures.get(path);};
const cold=new Th20BitmapFont(data,{loadTexture}),warm=new Th20BitmapFont(data,{loadTexture}),targets=[host.createRenderTarget(448,448),host.createRenderTarget(448,448)];
let frame=0;
function panel(draw,target,font){
 draw.targetBegin(target,0x5e687aff);
 for(let y=0;y<448;y+=16)for(let x=0;x<448;x+=16)if((x/16+y/16)%2===0)draw.rect(x,y,16,16,0x303a4cff);
 for(let i=0;i<14;i++)font.draw(draw,'12,345.67/8',{font:i,x:[148,12,280][i%3],y:8+i*20,alignX:i%3,scaleX:.75+(i%2)*.125,scaleY:.8,rotation:i%2?.025:0,color:0xc0ffdfb0+frame,shadowColor:0x90804020});
 draw.targetEnd();
}
globalThis.__tsstg_game={update(){frame++;},render(){
 cold._drawLayouts.clear();const draw=new DrawList();draw.clear(0x1a2638ff);panel(draw,targets[0],cold);panel(draw,targets[1],warm);
 draw.blendFactors('one','zero','add','one','zero','add');draw.sprite(targets[0],240,250,448,448);draw.sprite(targets[1],720,250,448,448);draw.blendEnd();return draw.commands;
},snapshot(){
 const left=host.readTexturePixels(targets[0]).pixels,right=host.readTexturePixels(targets[1]).pixels;let differences=0,transparent=0;
 for(let i=0;i<left.length;i++){if(left[i]!==right[i])differences++;if(i%4===3&&left[i]===0)transparent++;}
 if(differences||transparent)throw Error(`Font cache GPU regression: ${differences} differing components, ${transparent} erased-background pixels`);
 return {frame,width:448,height:448,comparedRgbaBytes:left.length,differingComponents:differences,erasedBackgroundPixels:transparent,warmLayouts:warm._drawLayouts.size};
}};
