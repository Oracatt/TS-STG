import { AnmBank,Th20Audio,Th20Motion,Th20RNG,Th20PauseCapture,Th20TitleBackground } from './src/index.js';
import { createTouhouResources } from '@ts-stg/thlib';
import { TouhouApplication,TouhouGame } from '@ts-stg/thlib/touhou';

// Only this demo's title artwork, music, background and authored arena remain
// here. The complete application/menu/game/pause/result lifecycle is public thlib.
const host=globalThis.tsstg,options=globalThis.__TH20_DEMO_OPTIONS??{};
const read=path=>JSON.parse(host.readText(path)),textureCache=new Map(),archiveCache=new Map(),dynamicTextures=new Map();
const rng=new Th20RNG(options.seed??1),visualRng=new Th20RNG(options.visualSeed??2);
const adapter={rng:visualRng,loadTexture:(...args)=>{const key=JSON.stringify(args);if(!textureCache.has(key))textureCache.set(key,host.loadTexture(...args));return textureCache.get(key);}};
adapter.resolveTexture=entry=>{const key=`${entry.name}:${entry.width}:${entry.height}`;if(!dynamicTextures.has(key))dynamicTextures.set(key,host.createTexture(entry.width,entry.height,new Uint8Array(entry.width*entry.height*4)));return dynamicTextures.get(key);};
const commonResources=createTouhouResources(host,{environment:adapter});
const sharedBanks=new Set(['pl00','pl01','bullet','effect','enemy','ascii_960','front','text']);
const bank=name=>{
  if(sharedBanks.has(name))return commonResources.createBank(name);
  if(!archiveCache.has(name))archiveCache.set(name,read(`games/touhou20/assets/anm/${name}.json`));
  return new AnmBank(archiveCache.get(name),adapter);
};
const font=commonResources.font;
const privateAudio=read('games/touhou20/assets/audio/manifest.json');
const sharedSoundDefinitions=new Map(commonResources.audioManifest.definitions.map(definition=>[
  definition.id,{...definition,fileIndex:privateAudio.files.length+definition.fileIndex},
]));
const audioManifest={...privateAudio,files:[...privateAudio.files,...commonResources.audioManifest.files],
  definitions:privateAudio.definitions.map(definition=>sharedSoundDefinitions.get(definition.id)??definition)};
const audio=new Th20Audio(audioManifest,{
 load:path=>host.loadSound(path),
 play:(id,{attenuation,pan,loop})=>host.playSound(id,Math.pow(10,attenuation/2000),Math.max(0,Math.min(1,.5-pan/2000)),loop),
 stop:id=>host.stopSound?.(id),
});
const styles=commonResources.styles;
const musicHandles=new Map();let currentMusic=null,savedMusic=null;const pausedSounds=[];
function music(index,position=0){
  if(currentMusic!==null)host.stopMusic(currentMusic);
  if(!musicHandles.has(index)){
    const track=audioManifest.music[index],id=host.loadMusic(track.path);
    host.setMusicLoop(id,track.loop_start_frame/44100,track.loop_end_frame_exclusive/44100);musicHandles.set(index,id);
  }
  currentMusic=musicHandles.get(index);host.seekMusic(currentMusic,position);host.playMusic(currentMusic,options.musicVolume??1);
}
const renderTarget=host.createRenderTarget(960,720),compositeTarget=host.createRenderTarget(960,720),titleTarget=host.createRenderTarget(960,720);
function resetPausedAudio(){for(const id of pausedSounds)host.stopSound(id);pausedSounds.length=0;}
function pauseSounds(){for(const id of audio.handles.values())if(host.isSoundPlaying(id)){host.pauseSound(id);pausedSounds.push(id);}}
function resumeSounds(){for(const id of pausedSounds)host.resumeSound(id);pausedSounds.length=0;}
function gameOptions({character=0,difficulty=1,mode:playMode='normal'}={}){
  const banks=Object.fromEntries(['front','bullet','effect','enemy','ascii_960','text',character?'pl01':'pl00'].map(name=>[name,bank(name)]));
  const backgroundBank=bank('ebg00'),background=backgroundBank.create(1);
  return {banks,font,styles,character,difficulty,power:options.power??100,rng,visualRng,disposeBanks:true,
    sht:commonResources.shots[character],renderTarget,compositeTarget,
    pauseCapture:new Th20PauseCapture({bank:banks.text,pixels:host,rng:visualRng}),
    session:{mode:playMode==='practice'?1:0},
    gameOverOptions:{onOpen:data=>{pauseSounds();if(data.pauseMusic){savedMusic={index:1,position:host.getMusicTime(currentMusic)};music(2);}},
      onContinue:()=>{resumeSounds();music(savedMusic?.index??1,savedMusic?.position??0);}},
    renderBackground:draw=>background.draw(draw,{x:0,y:0,scale:1,screenScale:1.5}),
    onSound:(id,x)=>audio.request(id,x),onStopSound:id=>audio.stop(id),onDestroy:()=>backgroundBank.dispose(),
    // Engine validation arena authored in JS. It is not an original stage or
    // any excluded title-specific boss attack script.
    stage:(scene,frame)=>{
      background.update();
      if(frame%120===0){const wave=frame/120,side=wave%2?1:-1;
        scene.spawnEnemy({script:(wave%4)*5,x:side*156,y:32,hp:120,radius:12,
          motion:new Th20Motion({position:{x:side*156,y:32},angle:side===1?2.1:1.04,speed:1.2}),
          onUpdate:(enemy)=>{
            if(enemy.age===90)enemy.motion.speed=.4;
            if(enemy.age>40&&enemy.age%90===0)scene.bullets.emit({x:enemy.x,y:enemy.y,type:wave%2?5:2,color:wave%2?6:2,
              pattern:0,count:5+difficulty*2,rows:2,speed:2.2+difficulty*.35,speedStep:1.4,angle:0,angleStep:.17});
            if(enemy.age>360)enemy.motion.speed=2.4;
          },drop:[{type:1},{type:2}]});
      }
      if(frame%360===180)scene.bullets.emit({x:0,y:96,type:4,color:8,pattern:3,count:30,rows:2,speed:1.8,speedStep:2.8,angle:frame*.001,angleStep:.1});
      if(frame%600===300)scene.lasers.spawnStraight({x:-160,y:40,type:0,color:6,angle:1.1,speed:2.2,width:18,length:200,initialLength:0});
      if(frame%900===540)scene.lasers.spawnInfinite({x:144,y:40,type:0,color:2,angle:1.8,width:24,length:330,delay:60,grow:30,sustain:120,shrink:30});
    }
  };
}
const application=new TouhouApplication({resources:commonResources,createBank:bank,gameOptions,
  clock:options.clock??(()=>Date.now()/1000),
  initialSelection:options,autostart:!!options.autostart,
  createGame:settings=>{const game=new TouhouGame(settings);game.setDistortion({x:0,y:96},{radius:96});return game;},
  menuOptions:()=>({bank:bank('title'),decorationBank:bank('title_v'),font,disposeBanks:true,disposeBackground:true,
    background:new Th20TitleBackground({textureId:titleTarget,rng:visualRng}),
    // Slots belonging to a particular completed game need application data.
    excluded:[1,3,4,5,6,7,8],sound:id=>audio.request(id)}),
  onSceneChange:({mode})=>{resetPausedAudio();music(mode==='game'?1:0);},
  onPauseChange:paused=>{if(paused){pauseSounds();host.pauseMusic(currentMusic);}else{resumeSounds();host.resumeMusic(currentMusic);}},
  onAfterUpdate:()=>audio.flush(),onQuit:()=>host.quit(),
});
globalThis.__tsstg_game=application;
