const texture=tsstg.createTexture(2,2,new Uint8Array([255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255]));
// clip.w=z; C has four times A/B's W. At (250,403), affine V=.6
// would be blue while perspective-correct V~.27 samples the red top row.
const vertices=[[-.8,.6,1,0,0,0xffffffff],[.8,.6,1,1,0,0xffffffff],[-3.2,-2.4,4,0,1,0xffffffff]];
const mvp=[1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0];let frame=0;
globalThis.__tsstg_game={update(){frame++;},render(){return[
  ['clear',0x000000ff],['sampler',texture,'point','clamp','clamp'],['mesh3d',texture,vertices,[0,1,2],mvp],
  ['rect',850,10,80,80,0x00ff00ff]
];},snapshot(){return{frame,projected:true};}};
