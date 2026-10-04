// Real host scenes: ordered runs keep concurrent GPU workloads out of timings.
// These screenshots verify the imported resources in the authored engine arena,
// not equivalence to a complete original stage.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workspace=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let root=workspace,binary='build/Release/ts-stg.exe',output='build/th20-graphics',selection,meshOnly=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--exe')binary=args[++i];
  else if(args[i]==='--root')root=resolve(workspace,args[++i]);
  else if(args[i]==='--out')output=args[++i];
  else if(args[i]==='--scene')selection=args[++i];
  else if(args[i]==='--mesh')meshOnly=true;
  else throw new Error(`Unknown argument ${args[i]}`);
}
const scenes=[
  {name:'title',frames:360,options:{},input:'0'},
  {name:'reimu-shoot',frames:480,options:{autostart:true,character:0,power:400},input:'16|64'},
  {name:'marisa-bomb',frames:240,options:{autostart:true,character:1,power:400},input:'16|64|(frame===180?32:0)'},
  {name:'pause',frames:240,options:{autostart:true,character:0,power:400},input:'frame===180?128:16|64'},
].filter(scene=>!selection||selection===scene.name);
assert.ok(scenes.length,`Unknown scene ${selection}`);
assert.ok(existsSync(resolve(root,'games/touhou20/assets/manifest.json')),'Import local reference assets first.');
mkdirSync(resolve(root,'build'),{recursive:true});mkdirSync(resolve(workspace,output),{recursive:true});
const temporary=mkdtempSync(resolve(root,'build/th20-graphics-')),entry=join(temporary,'entry.js'),results=[];
try{
  for(const scene of scenes){
    writeFileSync(entry,`${meshOnly?"import {DrawList} from '../../packages/thlib/src/render.js';delete DrawList.prototype.quad;\n":''}globalThis.__TH20_DEMO_OPTIONS=${JSON.stringify({...scene.options,musicVolume:0})};
await import('../../games/touhou20/main.js');
const game=globalThis.__tsstg_game;let frame=0;
globalThis.__tsstg_game={update(){const mask=${scene.input};game.update(mask);frame++;},render:()=>game.render(),snapshot:()=>({hostFrames:frame,...game.snapshot()})};
`);
    const prefix=resolve(workspace,output,scene.name),child=spawnSync(resolve(workspace,binary),[
      relative(root,entry),'--root',root,'--frames',String(scene.frames),'--benchmark',
      '--profile',`${prefix}-profile.json`,'--profile-warmup','60',
      '--snapshot',`${prefix}-state.json`,'--screenshot',`${prefix}.png`,
    ],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});
    if(child.error)throw child.error;
    assert.equal(child.status,0,`${scene.name}: ${child.stdout}\n${child.stderr}`);
    const state=JSON.parse(readFileSync(`${prefix}-state.json`,'utf8'));
    assert.equal(state.hostFrames,scene.frames);
    assert.equal(state.mode,scene.name==='title'?'title':'game');
    if(scene.name==='pause'){assert.equal(state.paused,true);assert.equal(state.frame,180);}
    else if(scene.name!=='title'){assert.equal(state.frame,scene.frames);assert.equal(state.paused,false);}
    if(scene.name==='marisa-bomb')assert.ok(state.player.bomb,'Marisa Bomb must still be visible at capture.');
    const profile=JSON.parse(readFileSync(`${prefix}-profile.json`,'utf8'));
    results.push({scene:scene.name,frames:scene.frames,screenshot:`${prefix}.png`,profile});
    console.log(JSON.stringify(results.at(-1)));
  }
  writeFileSync(resolve(workspace,output,'report.json'),JSON.stringify({
    format:'ts-stg-th20-graphics-v1',binary,meshOnly,scope:'Real GPU and QuickJS, one update and render per benchmark frame; no frame pacing. Inspect screenshots separately.',results,
  },null,2));
}finally{if(existsSync(entry))unlinkSync(entry);rmdirSync(temporary);}
