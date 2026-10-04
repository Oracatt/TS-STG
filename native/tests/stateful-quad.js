// The input mask selects the compact or expanded form of the same generic
// drawing stream. GPU comparisons must produce identical images and state.
const pixels=new Uint8Array([
  255,0,0,255, 0,255,0,80, 0,0,255,0,
  255,255,0,200, 255,0,255,255, 0,255,255,130,
  255,255,255,255, 30,40,60,120, 0,0,0,255,
]);
const texture=tsstg.createTexture(3,3,pixels),target=tsstg.createRenderTarget(90,90);
const states=[
  [1/255,'srcAlpha','oneMinusSrcAlpha','add','one','zero','add','point','clamp','clamp'],
  [.4,'srcAlpha','one','add','one','zero','add','bilinear','wrap','mirror'],
  [0,'one','zero','add','one','zero','add','point','mirror','wrap'],
  [.2,'dstColor','oneMinusSrcAlpha','add','srcAlpha','oneMinusSrcAlpha','add','bilinear','clamp','clamp'],
];
let frame=0,compact=false;
function append(commands,id,x,y,state,snap=false,scale=1){
  const args=[id,[-5,-7,54,-3,-1,44,48,49],x,y,scale,0,0,-.2,-.1,1.4,1.3,0xffc0aaff,0xaaffffff,0xffffffff,0xbbddaaff,snap];
  if(compact)commands.push(['statefulQuad',...args,state]);
  else{
    commands.push(['alphaTest',state[0]],['blendFactors',...state.slice(1,7)]);
    if(id)commands.push(['sampler',id,...state.slice(7)]);
    commands.push(['quad',...args],['blendEnd'],['alphaTest',0]);
  }
}
globalThis.__tsstg_game={
  update(mask){frame++;compact=!!(mask&1);},
  render(){
    const commands=[['clear',0x223344ff],['targetBegin',target,0]];
    append(commands,texture,20,19,states[2],true);
    commands.push(['targetEnd'],['scissor',13,11,890,650]);
    for(let i=0;i<24;i++)append(commands,i===22?0:i===23?target:texture,36+i%8*108,32+Math.floor(i/8)*125,states[i%states.length],!!(i&1),1+(i%3)*.13);
    // Ordinary drawing after a scoped quad must have alpha blending and no
    // fragment cutoff, and target texture orientation must remain unchanged.
    commands.push(['rect',27,451,450,36,0xf0678955],['quad',texture,[0,0,90,0,0,50,90,50],535,445,1,0,0,0,0,1,1,0xffffffff,0xffffffff,0xffffffff,0xffffffff,false],['scissorEnd']);
    return commands;
  },
  snapshot(){return {frame,quads:26,states:states.length};},
};
