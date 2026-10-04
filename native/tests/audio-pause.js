const check=(value,message)=>{if(!value)throw new Error(message);};
const rejects=action=>{let threw=false;try{action();}catch{threw=true;}check(threw,'Expected stale audio ID rejection');};
const sound=tsstg.loadSound('packages/thlib/assets/audio/shot.wav');
const music=tsstg.loadMusic('packages/thlib/assets/audio/shot.wav');
tsstg.playSound(sound,.05,.5,true);const hasAudio=tsstg.isSoundPlaying(sound);
tsstg.pauseSound(sound);check(!tsstg.isSoundPlaying(sound),'Paused sound still playing');
tsstg.resumeSound(sound);if(hasAudio)check(tsstg.isSoundPlaying(sound),'Resume did not restore sound buffer');
tsstg.setMusicLoop(music,.005,.02);tsstg.playMusic(music,.05);
let frame=0,pausedTime=0;
globalThis.__tsstg_game={
 update(){
   if(frame===2){tsstg.pauseSound(sound);tsstg.pauseMusic(music);pausedTime=tsstg.getMusicTime(music);}
   if(frame===5)tsstg.setMusicVolume(music,.01);
   if(frame>2&&frame<10){check(!tsstg.isSoundPlaying(sound),'Loop scheduler restarted a paused sound');check(Math.abs(tsstg.getMusicTime(music)-pausedTime)<.001,'Paused music time advanced');}
   if(frame===10){tsstg.resumeSound(sound);tsstg.resumeMusic(music);}
   if(frame===12){tsstg.stopSound(sound);tsstg.pauseSound(sound);tsstg.resumeSound(sound);check(!tsstg.isSoundPlaying(sound),'Resume restarted stopped sound');tsstg.stopMusic(music);}
   frame++;
 },render:()=>[['clear',0x182331ff]],snapshot(){
   tsstg.unloadSound(sound);tsstg.unloadMusic(music);
   for(const fn of ['pauseSound','resumeSound','isSoundPlaying'])rejects(()=>tsstg[fn](sound));
   for(const fn of ['pauseMusic','resumeMusic'])rejects(()=>tsstg[fn](music));
   rejects(()=>tsstg.setMusicVolume(music,.1));
   return{frame,hasAudio,pauseResume:true};
 }
};
