// Generic prebuilt command streams isolate actual QuickJS decoding and native
// quad submission. No game simulation or per-frame drawing allocations.
const texture=tsstg.loadTexture('native/tests/assets/checker.bmp');
const state=Object.freeze([1/255,'srcAlpha','oneMinusSrcAlpha','add','one','zero','add','point','clamp','clamp']);
const corners=Object.freeze([0,0,10,0,0,16,10,16]);
const expanded=[['clear',0x182331ff]],compact=[['clear',0x182331ff]],count=2000;
for(let i=0;i<count;i++){
  const args=[texture,corners,10+(i%64)*14,10+Math.floor(i/64)*20,1,0,0,0,0,1,1,0xffffffff,0xffffffff,0xffffffff,0xffffffff,false];
  expanded.push(['alphaTest',state[0]],['blendFactors',...state.slice(1,7)],['sampler',texture,...state.slice(7)],['quad',...args],['blendEnd'],['alphaTest',0]);
  compact.push(['statefulQuad',...args,state]);
}
let frame=0,useCompact=false;
globalThis.__tsstg_game={update(mask){frame++;useCompact=!!(mask&1);},render:()=>useCompact?compact:expanded,snapshot:()=>({frame,sprites:count})};
