// Generic gain control must be valid before playback, during playback,
// while paused and after stopping. This also runs without an audio device.
const check=(condition,message)=>{if(!condition)throw new Error(message);};
let rejected=0,accepted=0,frame=0;
const rejects=(label,action)=>{let threw=false;try{action();}catch{threw=true;}check(threw,`Expected rejection: ${label}`);rejected++;};
const sound=tsstg.loadSound('packages/thlib/assets/audio/shot.wav');
const music=tsstg.loadMusic('packages/thlib/assets/audio/shot.wav');
const setVolumes=()=>{for(const volume of [0,Number.MIN_VALUE,.125,.5,1]){
  const before=tsstg.getMusicTime(music);tsstg.setMusicVolume(music,volume);accepted++;
  check(Math.abs(tsstg.getMusicTime(music)-before)<.001,'Gain control changed stream cursor');
}};
for(const volume of [-Number.MIN_VALUE,-.1,1+Number.EPSILON,2,NaN,Infinity,-Infinity,'0.5',true,null,undefined,{},[],1n,Symbol('volume')])
  rejects(`volume ${String(volume)}`,()=>tsstg.setMusicVolume(music,volume));
for(const id of [0,0xffffffff,-1,1.5,0x100000000,NaN,Infinity,'1',null,undefined,sound])
  rejects(`id ${String(id)}`,()=>tsstg.setMusicVolume(id,.5));
rejects('missing arguments',()=>tsstg.setMusicVolume());
rejects('missing volume',()=>tsstg.setMusicVolume(music));
setVolumes(); // No implicit play.
tsstg.setMusicLoop(music,.005,.02);tsstg.playMusic(music,.01);setVolumes();
tsstg.pauseMusic(music);setVolumes();const pausedTime=tsstg.getMusicTime(music);
globalThis.__tsstg_game={
  update(){
    if(frame<3){
      tsstg.setMusicVolume(music,frame/10);accepted++;
      check(Math.abs(tsstg.getMusicTime(music)-pausedTime)<.001,'Gain control resumed paused music');
    }
    if(frame===3){tsstg.resumeMusic(music);tsstg.setMusicVolume(music,.01);accepted++;}
    if(frame===4){tsstg.stopMusic(music);setVolumes();}
    frame++;
  },
  render:()=>[['clear',0x182331ff]],
  snapshot(){
    check(frame===6,'Audio volume fixture frame count mismatch');
    tsstg.unloadMusic(music);tsstg.unloadSound(sound);
    rejects('unloaded id',()=>tsstg.setMusicVolume(music,.5));
    return{frame,accepted,rejected,volumeRange:[0,1],requiredVolume:true,pausePreserved:true};
  }
};
