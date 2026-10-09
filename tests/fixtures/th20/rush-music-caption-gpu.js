// Real imported Rush dialogue → public caption. Freeze at120 caption ticks for
// deterministic visual inspection; do not synthesize a dialogue/music event.
import {Keys,SaveStore} from '../../../packages/thlib/dist/index.js';
import {createRushPortraitGame} from '../../../games/rushboss/src/portrait-application.js';
const reads=[],raster=[];
const host={...tsstg,readText(path){reads.push(path);return tsstg.readText(path);},
 rasterizeBitmapText(text,options){if(text.startsWith('BGM. '))raster.push({text,codePage:options.codePage});return tsstg.rasterizeBitmapText(text,options);}};
const game=createRushPortraitGame(host,{startBoss:'monstone',mode:'stage',invincible:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);let frame=0;
globalThis.__tsstg_game={update(){frame++;if((game.graphics.caption?.frame??0)<120)game.update(Keys.FOCUS);},render(){return game.render();},
 snapshot(){const caption=game.graphics.caption;if(!caption||caption.text!=='BGM. 恩惠Summer Rain'||caption.frame!==120)throw Error('Real dialogue did not reach its public music caption');
 if(reads.some(path=>path.includes('logo')))throw Error('A private stage-logo caption was loaded');
 return{frame,caption:caption.snapshot(),raster,legacyCaptionArtworkLoaded:false,game:game.snapshot()};}};
