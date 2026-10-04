// End-to-end consumer of the public framework, with no games/ imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'reports/touhou-common/framework'),temp=join(root,'build/framework-graphics');
mkdirSync(out,{recursive:true});mkdirSync(temp,{recursive:true});
const cases=[
  {name:'title',frames:150,options:{},mask:'0',mode:'title'},
  {name:'character',frames:198,options:{},mask:'frame===132||frame===160?256:frame===187?2:0',mode:'title'},
  {name:'reimu-bomb',frames:240,options:{autostart:true,character:0},mask:'16|64|(frame===180?32:0)',mode:'game'},
  {name:'marisa-bomb',frames:240,options:{autostart:true,character:1},mask:'16|64|(frame===180?32:0)',mode:'game'},
  {name:'pause',frames:240,options:{autostart:true},mask:'frame===210?128:16',mode:'game'},
],results=[];
for(const scene of cases){
  const entry=join(temp,scene.name+'.js'),prefix=join(out,scene.name);
  writeFileSync(entry,`globalThis.__TOUHOU_FRAMEWORK_OPTIONS=${JSON.stringify(scene.options)};
await import('../../examples/touhou-framework/main.js');
const game=globalThis.__tsstg_game;let frame=0;
globalThis.__tsstg_game={update(){game.update(${scene.mask});frame++;},render:()=>game.render(),snapshot:()=>game.snapshot()};
`);
  const child=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--frames',String(scene.frames),'--benchmark',
    '--snapshot',prefix+'.json','--screenshot',prefix+'.png'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  assert.equal(child.status,0,child.error??child.stdout+child.stderr);
  const state=JSON.parse(readFileSync(prefix+'.json'));assert.equal(state.mode,scene.mode);
  if(scene.name==='character'){assert.equal(state.state,'character');assert.equal(state.selection,1);}
  if(scene.name.includes('bomb'))assert.ok(state.player.bomb,'Full restored Bomb should be visible');
  if(scene.name==='pause'){assert.equal(state.paused,true);assert.equal(state.frame,210);}
  results.push({...scene,screenshot:prefix+'.png',snapshot:prefix+'.json'});console.log('PASS public framework '+scene.name);
}
const hash=path=>createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
writeFileSync(join(out,'report.json'),JSON.stringify({passed:true,scope:'Actual QuickJS/GPU public-only application with authored test stage; no original game executable',
  binarySha256:hash('build/Release/ts-stg.exe'),exampleSha256:hash('examples/touhou-framework/main.js'),results},null,2));
