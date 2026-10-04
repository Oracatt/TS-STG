import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{out:{type:'string'},scenes:{type:'string'}}});
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(root,values.out??'reports/rushboss/stage-flow'),scratch=path.join(root,'build/rushboss-stage-flow');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=['games/rushboss/src/portrait-application.js','games/rushboss/src/graphics-portrait.js','games/rushboss/src/music.js',
  'games/rushboss/src/player-adapter.js','games/rushboss/src/bullet-visuals.js','packages/thlib/src/touhou/dialogue.js',
  'packages/thlib/src/touhou/stage-clear.js','packages/thlib/src/touhou/stage-transition.js','packages/thlib/src/touhou/player.js',
  'packages/thlib/src/touhou/music-fade.js','packages/thlib/assets/touhou-common/anm/front.json'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,sha(path.join(root,p))])),sourceHashes=hashes(),results=[];
const scenes=[
  {name:'dialogue-visible',frame:239},{name:'dialogue-exit',frame:240},{name:'clear-with-portraits',frame:255},
  {name:'stage-clear',frame:301},{name:'cover-start',frame:551},{name:'cover-half',frame:566},{name:'next-covered',frame:581},
  {name:'reveal-half',frame:596},{name:'next-stage',frame:611},
  {name:'cancel-before',frame:119,cancel:true},{name:'cancel-birth',frame:120,cancel:true},
  {name:'cancel-fragments',frame:128,cancel:true},{name:'cancel-tail',frame:140,cancel:true},
];
const selected=values.scenes?.split(',')??scenes.map(scene=>scene.name);
for(const name of selected)assert.ok(scenes.some(scene=>scene.name===name),'Unknown scene: '+name);
for(const scene of scenes.filter(scene=>selected.includes(scene.name))){
  const entry=path.join(scratch,scene.name+'.js');
  fs.writeFileSync(entry,`
import {DrawList,Keys,SaveStore} from '@ts-stg/thlib';
import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {RushBattle} from '../../games/rushboss/src/runtime.js';
import {BULLET_STYLES} from '../../games/rushboss/src/bullet-styles.js';
const scene=${JSON.stringify(scene)};
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',skipDialogue:true,invincible:true,seed:13,store:new SaveStore(),
  createBattle:(phases,options)=>new RushBattle(phases.map(p=>({...p,update(){},init(b){Object.assign(b.boss,{x:0,y:100,moving:false,vx:0,vy:0});}})),options)});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
const session=game.application.game;let frame=0,bullets=[],coverStart=null;
const bodyQuads=()=>{const draw=new DrawList();game.battle.sharedPlayer.animation.draw(draw);
  return draw.commands.filter(command=>['quad','statefulQuad','mesh','sprite','spriteRegion'].includes(command[0])).length;};
globalThis.__tsstg_game={update(){
  game.update(session.stageTransition?.phase==='cover'?Keys.RIGHT|Keys.SHOOT:0);
  if(!coverStart&&session.stageTransition?.phase==='cover'){
    const player=game.battle.sharedPlayer;
    coverStart={x:player.x,y:player.y,playerFrame:player.frame,battleFrame:game.battle.frame,nextShotId:player.nextShotId,speed:player.speeds[0]/128};
  }
  if(scene.cancel){
    if(frame===90)for(const [row,kind]of ['XiaoYu','MiDan','ZhongYu'].entries())for(const [col,scale]of [.375,1,2].entries())
      bullets.push(game.battle.spawn(kind,{x:-120+120*col,y:80-100*row},{x:0,y:0},3,
        {size:BULLET_STYLES[kind].size*scale,delay:0,cleanOnOutOfRange:false}));
    if(frame===120)game.battle.playerAdapter.cancelBullets(0,224,2000,{reason:'bonus',reward:false});
  }else{
    if(frame===180){game.battle.finished=true;game.battle.boss.alive=false;session.settings={...session.settings,skipDialogue:false};session.openDialogue('after');}
    if(frame===240)session.dialogue.finish();
  }
  frame++;
},render:()=>game.render(),snapshot:()=>({frame,state:session.state,boss:game.battle.bossKey,battleFrame:game.battle.frame,
  dialogue:session.dialogue?.snapshot()??null,portrait:session.dialogue?.portraitState('left')??null,
  stageClear:session.stageClear?.snapshot()??null,transition:session.stageTransition?.snapshot()??null,
  completed:session.completedBattles.length,coverStart,
  player:{x:game.battle.sharedPlayer.x,y:game.battle.sharedPlayer.y,frame:game.battle.sharedPlayer.frame,
    nextShotId:game.battle.sharedPlayer.nextShotId,bodyQuads:bodyQuads(),
    bodyX:game.battle.sharedPlayer.animation.x,bodyY:game.battle.sharedPlayer.animation.y},
  background:game.graphics.stageArtwork.snapshot(),
  bullets:bullets.map(b=>({kind:b.kind,alive:b.alive,size:b.size,scale:game.battle.bulletVisuals.visuals.get(b)?.animation.scale2X??null})),
  cancelEffects:game.battle.bulletVisuals.effects.map(vm=>({script:vm.scriptId,scale:vm.scale2X}))})};
`);
  const variants=[];
  for(const backend of ['v8','quickjs']){
    const prefix=path.join(out,backend+'-'+scene.name),p=spawnSync(path.join(root,'build/Release/ts-stg.exe'),
      [path.relative(root,entry),'--root',root,'--backend',backend,'--benchmark','--frames',String(scene.frame+1),
        '--snapshot',prefix+'.json','--screenshot',prefix+'.png'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(prefix+'.log',(p.stdout??'')+(p.stderr??''));if(p.error)throw p.error;assert.equal(p.status,0,p.stderr);
    const state=JSON.parse(fs.readFileSync(prefix+'.json','utf8'));
    if(scene.cancel){
      assert.equal(state.bullets.length,9);assert.ok(state.bullets.every(b=>b.alive===(scene.frame<120)));
      for(let index=0;index<state.bullets.length;index++)if(state.bullets[index].scale!==null)
        assert.equal(state.bullets[index].scale,[.375,1,2][index%3]);
      assert.ok(state.cancelEffects.every(vm=>vm.scale===1),'independent source fragments never inherit actor scale');
      if(scene.frame>=120)assert.ok(state.cancelEffects.length>0);
    }else{
      assert.equal(state.boss,scene.frame<581?'sunny':'monstone');
      assert.ok(state.player.bodyQuads>0,'Player body remains drawable throughout normal stage cover');
      assert.equal(state.player.bodyX,state.player.x,'The rendered body uses the carried position on the handoff frame');
      assert.equal(state.player.bodyY,state.player.y);
      if(scene.frame===239)assert.ok(state.dialogue.boxScript!==null);
      if(scene.frame===240){assert.deepEqual(state.dialogue.exit,{frame:0,handedOff:false});assert.equal(state.stageClear,null);}
      if(scene.frame===255){assert.deepEqual(state.dialogue.exit,{frame:15,handedOff:true});assert.equal(state.stageClear.age,14);assert.ok(state.portrait.alpha>0&&state.portrait.alpha<255);}
      if(scene.frame===301){assert.equal(state.dialogue.complete,true);assert.equal(state.stageClear.age,60);}
      if(scene.frame===551){assert.equal(state.transition.phase,'cover');assert.equal(state.transition.age,0);assert.equal(state.transition.alpha,0);}
      if(scene.frame===566){assert.equal(state.transition.phase,'cover');assert.equal(state.transition.age,15);assert.equal(state.transition.alpha,127);}
      if(scene.frame===551||scene.frame===566){
        const age=state.transition.age;
        assert.equal(state.player.x,state.coverStart.x+state.coverStart.speed*age);
        assert.equal(state.player.frame,state.coverStart.playerFrame+age);
        assert.equal(state.player.nextShotId,state.coverStart.nextShotId,'Held fire creates no shots during cover');
        assert.equal(state.battleFrame,state.coverStart.battleFrame,'Cover freezes the old Boss and enemy-bullet simulation');
      }
      if(scene.frame===581){
        assert.equal(state.transition.phase,'reveal');assert.equal(state.transition.alpha,255);assert.equal(state.battleFrame,0);
        assert.equal(state.player.x,state.coverStart.x+state.coverStart.speed*30,'New stage inherits the final cover position');
        assert.equal(state.player.y,state.coverStart.y);
      }
      if(scene.frame===596){assert.equal(state.transition.phase,'reveal');assert.equal(state.transition.age,15);assert.equal(state.battleFrame,15);}
      if(scene.frame===611){assert.equal(state.transition,null);assert.equal(state.battleFrame,30);}
    }
    variants.push({backend,state,pngSha256:sha(prefix+'.png')});
  }
  assert.deepEqual(variants[0].state,variants[1].state,scene.name+': backend state parity');
  assert.equal(variants[0].pngSha256,variants[1].pngSha256,scene.name+': backend image parity');
  results.push({scene,state:variants[0].state,backends:variants.map(({backend,pngSha256})=>({backend,pngSha256}))});
  console.log('PASS '+scene.name);
}
assert.deepEqual(hashes(),sourceHashes,'Source changed during verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,results,binarySha256:sha(path.join(root,'build/Release/ts-stg.exe')),
  scope:'Real public rendering and Rush portraits/backgrounds; attacks suppressed and dialogue completion controlled to isolate source transition and cancellation boundaries. Movement and held fire during cover verify Player continuity without advancing the retired Boss.',originalExecutableRun:false},null,2)+'\n');
