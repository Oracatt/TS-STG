// Generic GPU contract: logical reads/writes and draw coordinates must be
// identical at native window density. No game assets or rules are involved.
const host=globalThis.tsstg,target=host.createRenderTarget(960,720),small=host.createRenderTarget(37,29);
function check(value,message){if(!value)throw new Error(message);}
const white=new Uint8Array(960*720*4).fill(255);
host.updateTexture(target,white);
host.updateTextureRegion(target,0,0,10,10,new Uint8Array(10*10*4).fill(0));
const initial=host.readTexturePixels(target);
check(initial.width===960&&initial.height===720&&initial.pixels.length===white.length&&initial.pixels[0]===0&&initial.pixels[(100*960+100)*4]===255,
  'Full-canvas target writes and readback must retain logical pixel dimensions');
const smallPixels=new Uint8Array(37*29*4).fill(255);
host.updateTexture(small,smallPixels);
host.updateTextureRegion(small,36,28,1,1,new Uint8Array([1,2,3,4]));
const exact=host.readTexturePixels(small);
check(exact.width===37&&exact.height===29&&Array.from(exact.pixels.slice(-4)).join()=== '1,2,3,4',
  'Arbitrary targets must retain exact sizes, edge writes and top-down orientation');
const disposable=host.createRenderTarget(960,720);host.unloadTexture(disposable);
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
globalThis.__tsstg_game={update(){},render(){return [
  ['clear',0x000000ff],
  ['targetBegin',target,0x000000ff],['scissor',100,100,200,200],['rect',0,0,960,720,0xff0000ff],['scissorEnd'],['targetEnd'],
  ['spriteRegion',target,100,100,200,200,400,300,200,200,0,0xffffffff],
  ['scissor',10,10,40,40],['rect',0,0,960,720,0x00ff00ff],['scissorEnd'],
  ['mesh3d',0,[[-.8,-.8,0,0,0,0x0000ffff],[-.6,-.8,0,1,0,0x0000ffff],[-.8,-.6,0,0,1,0x0000ffff]],[0,1,2],identity],
  ['targetBegin',small,0x000000ff],['scissor',10,10,10,10],['rect',0,0,37,29,0x00ffffff],['scissorEnd'],['targetEnd'],
  ['sprite',small,700,300,74,58,0,0xffffffff],
  ['rect',800,100,10,10,0xff00ffff],
];},snapshot(){
  const image=host.readTexturePixels(0),pixel=(x,y)=>Array.from(image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+3));
  // Readbacks downsample. Keep probes clear of the edge reconstruction kernel.
  const samples=[[20,20,[0,255,0]],[60,20,[0,0,0]],[400,300,[255,0,0]],[294,300,[0,0,0]],
    [506,300,[0,0,0]],[110,630,[0,0,255]],[693,301,[0,255,255]],[675,301,[0,0,0]],[805,105,[255,0,255]]];
  check(image.width===960&&image.height===720,'Canvas readback must remain 960x720');
  for(const [x,y,rgb] of samples)check(pixel(x,y).every((value,i)=>Math.abs(value-rgb[i])<=2),
    `Scaled clipping, region sampling, target switching or mesh position at ${x},${y}: ${pixel(x,y)}`);
  const offscreen=host.readTexturePixels(target),tiny=host.readTexturePixels(small);
  check(offscreen.width===960&&offscreen.height===720&&tiny.width===37&&tiny.height===29,'Target dimensions changed after drawing');
  return{passed:true,width:image.width,height:image.height,samples:samples.map(([x,y])=>pixel(x,y))};
}};
