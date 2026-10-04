import { AnmBank } from '../../../games/touhou20/src/anm.js';
import { DrawList } from '../../../packages/thlib/src/render.js';

// GPU diagnostic: original source-ANM alpha writes followed by the old canvas
// presentation blend, alongside an opaque RGB copy. Assets are never modified.
const host=globalThis.tsstg,read=name=>JSON.parse(host.readText(`games/touhou20/assets/anm/${name}.json`));
const textures=new Map(),loadTexture=(...args)=>{const key=JSON.stringify(args);if(!textures.has(key))textures.set(key,host.loadTexture(...args));return textures.get(key);};
const banks={pl00:new AnmBank(read('pl00'),{loadTexture}),bullet:new AnmBank(read('bullet'),{loadTexture})};
const player=banks.pl00.create(0,{x:64,y:64}),bullet=banks.bullet.create(0,{x:192,y:64});
const target=host.createRenderTarget(256,192),synthetic=host.createTexture(2,2,new Uint8Array([255,0,0,0,255,255,255,255,0,255,0,128,255,255,255,255]));
const draw=new DrawList(),bg=[48,176,104],rgba=0x30b068ff;
let frame=0,result={};
const pixel=(image,x,y)=>Array.from(image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
function inspect(){
 const source=host.readTexturePixels(target),canvas=host.readTexturePixels();let erased=0,mismatches=0,opaqueMismatches=0,samples=[];
 for(let y=0;y<192;y++)for(let x=0;x<256;x++){
  const p=pixel(source,x,y);if(p[3]===0&&(p[0]||p[1]||p[2])){
   erased++;const old=pixel(canvas,x+80,y+120),copy=pixel(canvas,x+560,y+120);
   if(p.slice(0,3).some((v,i)=>v!==old[i]))mismatches++;
   if(p.slice(0,3).some((v,i)=>v!==copy[i]))opaqueMismatches++;
   if(samples.length<8)samples.push({x,y,source:p,oldPresentation:old,opaquePresentation:copy});
  }
 }
 const assetStats=[];
 for(const [name,bank] of Object.entries(banks)){
  const vm=name==='pl00'?player:bullet,sprite=bank.data.sprites[vm.spriteIndex],texture=host.readTexturePixels(bank.textureFor(sprite));let transparent=0,partial=0,opaqueBlack=0;
  for(let y=sprite.y;y<sprite.y+sprite.height;y++)for(let x=sprite.x;x<sprite.x+sprite.width;x++){
   const p=pixel(texture,x,y);if(p[3]===0)transparent++;else if(p[3]<255)partial++;if(p[3]===255&&p[0]===0&&p[1]===0&&p[2]===0)opaqueBlack++;
  }
  assetStats.push({archive:name,sprite:vm.spriteIndex,width:sprite.width,height:sprite.height,transparent,partial,opaqueBlack});
 }
 result={erasedAlphaButRetainedRgb:erased,oldPresentationRgbMismatches:mismatches,opaquePresentationRgbMismatches:opaqueMismatches,samples,assetStats};
 host.log(JSON.stringify(result));if(erased===0||mismatches===0||opaqueMismatches!==0)throw new Error('Alpha presentation GPU diagnostic did not reproduce its expected source/copy difference');
}
globalThis.__tsstg_game={
 update(){if(frame===1)inspect();frame++;},
 render(){
  draw.reset().clear(0x080910ff).targetBegin(target,rgba);
  for(let y=0;y<192;y+=16)for(let x=0;x<256;x+=16)if(((x+y)/16)&1)draw.rect(x,y,16,16,0x71d0a4ff);
  player.draw(draw,{scale:1,screenScale:1});bullet.draw(draw,{scale:1,screenScale:1});
  draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add').sampler(synthetic,'point','clamp','clamp');
  draw.sprite(synthetic,128,144,96,64).blendEnd().targetEnd();
  draw.text('Old alpha presentation',80,70,22).text('Opaque RGB presentation',560,70,22);
  draw.sprite(target,208,216,256,192);
  draw.blendFactors('one','zero','add','zero','one','add').sprite(target,688,216,256,192).blendEnd();
  draw.text('Same original sprites / same offscreen RGBA',80,360,22);
  return draw.commands;
 },snapshot(){return result;}
};
