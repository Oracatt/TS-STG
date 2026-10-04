// Independent expected-color assertions: comparing mesh with quad alone can
// miss a batching defect shared by both command paths.
const red=tsstg.createTexture(1,1,new Uint8Array([255,0,0,255]));
const blue=tsstg.createTexture(1,1,new Uint8Array([0,0,255,255]));
const target=tsstg.createRenderTarget(4,4);
const white=0xffffffff,rect=(id,x,y)=>['mesh',id,[[x,y,0,0,white],[x+64,y,1,0,white],[x,y+64,0,1,white],[x+64,y+64,1,1,white]],[0,1,2,1,3,2]];
const quad=(id,x,y)=>['quad',id,[0,0,64,0,0,64,64,64],x,y,1,0,0,0,0,1,1,white,white,white,white,false];
const sourceColors=new Map([[red,[255,0,0,255]],[blue,[0,0,255,255]],[target,[255,204,0,255]],[0,[255,255,255,255]]]);
const rectangles=[],commands=[];
for(const [row,make]of [[0,rect],[1,quad]])for(const [column,id]of [red,blue,red,blue,target,0].entries()){
 const x=20+column*80,y=20+row*100;commands.push(make(id,x,y));rectangles.push({x,y,expected:sourceColors.get(id)});
}
// Cross between raylib's indexed quads and our triangle lists in the same
// batch; there are no sampler/blend/target changes here to hide the defect.
commands.push(['sprite',red,52,252,64,64,0,white],rect(blue,100,220),quad(target,180,220),['rect',260,220,64,64,0xff00ffff]);
for(const [x,expected]of [[20,sourceColors.get(red)],[100,sourceColors.get(blue)],[180,sourceColors.get(target)],[260,[255,0,255,255]]])rectangles.push({x,y:220,expected});
let frame=0,checked=0;
globalThis.__tsstg_game={
 update(){
  if(frame===1){const {width,pixels}=tsstg.readTexturePixels();
   for(const {x,y,expected}of rectangles)for(let py=y+1;py<y+63;py++)for(let px=x+1;px<x+63;px++){
    const offset=(py*width+px)*4;
    for(let channel=0;channel<4;channel++)if(pixels[offset+channel]!==expected[channel])throw new Error(`Missing mesh coverage at ${px},${py}: RGBA ${Array.from(pixels.subarray(offset,offset+4))}; expected ${expected}`);
    checked++;
   }
  }frame++;
 },
 render(){return [['clear',0x173149ff],['targetBegin',target,0xffcc00ff],['targetEnd'],...commands];},
 snapshot(){if(checked!==rectangles.length*62*62)throw new Error('Expected-color coverage assertions were not executed');return {frame,rectangles:rectangles.length,opaqueInteriorPixels:checked,expectedColors:true,paths:['mesh','quad','sprite','rect'],sources:['uploaded','renderTarget','untextured']};}
};
