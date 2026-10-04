const check=(condition,message)=>{if(!condition)throw Error(message);};
const rejects=(fn,part)=>{let thrown=false;try{fn();}catch(error){thrown=String(error).includes(part);}check(thrown,`Expected text error: ${part}`);};
const layouts=[],textures=[];
function layout(horizontalAlign='left',verticalAlign='top',text='STG'){
  const id=tsstg.createTextLayout(text,{fontFamily:'Arial',fontSize:20,locale:'en-us',width:120,height:70,horizontalAlign,verticalAlign});layouts.push(id);return id;
}
function raster(id,options={}){
  const image=tsstg.rasterizeTextLayout(id,{width:180,height:160,x:20,y:20,...options});
  if(image.texture)textures.push(image.texture);return image;
}
const leading=layout(),trailing=layout('right','bottom');
const fill=raster(leading),aligned=raster(trailing);
check(fill.texture&&fill.width>0&&fill.height>0,'DirectWrite generated no glyph pixels');
check(aligned.x>fill.x+30&&aligned.y>fill.y+30,'DirectWrite trailing/far layout was not applied');
const repeated=raster(leading),first=tsstg.readTexturePixels(fill.texture),second=tsstg.readTexturePixels(repeated.texture);
check(first.width===fill.width&&first.height===fill.height,'Text crop metadata differs from texture');
check(first.pixels.length===second.pixels.length&&first.pixels.every((value,index)=>value===second.pixels[index]),'Repeated text raster pixels changed');
const outline=raster(leading,{outline:0x000000ff,strokeWidth:4});
const scaledFill=raster(leading,{scale:2}),scaledOutline=raster(leading,{scale:2,outline:0x000000ff,strokeWidth:4});
check(outline.width>fill.width&&outline.height>fill.height,'Vector outline did not extend glyph geometry');
check(scaledFill.width>fill.width*1.8,'Glyph transformation scale was ignored');
const padding=outline.width-fill.width,scaledPadding=scaledOutline.width-scaledFill.width;
check(Math.abs(padding-scaledPadding)<=2,'Outline width scaled with glyphs instead of remaining in output pixels');
const raw=raster(leading,{fill:0xff408080,premultiplied:true}),straight=raster(leading,{fill:0xff408080});
const rawPixels=tsstg.readTexturePixels(raw.texture).pixels,straightPixels=tsstg.readTexturePixels(straight.texture).pixels;
let partial=false;
for(let i=0;i<rawPixels.length;i+=4){
  const alpha=rawPixels[i+3];check(rawPixels[i]<=alpha&&rawPixels[i+1]<=alpha&&rawPixels[i+2]<=alpha,'Premultiplied glyph channels exceed alpha');
  if(alpha>0&&alpha<255&&straightPixels[i]>rawPixels[i])partial=true;
}
check(partial,'Straight/premultiplied text conversion was not exercised');
const empty=layout('left','top',''),emptyRaster=raster(empty);
check(emptyRaster.texture===0&&emptyRaster.width===0&&emptyRaster.height===0,'Empty text allocated a nonempty texture');
const offscreen=raster(leading,{x:10000});check(offscreen.texture===0,'Target clipping failed for offscreen text');
rejects(()=>tsstg.createTextLayout('x',{fontFamily:'TS-STG Missing Font 019373'}),'unavailable');
rejects(()=>tsstg.createTextLayout('x',{fontSize:0}),'fontSize');
rejects(()=>raster(leading,{strokeWidth:-1}),'strokeWidth');
rejects(()=>raster(leading,{premultiplied:1}),'boolean');
rejects(()=>raster(leading,{width:12.5}),'width');
for(const id of layouts)tsstg.destroyTextLayout(id);
rejects(()=>raster(leading),'Unknown text layout');rejects(()=>tsstg.destroyTextLayout(leading),'Unknown text layout');
check(tsstg.readTexturePixels(fill.texture).width===fill.width,'Destroying a layout incorrectly destroyed its independent texture');
tsstg.unloadTexture(repeated.texture);rejects(()=>tsstg.readTexturePixels(repeated.texture),'Unknown');
let frame=0;
globalThis.__tsstg_game={
  update(){frame++;},
  render(){return [['clear',0x223344ff],['sprite',fill.texture,150,80,fill.width,fill.height,0,0xffffffff],['sprite',outline.texture,150,170,outline.width,outline.height,0,0xffffffff],['sprite',scaledOutline.texture,150,260,scaledOutline.width,scaledOutline.height,0,0xffffffff]];},
  snapshot(){return {frame,vectorText:true,fill:{x:fill.x,y:fill.y,width:fill.width,height:fill.height},trailing:{x:aligned.x,y:aligned.y,width:aligned.width,height:aligned.height},outlinePadding:padding,scaledOutlinePadding:scaledPadding};},
};
