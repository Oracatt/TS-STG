import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {SaveStore,Keys} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../games/rushboss/src/portrait-application.js';
import {TouhouMusicCaption} from '@ts-stg/thlib/touhou';

test('portrait music uses all five unchanged Rush archive tracks and original interleaved-sample loops',()=>{
  const manifest=JSON.parse(fs.readFileSync('games/rushboss/assets/manifest.json','utf8'));
  let id=0;const loaded=[],loops=[];
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>++id,unloadTexture(){},
    createRenderTarget:()=>++id,createTexture:()=>++id,loadMusic:path=>{loaded.push(path);return ++id;},
    setMusicLoop:(_id,begin,end)=>loops.push([begin,end])};
  const app=createRushPortraitGame(host,{store:new SaveStore()});
  for(const [key,expected]of Object.entries({title:'魂の花',gamestart:'花の映る塚',grassland:'いたずらに命をかけて',riverside:'お惠みサマーレイソ',frozenforest:'凝霜的魇花'})){
    app.graphics.playMusic(key);const track=manifest.music[key];
    assert.equal(track.file,`bgm/${expected}.wav`);assert.equal(loaded.at(-1),`games/rushboss/assets/${track.file}`);
    assert.deepEqual(loops.at(-1),[track.loopBegin/(track.sampleRate*track.channels),track.loopEnd/(track.sampleRate*track.channels)]);
    assert.equal(createHash('sha256').update(fs.readFileSync(loaded.at(-1))).digest('hex'),manifest.files[track.file].sha256);
  }
  assert.ok(loaded.every(path=>!path.includes('th20_')));app.destroy();
  const visualSkin=JSON.parse(fs.readFileSync('games/rushboss/assets/portrait/manifest.json','utf8'));
  assert.equal(visualSkin.music,undefined);
  const audio=JSON.parse(fs.readFileSync('packages/thlib/assets/touhou-common/audio/manifest.json','utf8'));
  assert.ok(audio.files.every(file=>/^se_.*\.wav$/.test(file.name)),'public original pack contains common sound effects, no BGM');
});

test('Rush caption forwards its actual dialogue text to the public preset without loading stage-logo artwork',()=>{
  let id=0;const reads=[],textures=[],raster=[],unloaded=[];
  const host={readText:path=>{reads.push(path);return fs.readFileSync(path,'utf8');},loadTexture:path=>{textures.push(path);return ++id;},
    unloadTexture:handle=>unloaded.push(handle),createRenderTarget:()=>++id,createTexture:()=>++id,loadMusic:()=>++id,
    encodeText:text=>new Uint8Array(text.length*2),hasSystemFont:()=>false,
    rasterizeBitmapText:(text,options)=>{raster.push({text,codePage:options.codePage});return{width:options.width,height:options.height,
      pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)};}};
  const app=createRushPortraitGame(host,{store:new SaveStore()});
  app.graphics.showMusicCaption('恩惠Summer Rain');const previous=app.graphics.caption;
  assert.ok(previous instanceof TouhouMusicCaption);assert.equal(previous.text,'BGM. 恩惠Summer Rain');
  assert.deepEqual(previous.view,{x:0,y:0,scale:1,screenScale:1.5});
  const texture=previous.texture;app.graphics.showMusicCaption('赌上性命去恶作剧');
  assert.equal(previous.alive,false);assert.ok(unloaded.includes(texture));
  assert.equal(app.graphics.snapshot().musicCaption.text,'BGM. 赌上性命去恶作剧');
  assert.deepEqual(raster.map(c=>c.codePage),[936,936,936,936]);
  assert.ok(raster.some(c=>c.text==='BGM. 恩惠Summer Rain'));
  assert.ok([...reads,...textures].every(path=>!path.includes('logo')),'No st01/st02/st03logo metadata or PNG is loaded');
  app.graphics.showMusicCaption('');assert.equal(app.graphics.caption,null);app.destroy();
});

test('real Rush dialogue music events retain the new caption across first battle render and retries',()=>{
  let id=0;const raster=[],reads=[];
  const host={readText:path=>{reads.push(path);return fs.readFileSync(path,'utf8');},loadTexture:()=>++id,unloadTexture(){},
    createRenderTarget:()=>++id,createTexture:()=>++id,loadMusic:()=>++id,updateTextureRegion(){},
    encodeText:text=>new Uint8Array(Array.from(text).reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0)),hasSystemFont:()=>false,
    rasterizeBitmapText:(text,options)=>{raster.push({text,codePage:options.codePage});return{width:options.width,height:options.height,
      pixels:options.pixels??new Uint8Array(options.width*options.height*4).fill(255)};}};
  const app=createRushPortraitGame(host,{startBoss:'monstone',mode:'stage',store:new SaveStore(),invincible:true});
  // Advance the actual imported dialogue; intentionally defer its first draw
  // until the real caption callback to catch updateBodies' attachment cleanup.
  for(let frame=0;frame<5000&&!app.graphics.caption;frame++)app.update(Keys.FOCUS);
  const caption=app.graphics.caption;assert.ok(caption instanceof TouhouMusicCaption);
  assert.equal(caption.text,'BGM. 恩惠Summer Rain');assert.equal(caption.frame,0);
  assert.ok(raster.some(row=>row.text===caption.text&&row.codePage===936));
  app.render();assert.equal(app.graphics.caption,caption);assert.equal(caption.alive,true);assert.equal(caption.frame,1);
  app.render();assert.equal(caption.frame,1,'Repeated draw in the same battle frame never reticks the caption');
  assert.ok(reads.every(path=>!path.includes('logo')));
  app.start({mode:'stage',bossIndex:1,phaseIndex:0,character:0,difficulty:1});
  assert.equal(caption.alive,false);assert.equal(app.graphics.caption,null,'Retry releases the previous caption before any new event');
  app.destroy();
});

test('real portrait retry and exit/re-entry restart cached BGM while pause/settings preserve the cursor',()=>{
  let id=0;const streams=new Map(),calls=[];
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>++id,unloadTexture(){},
    createRenderTarget:()=>++id,createTexture:()=>++id,
    loadMusic:path=>{streams.set(++id,{path,time:0,paused:false});return id;},setMusicLoop(){},
    playMusic:(handle,volume)=>{Object.assign(streams.get(handle),{volume,paused:false});calls.push(['play',handle]);},
    stopMusic:handle=>{Object.assign(streams.get(handle),{time:0,paused:false});calls.push(['stop',handle]);},
    seekMusic:(handle,time)=>{streams.get(handle).time=time;calls.push(['seek',handle,time]);},
    pauseMusic:handle=>{streams.get(handle).paused=true;calls.push(['pause',handle]);},
    resumeMusic:handle=>{streams.get(handle).paused=false;calls.push(['resume',handle]);},
    setMusicVolume:(handle,volume)=>{streams.get(handle).volume=volume;calls.push(['volume',handle]);},unloadMusic(){}};
  const store=new SaveStore();store.set('profile',{musicVolume:.5});
  const app=createRushPortraitGame(host,{store,startBoss:'sunny',skipDialogue:true,invincible:true});
  try{
    const track=app.graphics.currentMusic,stream=streams.get(track);
    assert.equal(stream.volume,10**(-1250/2000),'the saved setting must reach the transport before the first play');
    stream.time=42;const oldGame=app.application.game;oldGame.openPause(0);calls.length=0;
    app.setVolume('musicVolume',.7);assert.equal(stream.time,42);assert.equal(stream.paused,true);
    assert.deepEqual(calls,[['volume',track]],'settings must not call play or seek');
    calls.length=0;oldGame.onRestart();assert.notEqual(app.application.game,oldGame);
    assert.equal(app.graphics.currentMusic,track);assert.equal(stream.time,0);assert.equal(stream.paused,false);
    assert.deepEqual(calls,[['stop',track],['seek',track,0],['play',track]]);
    stream.time=25;app.application.game.onExit();assert.equal(app.graphics.musicKey,'title');
    const title=streams.get(app.graphics.currentMusic),menu=app.application.menu;
    for(const page of [4,7,8]){
      title.time=42;menu.openUtilityPage(page);menu.external.finish();
      assert.equal(menu.state,'main');assert.equal(title.time,0,'Returning from a title subpage restarts its cached title music');
    }
    menu.openDifficulty();for(let i=0;i<9;i++)app.update();title.time=31;
    app.update(Keys.CANCEL);for(let i=0;i<8;i++)app.update();
    assert.equal(menu.state,'main');assert.equal(title.time,0,'Cancelling selection back to the main list restarts its music');
    app.start({mode:'normal',bossIndex:0,phaseIndex:0});assert.equal(app.graphics.currentMusic,track);assert.equal(stream.time,0);
    const fade=app.graphics.fadeMusic();for(let i=0;i<12;i++)app.update();assert.equal(fade.frame,12);
    app.application.game.openPause(0);for(let i=0;i<20;i++)app.update();assert.equal(fade.frame,12);
    app.application.game.onRestart();assert.equal(fade.alive,false);assert.equal(app.graphics.musicPlayer.fade,null);
  }finally{app.destroy();}
});
