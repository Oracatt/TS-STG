import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SaveStore,Keys} from '@ts-stg/thlib';
import {createTouhouResources} from '@ts-stg/thlib/touhou';
import {RushPortraitApplication,RUSH_PORTRAIT_SPELLS} from '../games/rushboss/src/portrait-application.js';

const available=fs.existsSync('packages/thlib/assets/touhou-common/manifest.json');
function setup(t){
  let next=0;
  // Keep real dialogue text, step timing, events and animation owners. Only
  // platform resource IDs, code-page byte lengths and glyph rasterization are
  // replaced; native tools separately verify actual pixels and blend layers.
  const host={readText:path=>fs.readFileSync(path,'utf8'),loadTexture:()=>++next,
    createTexture:()=>++next,createRenderTarget:()=>++next,unloadTexture(){},
    encodeText:text=>new Uint8Array(Array.from(text).reduce((length,char)=>length+(char.codePointAt(0)>127?2:1),0)),
    hasSystemFont:()=>false,rasterizeBitmapText:(_text,options)=>({width:options.width,height:options.height,
      pixels:options.pixels??new Uint8Array(options.width*options.height*4)}),updateTextureRegion(){}};
  const resources=createTouhouResources(host),graphics={options:{},clearBattle(){},draw(){},snapshot:()=>({public:true})};
  const app=new RushPortraitApplication(host,{resources,graphics,store:new SaveStore(),invincible:true});
  t.after(()=>{app.destroy();resources.dispose();});return app;
}

test('all six real Rush pre-Boss dialogues can be skipped through the source entrance and replay identically',{skip:!available},t=>{
  const app=setup(t);
  for(let bossIndex=0;bossIndex<3;bossIndex++)for(let character=0;character<2;character++){
    const label=`Boss ${bossIndex}, character ${character}`;
    app.start({mode:'stage',bossIndex,phaseIndex:0,difficulty:1,character});
    let frames=0,hiddenFrames=0;
    while(app.application.game.state!=='combat'&&frames++<2000){
      app.update(Keys.FOCUS|Keys.SHOOT);
      const battle=app.battle,shared=battle.presentation.shared;
      if(shared.entrance&&!shared.entranceReady){
        hiddenFrames++;
        assert.equal(shared.bossVisible,false,label);
        assert.equal(battle.combatStarted,false,label);
        assert.equal(battle.phaseIndex,-1,label);
        assert.equal(battle.phaseFrame,0,label);
        assert.equal(battle.statistics.spawned,0,`${label}: authored attacks wait until reveal`);
      }
    }
    assert.ok(hiddenFrames>0,`${label}: real dialogue reveal event must create the entrance`);
    assert.equal(app.application.game.state,'combat',label);
    assert.equal(app.battle.presentation.shared.entrance.mode,'blackFog',label);
    assert.equal(app.battle.presentation.shared.entranceReady,true,label);
    for(let frame=0;frame<65;frame++)app.update(Keys.FOCUS|Keys.SHOOT);
    const expected=app.application.game.snapshot(),replay=app.exportReplay();
    app.playReplay(replay);
    for(let frame=0;frame<replay.frames;frame++)app.update(0);
    assert.deepEqual(app.application.game.snapshot(),expected,`${label}: complete source dialogue/combat state`);
    assert.equal(app.playback.desync,null,label);
    assert.equal(app.playback.finished,true,label);
  }
});

test('all sixteen real spell-practice entries bypass summoning and use independent normal or survival HUDs',{skip:!available},t=>{
  const app=setup(t);assert.equal(RUSH_PORTRAIT_SPELLS.length,16);
  for(const entry of RUSH_PORTRAIT_SPELLS){
    app.start({mode:'spell',bossIndex:entry.bossIndex,phaseIndex:entry.phaseIndex,difficulty:1,character:0});
    assert.equal(app.application.game.state,'combat',entry.key);
    assert.equal(app.battle.singlePhase,true,entry.key);
    assert.equal(app.battle.presentation.shared.entrance.mode,'flyIn',entry.key);
    assert.equal(app.battle.presentation.shared.entrance.particles.length,0,entry.key);
    for(let frame=0;frame<90;frame++)app.update(0);
    const hud=app.battle.presentation.shared.hud.snapshot();
    assert.equal(app.battle.phase.key,entry.key);
    assert.equal(hud.remainingSpells,0,`${entry.key}: no future cards in single-card practice`);
    assert.equal(hud.stars.length,0,entry.key);
    if(app.battle.phase.survival){assert.equal(app.battle.presentation.shared.hud.panels[0].animations.length,0,entry.key);assert.equal(hud.timerVisible,true,entry.key);}
    else assert.equal(hud.panels[0].target,1,entry.key);
    assert.deepEqual(hud.panels[0].markers,[0,0,0,0],entry.key);
  }
});
