import {AssetLoader} from '@ts-stg/thlib';
const native=globalThis.tsstg,loader=new AssetLoader(native),host=loader.host;
const expect=(ok,message)=>{if(!ok)throw Error(message);};
let unsafe=false;try{native.loadResourceAsync('texture','../escape.png');}catch{unsafe=true;}expect(unsafe,'path traversal rejected');
let invalid=false;try{native.loadResourceAsync('script','native/tests/models/cube.glb');}catch{invalid=true;}expect(invalid,'resource kind rejected');
const cancelled=native.loadResourceAsync('model','native/tests/models/cube.glb');native.cancelResourceLoad(cancelled);
const batch=loader.preload([{kind:'model',path:'native/tests/models/cube.glb'},
  {kind:'sound',path:'packages/thlib/assets/touhou-common/audio/se_bonus.wav'},
  {kind:'music',path:'packages/thlib/assets/touhou-common/audio/se_bonus.wav'},
  {kind:'texture',path:'packages/thlib/assets/touhou-common/textures/bullet/entry-0.png'}]);
let done=false,frames=0,failed=null,texture=null;
globalThis.__tsstg_game={
 update(){frames++;
  if(!batch.done){batch.update();return;}if(batch.error)throw batch.error;
  if(!failed){
    const sound=host.loadSound('packages/thlib/assets/touhou-common/audio/se_bonus.wav');host.playSound(sound,0);host.stopSound(sound);host.unloadSound(sound);
    const music=host.loadMusic('packages/thlib/assets/touhou-common/audio/se_bonus.wav');host.setMusicLoop(music,0,.1);host.playMusic(music,0);host.seekMusic(music,0);host.stopMusic(music);host.unloadMusic(music);
    const model=host.loadModel('native/tests/models/cube.glb');expect(host.modelInfo(model).triangles===12,'async model topology');host.unloadModel(model);
    texture=host.loadTexture('packages/thlib/assets/touhou-common/textures/bullet/entry-0.png');
    const pixels=host.readTexturePixels(texture);expect(pixels.width===256&&pixels.pixels.some(x=>x),'async texture pixels');host.unloadTexture(texture);
    failed=loader.preload([{kind:'model',path:'native/tests/models/invalid-accessor.glb'}]);
  }
  failed.update();if(!failed.done)return;expect(!!failed.error,'invalid worker decode reported');
  expect(loader.synchronousMisses===0,'no synchronous fallback');loader.dispose();done=true;native.quit();
 },
 render(){return [['clear',0x18232cff],['circle',480+Math.sin(frames*.1)*100,360,12,0xffca67ff]];},
 snapshot(){expect(done,'async test must finish within frame limit');return{done,frames};}
};
