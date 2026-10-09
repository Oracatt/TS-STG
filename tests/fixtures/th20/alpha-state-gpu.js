import {DrawList} from '../../../packages/thlib/dist/render.js';
const host=globalThis.tsstg,draw=new DrawList(),target=host.createRenderTarget(320,128);
const texture=host.createTexture(4,1,new Uint8Array([240,32,80,0,240,32,80,1,240,32,80,2,240,32,80,128]));
const blendTexture=host.createTexture(1,1,new Uint8Array([64,160,224,128]));
let frame=0,result={};
const rgba=(image,x,y)=>Array.from(image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
function inspect(){
 const pixels=host.readTexturePixels(target),background=[64,128,192,255];let checks=0;
 const check=(actual,expected,tolerance,label)=>{checks++;if(actual.some((v,i)=>Math.abs(v-expected[i])>tolerance))throw new Error(`${label}: ${actual} != ${expected}`);};
 const alpha0=rgba(pixels,32,16),alpha1=rgba(pixels,96,16),alpha2=rgba(pixels,160,16),alpha128=rgba(pixels,224,16);
 check(alpha0,background,0,'alpha zero rejected');check(alpha1,[65,128,192,1],1,'alpha one accepted');check(alpha2,[65,127,191,2],1,'alpha two accepted');
 check(alpha128,[152,80,136,128],1,'source over color / replace alpha');
 const multiplied1=rgba(pixels,96,48),multiplied2=rgba(pixels,160,48);
 check(multiplied1,background,0,'texture alpha1 times tint alpha128 rejected below1');check(multiplied2,[65,128,192,1],1,'texture alpha2 times tint alpha128 accepted');
 const replace0=rgba(pixels,32,80);check(replace0,[240,32,80,0],0,'replace mode disables alpha test');
 const blend6=rgba(pixels,288,16);check(blend6,[80,124,123,128],1,'original inverse-source-color/inverse-source-alpha');
 result={checks,alpha0,alpha1,alpha2,alpha128,multiplied1,multiplied2,replace0,blend6};host.log(JSON.stringify(result));
}
globalThis.__tsstg_game={update(){if(frame===1)inspect();frame++;},render(){
 draw.reset().clear(0x202028ff).targetBegin(target,0x4080c0ff).sampler(texture,'point','clamp','clamp');
 draw.alphaTest(1/255).blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add');
 draw.sprite(texture,128,16,256,32).sprite(texture,128,48,256,32,0,0xffffff80).blendEnd();
 draw.alphaTest(0).blendFactors('one','zero','add','one','zero','add').sprite(texture,128,80,256,32).blendEnd();
 draw.alphaTest(1/255).blendFactors('oneMinusSrcColor','oneMinusSrcAlpha','add','one','zero','add').sampler(blendTexture,'point','clamp','clamp').sprite(blendTexture,288,16,64,32).blendEnd().alphaTest(0);
 draw.targetEnd().blendFactors('one','zero','add','zero','one','add').sprite(target,480,280,640,256).blendEnd();
 draw.text('Original alpha-test and blend-mode GPU regression',100,90,24);return draw.commands;
},snapshot(){return result;}};
