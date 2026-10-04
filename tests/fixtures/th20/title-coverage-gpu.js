// Actual title scene coverage, not quad-versus-mesh equality: both paths once
// shared a lost-triangle bug. Read frame 300 on the following update, before
// any further scene update, and compare opaque source artwork with the canvas.
globalThis.__TH20_DEMO_OPTIONS={musicVolume:0};
await import('../../../games/touhou20/main.js');
const host=globalThis.tsstg,game=globalThis.__tsstg_game;
const data=JSON.parse(host.readText('games/touhou20/assets/anm/title.json'));
const sprite=data.sprites[1],entry=data.entries[sprite.entry];
// Original title script30: sprite1, layer30, position850/440, scale mode2.
// At screenScale1.5 with source pixel snapping its rectangle is these corners.
const rect={left:322.5,top:-31.5,right:951.5,bottom:690.5};
const samples=[
  {name:'face-first-triangle',source:[475,345],triangle:0},
  {name:'red-chest-second-triangle',source:[455,470],triangle:1},
  {name:'red-skirt-second-triangle',source:[470,600],triangle:1},
  {name:'lower-skirt-second-triangle',source:[455,655],triangle:1},
  {name:'right-shoe-second-triangle',source:[540,930],triangle:1},
];
const pixel=(image,x,y)=>Array.from(image.pixels.slice((y*image.width+x)*4,(y*image.width+x)*4+4));
let renderedFrames=0,simulationFrames=0,result=null;
function inspect(){
  const canvas=host.readTexturePixels(0);
  const id=host.loadTexture(entry.texture.path),source=host.readTexturePixels(id);
  try{
    if(canvas.width!==960||canvas.height!==720)throw Error('Title coverage requires the original 960x720 canvas');
    if(sprite.width!==838||sprite.height!==963)throw Error('Unexpected original title_ch00 sprite dimensions');
    const checks=samples.map(sample=>{
      const [sx,sy]=sample.source;
      const x=Math.round(rect.left+(sx+.5)*(rect.right-rect.left)/sprite.width-.5);
      const y=Math.round(rect.top+(sy+.5)*(rect.bottom-rect.top)/sprite.height-.5);
      const expected=pixel(source,sx,sy),actual=pixel(canvas,x,y);
      const opaque=expected[3]===255,error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));
      return{...sample,canvas:[x,y],expected,actual,tolerance:2,opaque,maxChannelError:error,passed:opaque&&error<=2};
    });
    result={format:'ts-stg-th20-title-coverage-v1',checkedFrame:300,width:canvas.width,height:canvas.height,
      sourceTexture:entry.texture.path,sourceTextureSha256:entry.texture.sha256,rect,checks,
      passed:checks.every(check=>check.passed)};
  }finally{host.unloadTexture(id);}
}
globalThis.__tsstg_game={
  update(){if(renderedFrames===300&&!result)inspect();if(renderedFrames<300){game.update(0);simulationFrames++;}},
  render(){const commands=game.render();renderedFrames++;return commands;},
  snapshot(){return{...result,renderedFrames,simulationFrames,scene:game.snapshot()};},
};
