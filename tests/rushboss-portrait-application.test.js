import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Keys,TouhouTitleMenu,TouhouStageSelect,TouhouPause,TouhouGameOver,createTouhouResources,SaveStore} from '@ts-stg/thlib';
import {RushPortraitApplication,RUSH_PORTRAIT_SPELLS} from '../games/rushboss/src/portrait-application.js';
import {BOSSES} from '../games/rushboss/src/catalog.js';

const available=fs.existsSync('packages/thlib/assets/touhou-common/manifest.json');
const tick=(app,count,mask=0)=>{for(let frame=0;frame<count;frame++)app.update(mask);};
function setup(options={}){
  let handle=0;const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>++handle,createTexture:()=>++handle,createRenderTarget:()=>++handle,unloadTexture(){}};
  const resources=createTouhouResources(host),dialogues=[];
  const graphics={clearBattle(){},draw(draw,battle,{hud,hideHudNumbers}){draw.clear();hud.draw(draw,battle.sharedPlayer,{hideNumbers:hideHudNumbers});},snapshot:()=>({public:true})};
  const createDialogue=(_resources,config)=>{
    const entry={boss:config.bossId,phase:config.phase,ticks:0,complete:false};dialogues.push(entry);
    return{get complete(){return entry.complete;},update(){if(++entry.ticks===1&&entry.phase==='before')config.onRevealBoss();if(entry.ticks===3){entry.complete=true;config.onComplete();}},draw(){},dispose(){},snapshot:()=>entry};
  };
  const app=new RushPortraitApplication(host,{resources,graphics,createDialogue,
    stageClearTiming:{minFrames:1,autoFrames:1,exitFrames:1},stageTransitionTiming:{coverFrames:1,revealFrames:1},invincible:true,...options});
  return{app,resources,dialogues,close(){app.destroy();resources.dispose();}};
}

test('portrait normal run chains all three Bosses after dialogue while carrying player stocks and score',{skip:!available},()=>{
  const f=setup({startBoss:'sunny'}),{app}=f;tick(app,3);let game=app.application.game;
  assert.equal(game.state,'entrance');assert.equal(app.battle.combatStarted,false);
  tick(app,98);assert.equal(app.battle.presentation.shared.entrance.age,100);assert.equal(app.battle.combatStarted,false);
  tick(app,1);
  assert.equal(game.state,'combat');assert.equal(app.battle.combatStarted,true);
  const player=app.battle.sharedPlayer;player.lives=1;player.bombs=2;player.setPower(234);player.lifeFragments=2;player.bombFragments=1;player.graze=77;
  app.battle.score=123450;game.session.continues=1;
  for(let index=0;index<3;index++){
    assert.equal(game.bossIndex,index);app.battle.finished=true;app.battle.boss.alive=false;app.update();assert.equal(game.state,'ending');
    tick(app,60);assert.equal(game.state,'after');
    tick(app,3);
    assert.equal(game.state,'stageClear');tick(app,2);
    if(index<2){assert.equal(game.state,'stageTransition');tick(app,103);assert.equal(game.state,'combat');
      const carried=app.battle.sharedPlayer;assert.equal(carried.lives,1);assert.equal(carried.bombs,2);assert.equal(carried.power,234);
      assert.equal(carried.lifeFragments,2);assert.equal(carried.bombFragments,1);assert.equal(carried.graze,77);assert.equal(app.battle.score,123450);assert.equal(carried.continues,1);
    }
  }
  assert.equal(game.state,'result');assert.equal(game.completedBattles.length,3);assert.ok(game.pauseVisual instanceof TouhouGameOver);
  assert.deepEqual(f.dialogues.map(d=>`${d.boss}:${d.phase}`),['sunny:before','sunny:after','monstone:before','monstone:after','artia:before','artia:after']);
  f.close();
});

test('stage practice finishes its selected entire Boss; spell practice exposes all sixteen authored cards',{skip:!available},()=>{
  const f=setup({startBoss:'monstone',mode:'stage',skipDialogue:true}),{app}=f;
  assert.equal(app.battle.singlePhase,false);app.battle.finished=true;app.update();assert.equal(app.application.game.state,'stageClear');
  tick(app,2);assert.equal(app.application.game.state,'result');
  assert.equal(app.application.game.session.mode,1);assert.equal(RUSH_PORTRAIT_SPELLS.length,16);
  for(const card of RUSH_PORTRAIT_SPELLS){
    app.start({mode:'spell',bossIndex:card.bossIndex,phaseIndex:card.phaseIndex});
    assert.equal(app.battle.phase.key,card.key);assert.equal(app.battle.singlePhase,true);assert.equal(app.application.game.session.mode,2);
    app.update();app.render();
  }
  f.close();
});

test('all four difficulties and both restored characters are carried into portrait battle geometry',{skip:!available},()=>{
  const f=setup({startBoss:0,skipDialogue:true}),{app}=f;
  for(let difficulty=0;difficulty<4;difficulty++)for(let character=0;character<2;character++){
    app.start({mode:'normal',difficulty,character,bossIndex:0,phaseIndex:0});const battle=app.battle;
    assert.equal(battle.difficulty,difficulty);assert.equal(battle.sharedPlayer.character,character);
    const {x,y,width,height}=battle.sharedPlayer.bounds;
    assert.deepEqual({x,y,width,height},{x:-192,y:0,width:384,height:448});
    assert.equal(battle.player.y,224-battle.sharedPlayer.y);
  }
  f.close();
});

test('public pause freezes combat, resumes it, and original GameOver can continue without restarting a card',{skip:!available},()=>{
  const f=setup({startBoss:0,skipDialogue:true}),{app}=f;tick(app,5);const game=app.application.game,battle=app.battle;
  app.update(Keys.PAUSE);assert.ok(game.pauseVisual instanceof TouhouPause);const stopped=battle.phaseFrame;tick(app,12);assert.equal(battle.phaseFrame,stopped);
  app.update(Keys.PAUSE);tick(app,12);assert.equal(game.paused,false);app.update();assert.equal(battle.phaseFrame,stopped+1);
  battle.gameOver=true;battle.sharedPlayer.lives=-1;battle.sharedPlayer.state=2;battle.sharedPlayer.timer.set(30);game.openResult(false);
  tick(app,12);assert.ok(game.pauseVisual instanceof TouhouGameOver);assert.equal(game.pauseVisual.selection,0);
  app.update(Keys.CONFIRM);tick(app,12);assert.equal(battle.gameOver,false);assert.equal(game.paused,false);assert.equal(game.session.continues,1);assert.equal(battle.sharedPlayer.lives,2);
  assert.equal(app.battle,battle);assert.equal(battle.phaseIndex,0);f.close();
});

test('source title difficulty and character animations route to the shared spell list and back to title',{skip:!available},()=>{
  const f=setup(),{app}=f;tick(app,132);let menu=app.application.menu;assert.ok(menu instanceof TouhouTitleMenu);
  menu.selection=3;app.update(Keys.CONFIRM);tick(app,20);assert.equal(menu.state,'difficulty');
  tick(app,7);app.update(Keys.RIGHT);app.update(0);app.update(Keys.RIGHT);app.update(0);app.update(Keys.CONFIRM);tick(app,14);
  assert.equal(menu.state,'character');tick(app,7);app.update(Keys.RIGHT);app.update(0);app.update(Keys.CONFIRM);tick(app,14);
  assert.ok(menu.content instanceof TouhouStageSelect);assert.equal(menu.content.entries.length,16);tick(app,24);
  assert.equal(menu.handles.get(35).alive,false,'Original Player Select heading must retire before the stage/card list');
  for(const id of [15,16])assert.equal(menu.child(12,id).U(0x49c)&1,0,'Uncleared character stamps remain hidden across recursive selection interrupts');
  app.update(Keys.UP);assert.equal(menu.content.selection,15);app.update(0);app.update(Keys.CONFIRM);tick(app,40);
  assert.equal(app.application.mode,'game');assert.equal(app.battle.character,1);assert.equal(app.battle.difficulty,3);
  assert.equal(app.battle.phase.key,RUSH_PORTRAIT_SPELLS.at(-1).key);app.application.game.onExit();assert.equal(app.application.mode,'title');
  assert.equal(menu.destroyed,true);assert.equal(menu.bank.disposed,true);f.close();
});

test('recorded dialogue, movement, shooting and pause inputs replay exactly while live controls are ignored',{skip:!available},()=>{
  const f=setup({startBoss:0,seed:123}),{app}=f;
  for(let frame=0;frame<180;frame++)app.update(frame===70||frame===90?Keys.PAUSE:Keys.SHOOT|(frame%40<20?Keys.LEFT:Keys.RIGHT));
  const expected=app.application.game.snapshot(),data=app.saveReplay();assert.equal(data.frames,180);assert.equal(app.profile.replays.length,1);
  assert.equal(data.config.settings.seed,123);app.playReplay(data);
  for(let frame=0;frame<data.frames;frame++)app.update(Keys.RIGHT|Keys.SHOOT|Keys.BOMB);
  assert.deepEqual(app.application.game.snapshot(),expected);assert.equal(app.playback.finished,true);assert.equal(app.playback.desync,null);
  app.update(Keys.SHOOT);assert.deepEqual(app.application.game.snapshot(),expected);
  app.update(Keys.PAUSE);assert.equal(app.application.mode,'title');f.close();
});

test('Option and Manual are actual shared pages and settings/high scores persist through the storage adapter',{skip:!available},()=>{
  const store=new SaveStore(),f=setup({store}),{app}=f;tick(app,132);let menu=app.application.menu;
  assert.deepEqual([...menu.excluded],[1,5,6]);menu.selection=7;app.update(Keys.CONFIRM);tick(app,20);
  assert.equal(menu.external.kind,'options');tick(app,12);app.update(Keys.LEFT);assert.equal(app.profile.musicVolume,.6);
  app.update(0);app.update(Keys.DOWN);app.update(0);app.update(Keys.LEFT);assert.equal(app.profile.soundVolume,.9);
  app.update(0);app.update(Keys.CANCEL);tick(app,6);assert.equal(menu.external,null);
  tick(app,14);menu.selection=8;app.update(Keys.CONFIRM);tick(app,20);assert.equal(menu.external.kind,'manual');app.render();
  assert.ok(menu.external.list.entries.some(entry=>entry.label.includes('Shift')));
  app.profile.highScore=1234;app.saveProfile();f.close();
  const second=setup({store});assert.equal(second.app.profile.musicVolume,.6);assert.equal(second.app.profile.soundVolume,.9);assert.equal(second.app.highScore,1234);second.close();
});

test('saved replay restores every effective session option after a fresh launch with different defaults',{skip:!available},()=>{
  const store=new SaveStore(),first=setup({store,startBoss:0});tick(first.app,90,Keys.SHOOT|Keys.FOCUS);
  const expected=first.app.application.game.snapshot();first.app.saveReplay();first.close();
  const second=setup({store,seed:999,skipDialogue:true,power:400,character:1,difficulty:3});
  second.app.playReplay(second.app.profile.replays[0].data);tick(second.app,90,Keys.BOMB);
  assert.deepEqual(second.app.application.game.snapshot(),expected);second.close();
});

test('replays before the source phase timeline are rejected before replacing the current game',{skip:!available},()=>{
  const f=setup({startBoss:0}),{app}=f;tick(app,120);const data=app.saveReplay(),current=app.application.game;
  assert.equal(data.config.revision,17);const old=structuredClone(data);old.config.revision=16;
  assert.throws(()=>app.playReplay(old),/different game revision/);assert.equal(app.application.game,current);
  app.profile.replays=[{label:'earlier build',data:old}];app.application.openMenu();tick(app,132);
  app.application.menu.openUtilityPage(4);const list=app.application.menu.external.list;
  assert.equal(list.entries[0].enabled,false);assert.match(list.entries[0].label,/Old version/);
  f.close();
});

test('pause Save Replay and Return to Title saves after the source Yes confirmation, then exits when acknowledged',{skip:!available},()=>{
  const f=setup({startBoss:0,skipDialogue:true}),{app}=f;tick(app,5);
  app.update(Keys.PAUSE);tick(app,12);const game=app.application.game,pause=game.pauseVisual;
  assert.ok(pause instanceof TouhouPause);
  app.update(Keys.DOWN);app.update(0);app.update(Keys.DOWN);app.update(0);app.update(Keys.CONFIRM);
  tick(app,30);assert.equal(pause.phase,9);assert.equal(pause.selection,1,'The source confirmation defaults to No');
  assert.equal(app.profile.replays.length,0);
  app.update(Keys.UP);app.update(0);app.update(Keys.CONFIRM);tick(app,20);
  assert.equal(pause.phase,11);assert.equal(pause.external.kind,'message');assert.equal(app.application.mode,'game');
  assert.equal(app.profile.replays.length,1,'Save completes while the original session still exists');
  const replay=app.profile.replays[0].data;assert.ok(replay.frames>0);assert.equal(replay.frames,app.recorder.frames);
  tick(app,12);app.update(Keys.CONFIRM);tick(app,40);
  assert.equal(app.application.mode,'title');assert.equal(game.destroyed,true);assert.equal(pause.active,false);
  assert.equal(app.profile.replays.length,1);f.close();
});

test('victory Save Replay keeps the completed result menu after acknowledgement',{skip:!available},()=>{
  const f=setup({startBoss:0,mode:'spell',skipDialogue:true}),{app}=f;
  app.battle.finished=true;app.update();const game=app.application.game,result=game.pauseVisual;tick(app,12);
  app.update(Keys.DOWN);app.update(0);app.update(Keys.CONFIRM);tick(app,21);
  assert.equal(result.phase,11);assert.equal(app.profile.replays.length,1);assert.equal(app.recordingComplete,true);
  tick(app,12);app.update(Keys.CONFIRM);tick(app,40);
  assert.equal(app.application.mode,'game');assert.equal(result.phase,6);assert.equal(result.external,null);
  assert.equal(game.state,'result');assert.equal(app.profile.replays.length,1);f.close();
});
