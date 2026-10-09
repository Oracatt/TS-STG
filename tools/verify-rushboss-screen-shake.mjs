// Real GPU evidence for the final Boss burst. The control disables only the
// third composition's camera offset; all simulation and actor drawing remain.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'build/rushboss-screen-shake');
const out=path.join(root,'reports/rushboss/screen-shake'),binary=path.join(root,'build/Release/ts-stg.exe');
fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(out,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['packages/thlib/dist/touhou/gameplay-compositor.js','packages/thlib/dist/touhou/boss-death.js',
  'packages/thlib/dist/touhou/boss-presentation.js','packages/thlib/dist/touhou/screen-shake.js',
  'games/rushboss/src/runtime.js','games/rushboss/src/shared-presentation.js','games/rushboss/src/graphics-portrait.js'];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
// Keep the rectangle above the later-layer red cancellation tails. Those
// sprites do not belong to the captured background being compared here.
const backgroundRegion={x:160,y:330,width:320,height:70};
const hudRegion={x:640,y:0,width:320,height:720};
function compareRegion(actual,control,region,dx=0,dy=0){
  assert.equal(actual.width,control.width);assert.equal(actual.height,control.height);
  let changed=0,difference=0;
  for(let y=region.y;y<region.y+region.height;y++)for(let x=region.x;x<region.x+region.width;x++){
    const a=((y+dy)*actual.width+x+dx)*4,b=(y*control.width+x)*4;let pixelChanged=false;
    for(let channel=0;channel<4;channel++){
      const delta=Math.abs(actual.rgba[a+channel]-control.rgba[b+channel]);
      difference+=delta;pixelChanged||=delta!==0;
    }
    if(pixelChanged)changed++;
  }
  return{pixels:region.width*region.height,changed,meanAbsoluteDifference:difference/(region.width*region.height*4)};
}
function source(control){return `
import {SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const host={...tsstg,playSound(){},playMusic:id=>tsstg.playMusic(id,0),setMusicVolume:id=>tsstg.setMusicVolume(id,0)};
const game=createRushPortraitGame(host,{store:new SaveStore(),startBoss:'sunny',phaseIndex:6,mode:'stage',skipDialogue:true,invincible:true});
const b=game.battle,compositor=game.graphics.compositor;
${control?'const copy=compositor._copyPlayfield;compositor._copyPlayfield=function(draw,texture){return copy.call(this,draw,texture,null);};':''}
let capture=null,commands=[],simulationFrame=0;const timing=[];
globalThis.__tsstg_game={update(){
  // Bound each host callback so QuickJS's execution watchdog stays active.
  // Both backends still execute the same 600 preparation and90 defeat ticks.
  for(let step=0;step<30&&simulationFrame<690;step++){
    if(simulationFrame===600)b.damage(1e8);
    simulationFrame++;game.update(0);
    if(simulationFrame<=600)continue;
    const frame=simulationFrame-600,presentation=b.presentation.shared,death=presentation.deaths[0];
    if([59,60,61,62,89,90].includes(frame))timing.push({frame,age:death?.cameraShake?.age??null,
      alive:death?.cameraShake?.alive??false,amplitude:death?.cameraShake?.amplitude??0,
      offset:{x:presentation.cameraOffset.x,y:presentation.cameraOffset.y}});
    if(frame===61){
      // Freeze this frame's real render commands before completing the timing
      // trace. Texture resources stay alive until the native screenshot ends.
      commands=JSON.parse(JSON.stringify(game.render()));
      capture={frame,battle:b.snapshot(),offset:{x:presentation.cameraOffset.x,y:presentation.cameraOffset.y},
        shake:death.cameraShake.snapshot(),background:game.graphics.stageArtwork.snapshot()};
    }
  }
},render:()=>commands,snapshot:()=>({capture,timing}),destroy(){game.destroy();}};
`;}
const pipe=`\\\\.\\pipe\\ts-stg-screen-shake-${process.pid}`,sockets=new Set();
const server=net.createServer(socket=>{sockets.add(socket);socket.on('data',()=>{});socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
function runNative(args){return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{cwd:root,windowsHide:true});let log='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('Native screen-shake verification timed out'));},60000);
  child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',status=>{clearTimeout(timer);resolve({status,log});});
});}
try{
  for(const backend of ['v8','quickjs']){
    const variants=[];
    for(const control of [false,true]){
      const name=`${backend}-${control?'third-pass-disabled':'actual'}`,entry=path.join(folder,name+'.js'),prefix=path.join(out,name);
      fs.writeFileSync(entry,source(control));
      const child=await runNative([path.relative(root,entry),'--root',root,'--backend',backend,'--frames','23','--benchmark',
        '--frame-stream',pipe,'--snapshot',prefix+'.json','--screenshot',prefix+'.png']);
      fs.writeFileSync(prefix+'.log',child.log);assert.equal(child.status,0,child.log);
      const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
      assert.deepEqual(state.timing.map(({frame,age})=>({frame,age})),[
        {frame:59,age:null},{frame:60,age:0},{frame:61,age:1},{frame:62,age:2},{frame:89,age:29},{frame:90,age:30}]);
      assert.deepEqual(state.timing[1].offset,{x:0,y:0});assert.equal(state.timing[2].amplitude,Math.fround(11.6));
      assert.equal(state.timing.at(-1).alive,false);assert.deepEqual(state.timing.at(-1).offset,{x:0,y:0});
      assert.ok(state.capture.offset.x||state.capture.offset.y,'Selected first shake sample must have nonzero camera movement');
      variants.push({name,state,pngSha256:sha(prefix+'.png'),image:decodeRgbaPng(fs.readFileSync(prefix+'.png'))});
    }
    const [actual,control]=variants;assert.deepEqual(actual.state,control.state,'Only third-pass presentation differs');
    const background=compareRegion(actual.image,control.image,backgroundRegion),hud=compareRegion(actual.image,control.image,hudRegion);
    assert.ok(background.changed>background.pixels*.9,'The sprite-free grass region must visibly move');
    assert.equal(hud.changed,0,'Outer HUD must remain pixel-identical');
    const expected={x:Math.round(actual.state.capture.offset.x*1.5),y:Math.round(actual.state.capture.offset.y*1.5)};
    const candidates=[];
    for(let y=expected.y-1;y<=expected.y+1;y++)for(let x=expected.x-1;x<=expected.x+1;x++)
      candidates.push({x,y,...compareRegion(actual.image,control.image,backgroundRegion,x,y)});
    const aligned=candidates.sort((a,b)=>a.meanAbsoluteDifference-b.meanAbsoluteDifference)[0];
    assert.ok(aligned.changed<aligned.pixels*.001,'Compensating camera movement must recover the same background pixels');
    results.push({backend,state:actual.state,background,hud,aligned,variants:variants.map(({image,state,...variant})=>variant)});
    console.log(`PASS ${backend}: background moved (${aligned.x},${aligned.y}) pixels, outer HUD unchanged; shake age0/1/30`);
  }
}finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
assert.deepEqual(results[0].state,results[1].state,'Native backend state parity');
assert.deepEqual(results[0].variants.map(v=>v.pngSha256),results[1].variants.map(v=>v.pngSha256),'Native backend image parity');
assert.deepEqual(hashes(),sourceHashes,'Production source changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,binarySha256:sha(binary),
  backgroundRegion,hudRegion,results,scope:'Four hidden native GPU captures of actual Rush final defeat. Same-frame third-pass-only control proves the captured 3D background moves while the outer HUD stays fixed. Source scheduler shake timing is checked through age30. This is not an original-executable GPU pixel comparison.'},null,2)+'\n');
