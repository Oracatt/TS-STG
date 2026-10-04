// Identical native submission workload for before/after executables: no STG
// behavior, no per-frame JS allocations, and no alphaTest ABI dependency.
const texture=tsstg.loadTexture('native/tests/assets/checker.bmp');
const commands=[['clear',0x182331ff]],count=2000,indices=[0,1,2,0,2,3];
for(let i=0;i<count;i++){
  const x=10+(i%64)*14,y=10+Math.floor(i/64)*20;
  commands.push(['sampler',texture,'point','clamp','clamp'],
    ['blendFactors','srcAlpha','oneMinusSrcAlpha','add','one','zero','add'],
    ['mesh',texture,[[x,y,0,0,0xffffffff],[x+10,y,1,0,0xffffffff],[x+10,y+16,1,1,0xffffffff],[x,y+16,0,1,0xffffffff]],indices],
    ['blendEnd']);
}
let frame=0;
globalThis.__tsstg_game={update(){frame++;},render:()=>commands,snapshot:()=>({frame,sprites:count,commands:commands.length})};
