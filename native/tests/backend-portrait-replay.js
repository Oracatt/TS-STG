// Actual public ANM/player/dialogue/pause/application + native persistent store.
// Record 420 inputs then replay them; noisy live Bomb/movement input is ignored.
import {Keys,SaveStore,stateHash} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
const storage={readText:name=>tsstg.readText(`userdata/${name}`),writeText:(name,text)=>tsstg.writeText(name,text)};
const namespace=`backend-portrait-replay-${tsstg.backend}`,store=new SaveStore(storage,namespace);
store.set('profile',{highScore:0,musicVolume:0,soundVolume:0,replays:[]});
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',mode:'normal',seed:321,invincible:true,store});
let frame=0,expected=null,actual=null,recordedFrames=0,persisted=false,sawDialogue=false,sawPause=false;
globalThis.__tsstg_game={
  update(){
    if(frame===420){
      expected=stateHash(game.application.game.snapshot());game.saveReplay();
      const saved=new SaveStore(storage,namespace).get('profile');recordedFrames=saved.replays[0].data.frames;
      persisted=recordedFrames===420;game.playReplay(saved.replays[0].data);
    }
    if(frame<420)game.update(frame===310||frame===335?Keys.PAUSE:Keys.SHOOT|Keys.FOCUS|(frame%60<30?Keys.LEFT:Keys.RIGHT));
    else game.update(Keys.RIGHT|Keys.BOMB|Keys.SHOOT);
    sawDialogue||=!!game.application.game.dialogue?.active;sawPause||=game.application.game.paused;frame++;
    if(frame===840){actual=stateHash(game.application.game.snapshot());if(actual!==expected)throw Error(`Replay mismatch ${actual} != ${expected}`);}
  },
  render:()=>game.render(),postFrame:now=>game.postFrame(now),destroy:()=>game.destroy(),
  snapshot(){
    if(!persisted||!sawDialogue||!sawPause)throw Error('Replay persistence/dialogue/pause path was not exercised');
    return{backend:tsstg.backend,frame,expected,actual,persisted,recordedFrames,sawDialogue,sawPause,
      replay:game.snapshot().replay,session:game.application.game.snapshot()};
  },
};
