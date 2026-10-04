// Source ANM exit timeline in the public player owner, on either native backend.
// --prepare writes fixtures/commands without starting a window or GPU process.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',prepare=false,chosen=null,output='reports/touhou-marisa-bomb-release';
for(let i=0;i<args.length;i++){
  if(args[i]==='--prepare')prepare=true;
  else if(args[i]==='--backend')backend=args[++i];
  else if(args[i]==='--scene')chosen=args[++i].split(',').map(Number);
  else if(args[i]==='--out')output=args[++i];
  else throw new Error(`Unknown argument ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend));
const samples=[300,301,306,311,321,342].filter(frame=>!chosen||chosen.includes(frame));
assert.ok(samples.length);if(chosen)assert.ok(chosen.every(frame=>samples.includes(frame)));
const scratch=join(root,'build/touhou-marisa-bomb-release'),out=resolve(root,output);
mkdirSync(scratch,{recursive:true});mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const tracked=['packages/thlib/src/touhou/bombs.js','packages/thlib/src/touhou/player.js',
  'packages/thlib/src/touhou/anm-vm.js','packages/thlib/src/touhou/anm-render.js',
  'packages/thlib/assets/touhou-common/anm/pl01.json'];
const hashes=()=>Object.fromEntries(tracked.map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=hashes(),fixtures=[],results=[];
for(const frames of samples){
  const name=`${backend}-${frames}`,entry=join(scratch,`${name}.js`),prefix=join(out,name);
  writeFileSync(entry,`import {DrawList,Keys} from '@ts-stg/thlib';
import {createTouhouResources,TouhouPlayer,getTouhouPlayerData,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
const resources=createTouhouResources(tsstg),player=new TouhouPlayer({character:1,sht:getTouhouPlayerData(1),
 bank:resources.banks.pl01,effectBank:resources.banks.effect});
const context={enemyReady:true},draw=new DrawList(),queue=new TouhouRenderQueue();
player.triggerBomb(context);const bomb=player.bomb;let frame=0;
globalThis.__tsstg_game={update(){player.update(frame>300?Keys.RIGHT:0,context);frame++;},
 render(){draw.reset().clear(0x101829ff);queue.reset();player.draw(queue,{x:336,y:24,scale:1.5,screenScale:1});queue.flush(draw);return draw.commands;},
 snapshot(){return{frame,source:'TH20 bomb_system/marisa.cpp + pl01:51..57,65',
  bombAlive:bomb.alive,ownerHasBomb:!!player.bomb,beamAlive:bomb.beam.alive,auraAlive:bomb.aura.alive,
  bombBlocksShots:player.bombBlocksShots,movementScale:player.movementScale,playerX:player.x,bombX:bomb.x,
  beams:bomb.beam.children.filter(vm=>vm.scriptId>=52&&vm.scriptId<=56).map(vm=>({script:vm.scriptId,alpha:vm.alpha,scale:[vm.scaleX,vm.scaleY]})),
  waves:bomb.beam.children.filter(vm=>vm.scriptId===57).map(vm=>vm.snapshot()),
  bankAliveBombs:resources.banks.pl01.instances.filter(vm=>vm.alive&&vm.scriptId>=51&&vm.scriptId<=65).length};}};
`);
  const exe=join(root,'build/Release/ts-stg.exe'),command=[relative(root,entry),'--root',root,'--backend',backend,
    '--frames',String(frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`];
  fixtures.push({frames,entry,exe,args:command});if(prepare)continue;
  const child=spawnSync(exe,command,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(`${prefix}-output.txt`,(child.stdout??'')+(child.stderr??''));
  if(child.error)throw child.error;assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  const state=JSON.parse(readFileSync(`${prefix}.json`));assert.equal(state.frame,frames);
  assert.equal(state.beams.length,frames<311?5:0);
  if(frames===306)assert.ok(state.beams.every(vm=>vm.alpha>0&&vm.alpha<160&&vm.scale[1]<1.5));
  assert.equal(state.auraAlive,frames<321);assert.equal(state.bombAlive,frames<342);
  assert.equal(state.ownerHasBomb,frames<342);assert.equal(state.bombBlocksShots,frames<301);
  if(frames>=311){assert.equal(state.movementScale,1);assert.ok(state.playerX>state.bombX);}
  if(frames===342)assert.equal(state.bankAliveBombs,0);
  assert.deepEqual(hashes(),before,'Tracked source changed during native capture');
  results.push({frames,state,screenshot:`${prefix}.png`,sha256:hash(readFileSync(`${prefix}.png`))});
  console.log(`${name}: native source Bomb exit PASS`);
}
writeFileSync(join(out,`${backend}-${prepare?'prepared':'report'}.json`),JSON.stringify({
  scope:'Public original ANM animations and player ownership, not original executable pixel comparison',
  backend,prepare,sourceSha256:before,fixtures,results},null,2));
console.log(prepare?`Prepared ${fixtures.length} native fixtures; no game process started.`:`Verified ${results.length} native release frames.`);
