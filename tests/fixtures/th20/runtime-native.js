import { AnmBank,Th20BitmapFont,Th20Game,Th20RNG,th20BulletCommand } from '../../../games/touhou20/src/index.js';

// One portable fixture for Node and QuickJS. This authored validation sequence
// exercises common controllers; it is not an original stage or Boss script.
export const RUNTIME_GAME_FRAMES=1080;
export const RUNTIME_HOST_FRAMES=2400;
const require=(value,message)=>{if(!value)throw new Error(`TH20 runtime: ${message}`);};
const copy=value=>JSON.parse(JSON.stringify(value,(_key,item)=>{
  if(typeof item==='number')require(Number.isFinite(item),'non-finite snapshot value');return item;
}));

export function createTh20RuntimeFixture(host){
  const read=path=>JSON.parse(host.readText(path)),archives=new Map(),textures=new Map();
  const styles=read('games/touhou20/assets/bullet-styles.json').styles;
  const archive=name=>{if(!archives.has(name))archives.set(name,read(`games/touhou20/assets/anm/${name}.json`));return archives.get(name);};
  const loadTexture=(...args)=>{const key=JSON.stringify(args);if(!textures.has(key))textures.set(key,host.loadTexture(...args));return textures.get(key);};
  const results=[];let game,current,character=0,hostFrames=0,lastCommands=[],finished=false;
  function begin(which){
    const rng=new Th20RNG(0x12345678),visualRng=new Th20RNG(0x23456789),adapter={loadTexture,rng:visualRng};
    const banks=Object.fromEntries(['front','bullet','effect','enemy','ascii_960',which?'pl01':'pl00'].map(name=>[name,new AnmBank(archive(name),adapter)]));
    const font=new Th20BitmapFont(archive('ascii_960'),adapter);
    current={character:which,updates:0,pausedFrames:0,peaks:{bullets:0,lasers:0,shots:0,items:0,commands:0},events:{},trace:[],checkpoints:[],renderHash:2166136261,pauseRequested:false,resumed:false,continued:false};
    const event=(name,data)=>{
      current.events[name]=(current.events[name]??0)+1;
      if(['bomb','hit','miss','respawn','gameover','spellStart','spellFinish'].includes(name))current.trace.push({frame:game?.frame??0,name,...(name==='spellFinish'?{captured:!!data.captured}: {})});
    };
    game=new Th20Game({banks,font,styles,character:which,sht:read(`games/touhou20/assets/shots/pl0${which}.json`),power:400,rng,visualRng,
      onEvent:event,onSound:()=>{current.events.sound=(current.events.sound??0)+1;},
      gameOverOptions:{onContinue:()=>{current.continued=true;event('continue');}},
      stage:(scene,frame)=>{
        if(frame===0)scene.spawnEnemy({script:0,x:0,y:84,hp:1200,radius:14,onDefeat:()=>event('enemyDefeated')});
        if(frame===50||frame===300)scene.bullets.emit({x:-120,y:56,type:4,color:6,pattern:3,count:16,rows:2,speed:1.5,speedStep:2.5,angle:.4,angleStep:.14});
        if(frame===70){scene.items.spawn({type:2,x:scene.player.x,y:scene.player.y,speed:0});event('pointSpawned');}
        if(frame===80){scene.lasers.spawnStraight({x:-174,y:50,type:0,color:6,angle:1.48,speed:2,width:18,length:100,lengthLimit:450});event('straightSpawned');}
        if(frame===90){scene.lasers.spawnInfinite({x:166,y:40,type:0,color:2,angle:1.65,width:20,length:280,delay:12,grow:12,sustain:65,shrink:15});event('infiniteSpawned');}
        if(frame===100){scene.lasers.spawnCurve({x:-175,y:50,type:0,color:4,angle:1.2,speed:2,count:28,commands:[th20BulletCommand(3,{floats:[0,.007],ints:[90,0]})]});event('curveSpawned');}
        if(frame===500||frame===760){
          require(scene.player.state===1,`character ${which}: player not active for forced hit at ${frame}`);
          if(frame===760)scene.player.lives=0;
          scene.player.invulnerability.set(0);require(scene.player.hit(scene.context),`character ${which}: forced hit rejected`);
        }
        if(frame===640){scene.beginSpell({id:7,name:'Runtime verification',duration:600,keepStageBackground:true});event('spellRequested');}
        if(frame===720){const result=scene.spell.capture(scene.context);require(result?.captured,'spell capture failed');event('captureVerified');}
      }
    });
  }
  function input(){
    if(game.paused){
      current.pausedFrames++;
      // Fresh edge after the original opening delay. Continue/resume callbacks
      // must finish their own animation delays before simulation resumes.
      return game.pauseVisual.phase===6&&game.pauseVisual.age>=2?256:0;
    }
    let mask=16|(game.frame%120<60?64:0);
    if(game.frame>=20&&game.frame<40)mask|=1;
    if(game.frame>=40&&game.frame<60)mask|=2;
    if(game.frame===140&&!current.pauseRequested){current.pauseRequested=true;current.trace.push({frame:game.frame,name:'pause'});return 128;}
    if(game.frame===180)mask|=32;
    return mask;
  }
  function hashCommands(commands){
    // Float32-normalized numeric command stream captures actual ANM geometry,
    // UVs, colors and ordering without pretending a headless run rasterizes it.
    const scratch=new ArrayBuffer(4),view=new DataView(scratch);let hash=current.renderHash;
    const byte=value=>{hash=Math.imul(hash^value,16777619)>>>0;};
    const visit=value=>{
      if(Array.isArray(value)){byte(91);for(const item of value)visit(item);byte(93);}
      else if(typeof value==='number'){require(Number.isFinite(value),'non-finite drawing value');byte(78);if(Number.isInteger(value)){const text=String(value);for(let i=0;i<text.length;i++)byte(text.charCodeAt(i));}else{view.setFloat32(0,value,true);for(let i=0;i<4;i++)byte(view.getUint8(i));}byte(0);}
      else{const text=String(value);byte(83);for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);byte(code&255);byte(code>>>8);}byte(0);}
    };
    visit(commands);current.renderHash=hash;
  }
  function finish(){
    require(current.events.bomb===1,'one Bomb per character must run');
    require(current.events.miss===2&&current.events.respawn===2,'both forced deaths must respawn');
    require(current.events.gameover===1&&current.continued,'Game Over must continue');
    require(current.resumed&&current.pausedFrames>20,'pause must resume through original menu');
    require(current.events.captureVerified===1,'spell must capture');
    require(current.events.enemyDefeated>=1&&current.events.itemCollect>=1,'enemy defeat and item collection must run');
    require(current.peaks.lasers>=3&&current.peaks.shots>0&&current.peaks.bullets>0,'all projectile systems must run');
    require(current.peaks.commands>0,'real ANM and font drawing must run');
    require(game.frame>=RUNTIME_GAME_FRAMES,'insufficient simulation frames');
    current.final=copy(game.snapshot());current.renderHash=current.renderHash.toString(16).padStart(8,'0');
    results.push(current);game.destroy();
    if(character===0){character=1;begin(character);}else finished=true;
  }
  begin(character);
  return {
    update(){
      hostFrames++;if(finished)return;
      const pausedBefore=game.paused,frameBefore=game.frame;
      game.update(input());game.postFrame(game.frame/60);current.updates++;
      if(pausedBefore&&!game.paused&&!current.continued){current.resumed=true;current.trace.push({frame:game.frame,name:'resume'});}
      if(pausedBefore&&game.paused)require(game.frame===frameBefore,'pause advanced simulation');
      current.peaks.bullets=Math.max(current.peaks.bullets,game.bullets.count);
      current.peaks.lasers=Math.max(current.peaks.lasers,game.lasers.count);
      current.peaks.shots=Math.max(current.peaks.shots,game.player.shots.length);
      current.peaks.items=Math.max(current.peaks.items,game.items.items.length);
      if(game.frame!==frameBefore&&game.frame%120===0)current.checkpoints.push(copy(game.snapshot()));
    },
    render(){
      if(finished)return lastCommands;
      lastCommands=game.render();current.peaks.commands=Math.max(current.peaks.commands,lastCommands.length);hashCommands(lastCommands);
      if(game.frame>=RUNTIME_GAME_FRAMES)finish();
      return lastCommands;
    },
    snapshot(){return {format:'ts-stg-th20-runtime-v1',complete:finished,hostFrames,simulationFramesPerCharacter:RUNTIME_GAME_FRAMES,results};}
  };
}

if(globalThis.tsstg)globalThis.__tsstg_game=createTh20RuntimeFixture(globalThis.tsstg);
