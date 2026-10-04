const check=(condition,message)=>{if(!condition)throw Error(message);};
const rejects=(fn)=>{let caught=false;try{fn();}catch{caught=true;}check(caught,'Invalid region accepted');};
const width=7,height=6,initial=new Uint8Array(width*height*4);for(let i=0;i<initial.length;i++)initial[i]=(i*37+17)&255;
const region=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,128,64,32,16]);
const expected=initial.slice();for(let y=0;y<2;y++)expected.set(region.slice(y*8,(y+1)*8),((y+1)*width+3)*4);
const textures=[tsstg.createTexture(width,height,initial),tsstg.createRenderTarget(width,height)];
for(const id of textures){
 tsstg.updateTexture(id,initial);tsstg.updateTextureRegion(id,3,1,2,2,region);
 const result=tsstg.readTexturePixels(id);check(result.width===width&&result.height===height,'Region changed dimensions');
 check(result.pixels.every((value,index)=>value===expected[index]),'Region overwrote other pixels or flipped a row');
 rejects(()=>tsstg.updateTextureRegion(id,6,0,2,2,region));rejects(()=>tsstg.updateTextureRegion(id,0,-1,2,2,region));
 rejects(()=>tsstg.updateTextureRegion(id,0,0,2,2,new Uint8Array(15)));rejects(()=>tsstg.updateTextureRegion(id,0,0,0,2,region));
 rejects(()=>tsstg.updateTextureRegion(id,.5,0,2,2,region));
}
const id=textures[1];tsstg.unloadTexture(id);rejects(()=>tsstg.updateTextureRegion(id,0,0,2,2,region));
let frame=0;globalThis.__tsstg_game={update(){frame++;},render(){return[['clear',0x000000ff],['sprite',textures[0],100,100,width*20,height*20,0,0xffffffff]];},snapshot(){return{frame,textureRegion:true,expected:Array.from(expected)};}};
