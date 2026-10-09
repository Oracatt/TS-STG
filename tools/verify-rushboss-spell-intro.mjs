// Real QuickJS/GPU milestones of the opening of a spell. Source formulas are
// tested separately; these captures are not original-executable pixel oracles.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let output='reports/rushboss/spell-intro',binary='build/Release/ts-stg.exe',selection;
for(let i=0;i<args.length;i++){
  if(args[i]==='--out')output=args[++i];else if(args[i]==='--exe')binary=args[++i];
  else if(args[i]==='--boss')selection=args[++i];else throw Error('Unknown option '+args[i]);
}
const directory=resolve(root,output),fixtures=join(root,'build/rushboss-spell-intro');
mkdirSync(directory,{recursive:true});mkdirSync(fixtures,{recursive:true});
const exe=resolve(root,binary);assert.ok(existsSync(exe));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex'),results=[];
const codePaths=['games/rushboss/src','packages/thlib/dist','packages/thlib/dist/touhou'].flatMap(directory=>
  readdirSync(join(root,directory)).filter(name=>name.endsWith('.js')).map(name=>`${directory}/${name}`));
const sourceHashes=()=>Object.fromEntries(codePaths.map(path=>[path,hash(join(root,path))]));
for(const boss of ['sunny','monstone','artia'].filter(b=>!selection||selection===b)){
  for(const frames of [1,15,20,30,40,60,75,90,120]){
    const scene=`${boss}-${String(frames).padStart(3,'0')}`,entry=join(fixtures,scene+'.js'),prefix=join(directory,scene);
    writeFileSync(entry,`import {createRushGame} from '../../games/rushboss/src/game.js';
const game=createRushGame(tsstg,{startBoss:${JSON.stringify(boss)},phaseIndex:1,difficulty:1,practice:true,invincible:true});
game.soundVolume=0;tsstg.playMusic(game.musicId,0);
globalThis.__tsstg_game={update(){game.update(0);},render(){return game.render();},snapshot(){return game.snapshot();}};
`);
    const code=sourceHashes();
    const child=spawn(exe,[relative(root,entry),'--root',root,'--frames',String(frames),'--benchmark',
      '--screenshot',prefix+'.png','--snapshot',prefix+'.json'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let messages='';child.stdout.on('data',data=>messages+=data);child.stderr.on('data',data=>messages+=data);
    const status=await new Promise((done,fail)=>{child.on('close',done);child.on('error',fail);});
    assert.equal(status,0,scene+': '+messages);
    assert.deepEqual(sourceHashes(),code,`${scene}: sources changed during capture`);
    const state=JSON.parse(readFileSync(prefix+'.json'));assert.equal(state.screen,'battle');
    assert.equal(state.battle.frame,frames);assert.equal(state.battle.phaseFrame,frames);assert.equal(state.battle.finished,false);
    assert.ok(state.graphics.spellCommonTextures>0,'Opening effects must load the public common spell assets');
    const presentation=state.graphics.spellPresentation;
    assert.equal(presentation.implementation,'@ts-stg/thlib/touhou TouhouBossPresentation');
    assert.deepEqual(presentation.shared.auraScripts,[99,108]);
    assert.deepEqual(presentation.shared.effectScripts,[4,5]);
    assert.deepEqual(presentation.shared.openingScripts,[13]);
    assert.equal(presentation.shared.distortion.columns,17);
    assert.equal(presentation.shared.distortion.radius,160);
    assert.equal(presentation.magicFrame,frames,'The actual presentation must advance with simulation');
    assert.equal(presentation.cards.length,1);assert.equal(presentation.cards[0].age,frames);
    assert.deepEqual(presentation.entrances,frames<=90?[frames]:[],'The complete cut-in must retire after frame 90');
    results.push({scene,boss,frames,screenshot:prefix+'.png',screenshotSha256:hash(prefix+'.png'),snapshot:prefix+'.json',graphics:state.graphics,sourceSha256:code});
    console.log(scene+': captured');
  }
}
writeFileSync(join(directory,'report.json'),JSON.stringify({format:'ts-stg-rushboss-spell-intro-v1',
  scope:'Real native spell-opening milestones; not original-executable pixel equivalence',binarySha256:hash(exe),results},null,2));
