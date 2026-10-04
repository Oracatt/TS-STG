// SPDX-License-Identifier: GPL-3.0-only
// CardBackground.h SpellCardText composition. Fonts are system resources through
// the native platform's DWrite/D2D layout API; original HUD skin remains business.
import {withAlpha} from '@ts-stg/thlib';
const S=1.5;
const region=(draw,assets,rect,x,y,w,h,alpha=1)=>draw.spriteRegion(assets.texture('src_ascii'),...rect,x+320,240-y,w,h,0,withAlpha(0xffffffff,alpha));
export class RushSpellBanner {
  constructor(host,assets) {this.host=host;this.assets=assets;this.target=host.createRenderTarget(640,480);this.layouts=new Map();this.rasters=new Map();}
  raster(name,age,scale) {
    const step=Math.min(25,Math.max(0,age)),key=`${name}/${step}`;
    if(!this.layouts.has(name))this.layouts.set(name,this.host.createTextLayout(name,{fontFamily:'宋体',fontSize:20,locale:'zh-cn',width:300,height:50,horizontalAlign:'right',verticalAlign:'bottom'}));
    if(!this.rasters.has(key))this.rasters.set(key,{name,...this.host.rasterizeTextLayout(this.layouts.get(name),{width:640,height:480,x:615,y:405,layoutX:-300,layoutY:-50,scale,rotation:0,fill:0xffffffff,outline:0x000000ff,strokeWidth:4,premultiplied:true})});
    return this.rasters.get(key);
  }
  digits(draw,value,x,y,alpha=1,places=0) {
    let str=String(Math.max(0,Math.min(99999999,Math.trunc(value)))).padStart(places,'0');
    if(places)str=str.slice(-places);
    for(let i=0;i<str.length;i++)region(draw,this.assets,[Number(str[i])*16,320,16,18],x+(i+1)*8.5,y,10,11.125,alpha);
    return x+str.length*8.5;
  }
  history(battle,phase) {
    // The source skin has a fixed three-digit capture history field. Applications
    // may provide persisted counters; the demo maintains this session's results.
    const supplied=battle.spellHistory?.[`${phase.cardId}/${battle.difficulty}`];if(supplied)return supplied;
    const results=battle.results.filter(r=>r.cardId===phase.cardId);return{got:results.filter(r=>r.captured).length,total:results.length};
  }
  draw(draw,effects,battle) {
    for(const card of effects.cards){
      const f=card.age;if(f<1)continue;
      draw.sampler(this.assets.texture('src_ascii'),'anisotropic4x','wrap','wrap');
      draw.targetBegin(this.target,0);const text=this.raster(card.phase.name,f,card.textScale),textAlpha=f<=10?card.compositeAlpha:card.opacity;
      draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
      const n=Math.min(20,Math.max(0,f-15));region(draw,this.assets,[0,390,512,90],140,-180+n,384,67.5,card.backAlpha);
      draw.blendEnd();
      if(text.texture&&text.width&&text.height){draw.blendFactors('one','oneMinusSrcAlpha','add','one','oneMinusSrcAlpha','add');
        draw.sprite(text.texture,text.x+text.width/2,text.y+text.height/2,text.width,text.height,0,0xffffffff);draw.blendEnd();}
      if(f>=60){
        draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');
        const labels=card.labelAlpha,h=this.history(battle,card.phase);
        region(draw,this.assets,[6,364,57,19],80,-180,57*.65,19*.65,labels);
        region(draw,this.assets,[189,364,62,19],200,-180,62*.65,19*.65,labels);
        if(battle.captureFailed)region(draw,this.assets,[288,365,61,18],124,-180,30.5*1.25,11.125);
        else this.digits(draw,battle.spellBonus,100,-180);
        let x=this.digits(draw,h.got,222,-180,1,3);x+=8.5;region(draw,this.assets,[160,320,16,18],x,-180,10,11.125);this.digits(draw,h.total,x,-180,1,3);
        draw.blendEnd();
      }
      draw.targetEnd();draw.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','one','add');draw.sprite(this.target,480+card.slideX*S,360-card.slideY*S,960,720,0,withAlpha(0xffffffff,textAlpha));draw.blendEnd();
    }
    const live=new Set(effects.cards.map(c=>c.phase.name));
    for(const [key,raster]of this.rasters)if(!live.has(raster.name)){if(raster.texture)this.host.unloadTexture(raster.texture);this.rasters.delete(key);}
    for(const [name,id]of this.layouts)if(!live.has(name)){this.host.destroyTextLayout(id);this.layouts.delete(name);}
  }
  clear() {for(const r of this.rasters.values())if(r.texture)this.host.unloadTexture(r.texture);for(const id of this.layouts.values())this.host.destroyTextLayout(id);this.rasters.clear();this.layouts.clear();}
  dispose() {this.clear();this.host.unloadTexture(this.target);}
}
