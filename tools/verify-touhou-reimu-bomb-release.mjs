// Capture the real public Bomb tree, centered on one orb without rescaling it.
// This verifies host rendering/ownership, not original executable pixels.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let backend='v8',prepare=false,output='reports/touhou-reimu-bomb-release';
for(let i=0;i<args.length;i++){
  if(args[i]==='--prepare')prepare=true;
  else if(args[i]==='--backend')backend=args[++i];
  else if(args[i]==='--out')output=args[++i];
  else throw new Error(`Unknown argument ${args[i]}`);
}
assert.ok(['v8','quickjs'].includes(backend));
const samples=[240,241,251,261,291,302];
const scratch=join(root,'build/touhou-reimu-bomb-release'),out=resolve(root,output);
mkdirSync(scratch,{recursive:true});mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const tracked=['packages/thlib/src/touhou/bombs.js','packages/thlib/src/touhou/player.js',
  'packages/thlib/src/touhou/anm-vm.js','packages/thlib/src/touhou/anm-render.js',
  'packages/thlib/assets/touhou-common/anm/pl00.json'];
const hashes=()=>Object.fromEntries(tracked.map(file=>[file,hash(readFileSync(join(root,file)))]));
const before=hashes(),fixtures=[],results=[];
for(const frames of samples){
  const name=`${backend}-${frames}`,entry=join(scratch,`${name}.js`),prefix=join(out,name);
  writeFileSync(entry,`import {DrawList} from '@ts-stg/thlib';
import {createTouhouResources,TouhouPlayer,getTouhouPlayerData,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
const resources=createTouhouResources(tsstg),player=new TouhouPlayer({sht:getTouhouPlayerData(0),
 bank:resources.banks.pl00,effectBank:resources.banks.effect});
const draw=new DrawList(),queue=new TouhouRenderQueue();
player.triggerBomb();const bomb=player.bomb;let frame=0;
globalThis.__tsstg_game={update(){player.update(0);frame++;},
 render(){draw.reset().clear(0x182030ff);queue.reset();const orb=bomb.orbs[0];
  if(orb)orb.animation.draw(queue,{x:480-orb.x*1.5,y:360-orb.y*1.5,scale:1.5,screenScale:1});
  queue.flush(draw);return draw.commands;},
 snapshot(){const orb=bomb.orbs[0],children=orb.animation.children.filter(vm=>vm.alive);
  return{frame,scope:'Real public player/Bomb; camera follows one orb; original 1.5 screen scale',
   bombAlive:bomb.alive,ownerHasBomb:!!player.bomb,auraAlive:bomb.aura.alive,
   activeOrbs:bomb.orbs.filter(value=>value.active).length,rootAlive:orb.animation.alive,
   cores:children.filter(vm=>[49,51,53].includes(vm.scriptId)).length,
   fragments:children.filter(vm=>[50,52,54].includes(vm.scriptId)).map(vm=>({script:vm.scriptId,alpha:vm.alpha,scale:[vm.scaleX,vm.scaleY]})),
   flash:children.filter(vm=>vm.scriptId===48).map(vm=>({alpha:vm.alpha,scale:[vm.scaleX,vm.scaleY]})),
   bankAliveBombs:resources.banks.pl00.instances.filter(vm=>vm.alive&&vm.scriptId>=46&&vm.scriptId<=61).length};}};
`);
  const exe=join(root,'build/Release/ts-stg.exe'),command=[relative(root,entry),'--root',root,'--backend',backend,
    '--frames',String(frames),'--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`];
  fixtures.push({frames,entry,exe,args:command});if(prepare)continue;
  const child=spawnSync(exe,command,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  writeFileSync(`${prefix}-output.txt`,(child.stdout??'')+(child.stderr??''));
  if(child.error)throw child.error;assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  const state=JSON.parse(readFileSync(`${prefix}.json`));assert.equal(state.frame,frames);
  assert.equal(state.activeOrbs,frames<=240?16:0);assert.equal(state.cores,frames<=240?6:0);
  assert.equal(state.fragments.length,frames>240&&frames<291?6:0);
  assert.equal(state.flash.length,frames>240&&frames<261?1:0);
  assert.equal(state.auraAlive,frames<261);assert.equal(state.bombAlive,frames<302);
  assert.equal(state.ownerHasBomb,frames<302);assert.equal(state.rootAlive,frames<301);
  if(frames===251)assert.ok(state.fragments.every(vm=>vm.alpha<254&&vm.alpha>0&&vm.scale[0]<1&&vm.scale[0]>0));
  if(frames===302)assert.equal(state.bankAliveBombs,0);
  assert.deepEqual(hashes(),before,'Tracked source changed during native capture');
  results.push({frames,state,screenshot:`${prefix}.png`,sha256:hash(readFileSync(`${prefix}.png`))});
  console.log(`${name}: native Reimu Bomb exit PASS`);
}
writeFileSync(join(out,`${backend}-${prepare?'prepared':'report'}.json`),JSON.stringify({
  scope:'Public original ANM animations and player ownership; no original executable framebuffer comparison',
  backend,prepare,sourceSha256:before,fixtures,results},null,2));
console.log(prepare?`Prepared ${fixtures.length} fixtures; no game started.`:`Verified ${results.length} native release frames.`);
