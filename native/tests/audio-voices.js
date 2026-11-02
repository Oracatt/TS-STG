const check=(value,message)=>{if(!value)throw Error(message);};
const rejects=fn=>{let rejected=false;try{fn();}catch{rejected=true;}check(rejected,'Stale sound ID must reject');};
const source=tsstg.loadSound('packages/thlib/assets/audio/shot.wav');
const a=tsstg.cloneSound(source),b=tsstg.cloneSound(source),c=tsstg.cloneSound(a);
check(new Set([source,a,b,c]).size===4,'Sound voices must have distinct handles');
// Zero gain exercises the real device/mixer without playing test noise.
tsstg.playSound(a,0,.1,true);const hasAudio=tsstg.isSoundPlaying(a);
tsstg.playSound(b,0,.9,false);tsstg.stopSound(b);
if(hasAudio)check(tsstg.isSoundPlaying(a),'Stopping sibling must not stop first voice');
tsstg.unloadSound(source);rejects(()=>tsstg.cloneSound(source));
tsstg.pauseSound(a);check(!tsstg.isSoundPlaying(a),'Pause must suspend only one voice');
tsstg.playSound(c,0,.5,true);
if(hasAudio)check(tsstg.isSoundPlaying(c),'Clone survives unloading original sample handle');
tsstg.unloadSound(a);rejects(()=>tsstg.playSound(a));
tsstg.playSound(b,0,.8,true);tsstg.pauseSound(c);
if(hasAudio)check(tsstg.isSoundPlaying(b),'Other voice survives pause/unload of siblings');
let frame=0;
globalThis.__tsstg_game={
  update(){
    check(!tsstg.isSoundPlaying(c),'Loop scheduler must not resume paused sibling');
    frame++;
  },
  render:()=>[],
  snapshot(){
    tsstg.stopSound(b);tsstg.resumeSound(c);
    if(hasAudio)check(tsstg.isSoundPlaying(c),'Last voice must retain decoded samples');
    tsstg.unloadSound(b);tsstg.unloadSound(c);
    for(const id of [a,b,c,source])rejects(()=>tsstg.cloneSound(id));
    return{frame,hasAudio,independentVoices:true,sourceFirstRelease:true};
  },
};
