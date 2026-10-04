// Exercise raw generic commands independently of thlib's fast-path selection.
// Each pair renders identical geometry to separate targets and compares RGBA.
const f=Math.fround, size=96, pairs=[];
const texture=tsstg.createTexture(4,4,new Uint8Array([
  255,0,0,255, 0,255,0,128, 0,0,255,0, 255,255,0,255,
  0,255,255,255, 255,0,255,64, 255,255,255,255, 20,40,80,255,
  0,30,90,255, 120,70,20,255, 90,50,230,255, 40,210,150,255,
  255,127,0,255, 80,150,200,255, 240,90,40,255, 16,32,64,255,
]));
const sourceTarget=tsstg.createRenderTarget(16,16);
function mesh(q){
  const [kind,id,local,x,y,scale,vx,vy,u0,v0,u1,v1,...tail]=q;
  const snap=tail[4],points=[];
  for(let i=0;i<4;i++){
    let px=f(f(vx)+f(f(f(x)+f(local[i*2]))*f(scale)));
    let py=f(f(vy)+f(f(f(y)+f(local[i*2+1]))*f(scale)));
    if(snap){px=f(f(Math.sign(px)*Math.floor(Math.abs(px)+.5))-.5);py=f(f(Math.sign(py)*Math.floor(Math.abs(py)+.5))-.5);}
    points.push([px,py,f(i&1?u1:u0),f(i>>1?v1:v0),tail[i]]);
  }
  return ['mesh',id,points,[0,1,2,1,3,2]];
}
for(let i=0;i<24;i++){
  const angle=f(i*.317),c=f(Math.cos(angle)),s=f(Math.sin(angle)),local=[];
  for(let corner=0;corner<4;corner++){const x=corner&1?22:-22,y=corner>>1?17:-17;local.push(f(f(x*c)-f(y*s)),f(f(y*c)+f(x*s)));}
  const scale=f(i%5===0?-.75:1.125);
  const quad=['quad',i%3===0?0:i%3===1?texture:sourceTarget,local,f(48/scale+(i%4)*.25),f(48/scale-(i%3)*.5),scale,f(.25),f(-.125),-.25,0,1.25,1,0xff0000ff,0x00ff00a0,0x0000ff50,0xffffff00,!!(i&1)];
  pairs.push({quad,mesh:mesh(quad),left:tsstg.createRenderTarget(size,size),right:tsstg.createRenderTarget(size,size)});
}
let frame=0,compared=0;
globalThis.__tsstg_game={
  update(){
    if(frame===1){for(const pair of pairs){const a=tsstg.readTexturePixels(pair.left),b=tsstg.readTexturePixels(pair.right);
      for(let i=0;i<a.pixels.length;i++)if(a.pixels[i]!==b.pixels[i])throw new Error(`Quad RGBA differs case ${compared} byte ${i}: ${a.pixels[i]} != ${b.pixels[i]}`);
      compared++;
    }}frame++;
  },
  render(){
    const out=[['clear',0x172131ff],['targetBegin',sourceTarget,0x80402080],['rect',0,0,16,8,0x10b0fffe],['rect',0,8,8,8,0xff10807f],['targetEnd']];
    for(let i=0;i<pairs.length;i++){const p=pairs[i];for(const [target,draw] of [[p.left,p.mesh],[p.right,p.quad]]){
      out.push(['targetBegin',target,0x274767ff],['alphaTest',i%4?1/255:0]);
      if(p.quad[1])out.push(['sampler',p.quad[1],i&2?'bilinear':'point',i&4?'mirror':'wrap','clamp']);
      out.push(['blendFactors',i%4===0?'one':'srcAlpha',i%4===0?'zero':i%4===1?'one':'oneMinusSrcAlpha',i%4===3?'reverseSubtract':'add','one','zero','add'],draw,['blendEnd'],['targetEnd']);
    }
    out.push(['alphaTest',0],['sprite',p.right,64+(i%8)*116,80+Math.floor(i/8)*200,size,size,0,0xffffffff]);}
    return out;
  },
  snapshot(){return {frame,cases:compared,rgbaBytesCompared:compared*size*size*4,textureKinds:['untextured','uploaded','renderTarget'],snap:true,mirrorScale:true,perVertexColors:true,alphaTest:true,blend:true,sampler:true};}
};
