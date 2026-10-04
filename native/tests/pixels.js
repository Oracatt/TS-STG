// RGBA subarray offsets, target orientation, transparent padding and explicit resource lifetimes.
const equal=(actual,expected)=>{if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw new Error(`Pixel mismatch: ${actual} != ${expected}`);};
const rejects=action=>{let failed=false;try{action();}catch{failed=true;}if(!failed)throw new Error('Expected invalid resource/API rejection');};
const memory=new Uint8Array(24);memory.set([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255],4);
const pixels=memory.subarray(4,20),texture=tsstg.createTexture(2,2,pixels),target=tsstg.createRenderTarget(2,2);
equal(tsstg.readTexturePixels(texture).pixels,pixels);tsstg.updateTexture(target,pixels);equal(tsstg.readTexturePixels(target).pixels,pixels);
const reversed=new Uint8ClampedArray(pixels).reverse();tsstg.updateTexture(texture,reversed);equal(tsstg.readTexturePixels(texture).pixels,reversed);tsstg.updateTexture(texture,pixels);
const loaded=tsstg.loadTexture('native/tests/assets/checker.bmp',4,4),padded=tsstg.readTexturePixels(loaded);
if(padded.width!==4||padded.height!==4)throw new Error('Padded extent mismatch');equal(padded.pixels.subarray(12*4),new Uint8Array(16));
tsstg.unloadTexture(loaded);rejects(()=>tsstg.readTexturePixels(loaded));rejects(()=>tsstg.unloadTexture(loaded));
rejects(()=>tsstg.createTexture(2,2,new Uint8Array(15)));rejects(()=>tsstg.updateTexture(texture,new Uint8Array(17)));rejects(()=>tsstg.createTexture(0,2,pixels));rejects(()=>tsstg.createTexture(1,1,new Float32Array(4)));
for(let i=0;i<64;i++){
 const id=tsstg.createRenderTarget(8,8);tsstg.unloadTexture(id);rejects(()=>tsstg.updateTexture(id,new Uint8Array(256)));
 const sound=tsstg.loadSound('packages/thlib/assets/audio/shot.wav');tsstg.unloadSound(sound);rejects(()=>tsstg.playSound(sound));
 const music=tsstg.loadMusic('packages/thlib/assets/audio/shot.wav');tsstg.setMusicLoop(music,.005,.02);tsstg.unloadMusic(music);rejects(()=>tsstg.getMusicTime(music));
}
let frame=0;
globalThis.__tsstg_game={update(){frame++;},render(){return [['clear',0x151820ff],['sprite',texture,150,150,200,200,0,0xffffffff],['sprite',target,400,150,200,200,0,0xffffffff]];},snapshot(){tsstg.unloadTexture(texture);tsstg.unloadTexture(target);rejects(()=>tsstg.readTexturePixels(texture));return{frame,released:true};}};
