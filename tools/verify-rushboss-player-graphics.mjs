// Real QuickJS/GPU proof of the restored player and original ANM presentation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/shared-player-graphics',selected;
for(let i=0;i<args.length;i++){
  if(args[i]==='--out')output=args[++i];
  else if(args[i]==='--scene')selected=args[++i];
  else throw Error(`Unknown argument ${args[i]}`);
}
const scenes=[];
for(const [character,name]of [[0,'reimu'],[1,'marisa']]){
  scenes.push({name:`${name}-shot`,character,focused:false,bomb:false});
  scenes.push({name:`${name}-focus`,character,focused:true,bomb:false});
  scenes.push({name:`${name}-bomb`,character,focused:true,bomb:true});
}
const cases=scenes.filter(s=>!selected||s.name===selected);assert.ok(cases.length);
const directory=resolve(root,output),fixtures=join(root,'build/rushboss-player-graphics');
mkdirSync(directory,{recursive:true});mkdirSync(fixtures,{recursive:true});
const exe=join(root,'build/Release/ts-stg.exe');assert.ok(existsSync(exe));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const codeFiles=['games/rushboss/src/runtime.js','games/rushboss/src/player-adapter.js',
  'games/rushboss/src/graphics.js','games/rushboss/src/bullet-visuals.js','games/rushboss/src/game.js',
  'packages/thlib/src/touhou/player.js','packages/thlib/src/touhou/shots.js','packages/thlib/src/touhou/bombs.js',
  'packages/thlib/src/touhou/resources.js','packages/thlib/src/touhou/anm-vm.js','packages/thlib/src/touhou/anm-render.js'];
const hashes=()=>Object.fromEntries(codeFiles.map(file=>[file,hash(join(root,file))]));
const results=[];
for(const scene of cases){
  const code=hashes(),prefix=join(directory,scene.name),entry=join(fixtures,`${scene.name}.js`);
  const frames=scene.bomb?170:122;
  writeFileSync(entry,`import {Keys} from '@ts-stg/thlib';
import {TouhouPlayer,TouhouShot,TouhouReimuBomb,TouhouMarisaBomb,getTouhouPlayerData} from '@ts-stg/thlib/touhou';
import {createRushGame} from '../../games/rushboss/src/game.js';
const game=createRushGame(tsstg,{startBoss:'sunny',phaseIndex:0,practice:true,character:${scene.character},invincible:true});
// This visual fixture keeps the target alive through the complete Bomb capture;
// the application's actual Boss HP and damage rules remain unchanged.
game.battle.boss.hp=game.battle.boss.maxHp=1e9;
game.soundVolume=0;tsstg.playMusic(game.musicId,0);let frame=0;
let sawSharedShot=false,sawSharedBomb=false;const scripts=new Set(),effectScripts=new Set();
globalThis.__tsstg_game={update(){
 game.update(Keys.SHOOT${scene.focused?'|Keys.FOCUS':''}${scene.bomb?'|(frame===90?Keys.BOMB:0)':''});frame++;
 const p=game.battle.sharedPlayer;
 sawSharedShot||=p.shots.some(s=>s.constructor===TouhouShot);
 sawSharedBomb||=p.bomb?.constructor===(p.character?TouhouMarisaBomb:TouhouReimuBomb);
 for(const vm of p.bank.instances)scripts.add(vm.scriptId);for(const vm of p.effectBank.instances)effectScripts.add(vm.scriptId);
},render(){return game.render();},snapshot(){return{...game.snapshot(),proof:{
 playerIsShared:game.battle.sharedPlayer.constructor===TouhouPlayer,
 shotDataIsShared:game.battle.sharedPlayer.sht===getTouhouPlayerData(${scene.character}),
 scripts:[...scripts].sort((a,b)=>a-b),effectScripts:[...effectScripts].sort((a,b)=>a-b),
 sawSharedShot,sawSharedBomb,bombClass:game.battle.sharedPlayer.bomb?.constructor.name??null,
 bank:game.battle.sharedPlayer.bank.data.name,effectBank:game.battle.sharedPlayer.effectBank.data.name,
 focused:game.battle.sharedPlayer.focused,bombs:game.battle.sharedPlayer.bombs,
 activeShots:game.battle.sharedPlayer.shots.length}};}};
`);
  const child=spawnSync(exe,[relative(root,entry),'--root',root,'--frames',String(frames),'--benchmark',
    '--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`,'--profile',`${prefix}-profile.json`,'--profile-warmup','30'],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(`${prefix}-output.txt`,(child.stdout??'')+(child.stderr??''));
  if(child.error)throw child.error;assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  const state=JSON.parse(readFileSync(`${prefix}.json`)),proof=state.proof;
  assert.equal(state.screen,'battle');assert.equal(proof.playerIsShared,true);assert.equal(proof.shotDataIsShared,true);
  assert.equal(state.battle.finished,false,'The complete Bomb must remain visible without the result overlay');
  assert.equal(proof.sawSharedShot,true);
  assert.equal(proof.focused,scene.focused);assert.equal(proof.sawSharedBomb,scene.bomb);
  assert.equal(state.graphics.playerPresentation.implementation,'@ts-stg/thlib/touhou TouhouPlayer.draw');
  assert.equal(state.graphics.playerPresentation.options,4);
  assert.equal(proof.effectScripts.includes(19),scene.focused);
  assert.ok(proof.scripts.length>=5,'Full body/options/weapon ANM scripts must execute');
  if(scene.bomb){
    assert.equal(proof.bombs,2);assert.equal(proof.bombClass,scene.character?'TouhouMarisaBomb':'TouhouReimuBomb');
    for(const script of scene.character?[51,57,65]:[46,61])assert.ok(proof.scripts.includes(script),`Missing complete Bomb ANM ${script}`);
  }
  assert.deepEqual(hashes(),code,'Code changed during native capture');
  results.push({scene:scene.name,frames,proof,screenshot:`${prefix}.png`,screenshotSha256:hash(`${prefix}.png`),
    graphics:state.graphics,codeSha256:code,profile:`${prefix}-profile.json`});
  console.log(`${scene.name}: restored Player/SHT/ANM${scene.bomb?'/Bomb':''} PASS`);
}
writeFileSync(join(directory,'report.json'),JSON.stringify({format:'ts-stg-rushboss-shared-player-graphics-v1',
  scope:'Real QuickJS player actions and rendered GPU frames; complete shared SHT and executed original ANM scripts.',
  binarySha256:hash(exe),results},null,2));
console.log(`Shared-player GPU verification: ${results.length} scenes passed.`);
