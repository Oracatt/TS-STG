import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/touhou/scene-transition'),scratch=path.join(root,'build/touhou-scene-transition');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sources=['packages/thlib/dist/touhou/scene-transition.js','packages/thlib/dist/touhou/application.js',
  'packages/thlib/assets/touhou-common/anm/screenswitch.json','packages/thlib/assets/touhou-common/anm/ascii_960.json'];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,sha(path.join(root,file))]));
const sourceHashes=hashes(),results=[];
for(const scene of [
  {name:'cover-start',cover:0,reveal:null},
  {name:'cover-moving',cover:15,reveal:null},
  {name:'cover-request',cover:30,reveal:null},
  {name:'cover-loading-hold',cover:46,reveal:null},
  {name:'reveal-start',cover:30,reveal:0},
  {name:'reveal-moving',cover:30,reveal:15},
  {name:'reveal-tail',cover:30,reveal:40},
  {name:'reveal-last-panel',cover:30,reveal:54},
  {name:'reveal-finished',cover:30,reveal:55},
]){
  const variants=[];
  for(const backend of ['v8','quickjs'])for(const common of [false,true]){
    const variant=common?'common':'source',entry=path.join(scratch,`${variant}-${scene.name}.js`),prefix=path.join(out,`${backend}-${variant}-${scene.name}`);
    fs.writeFileSync(entry,`
import {DrawList} from '@ts-stg/thlib';
import {AnmBank,TouhouSceneTransition} from '@ts-stg/thlib/touhou';
const common=${common},scene=${JSON.stringify(scene)},prefix=common?'packages/thlib/assets/touhou-common/':'games/demo/assets/';
const create=name=>new AnmBank(JSON.parse(tsstg.readText(prefix+'anm/'+name+'.json')),
  {loadTexture:p=>tsstg.loadTexture(common?prefix+p:p)});
const effect=new TouhouSceneTransition({bank:create('screenswitch'),loadingBank:create('ascii_960')});
for(let i=0;i<scene.cover;i++)effect.update();
if(scene.reveal!==null){effect.reveal();for(let i=0;i<scene.reveal;i++)effect.update();}
const draw=new DrawList();globalThis.__tsstg_game={update(){},render(){
  draw.reset().clear(0x183048ff);
  for(let row=0;row<12;row++)for(let col=0;col<16;col++)if((row+col)%2===0)draw.rect(col*60,row*60,60,60,0x487898ff);
  draw.rect(325,220,310,280,0xa03048ff);draw.rect(370,265,220,190,0xf8d898ff);
  effect.draw(draw);return draw.commands;
},snapshot:()=>({effect:effect.snapshot(),panels:effect.panels.map(vm=>vm.snapshot()),mask:effect.mask.snapshot(),loading:effect.loading.snapshot()})};
`);
    const run=spawnSync(path.join(root,'build/Release/ts-stg.exe'),[path.relative(root,entry),'--root',root,'--backend',backend,
      '--frames','1','--benchmark','--screenshot',`${prefix}.png`,'--snapshot',`${prefix}.json`],
      {cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(`${prefix}.log`,(run.stdout??'')+(run.stderr??''));if(run.error)throw run.error;assert.equal(run.status,0,run.stderr);
    variants.push({backend,variant,state:JSON.parse(fs.readFileSync(`${prefix}.json`,'utf8')),pngSha256:sha(`${prefix}.png`)});
  }
  for(const variant of variants.slice(1)){
    assert.deepEqual(variant.state,variants[0].state,`${scene.name} source/common/backend state mismatch`);
    assert.equal(variant.pngSha256,variants[0].pngSha256,`${scene.name} source/common/backend pixel mismatch`);
  }
  const image=decodeRgbaPng(fs.readFileSync(path.join(out,`v8-common-${scene.name}.png`)));
  assert.equal(image.width,960);assert.equal(image.height,720);
  assert.equal(variants[0].state.effect.alive,scene.reveal!==55);
  results.push({scene,variants:variants.map(({backend,variant,pngSha256})=>({backend,variant,pngSha256}))});
  console.log(`PASS ${scene.name}: original/common ANM data and V8/QuickJS pixels/state match`);
}
const png=name=>decodeRgbaPng(fs.readFileSync(path.join(out,`v8-common-${name}.png`)));
const start=png('cover-start'),finished=png('reveal-finished'),hold=png('cover-loading-hold');
// Test scene's RGB is unchanged outside the shutters at both endpoints. PNG
// alpha is an implementation detail of the window capture, not the mask oracle.
const pixel=(image,x,y)=>Array.from(image.rgba.subarray((y*image.width+x)*4,(y*image.width+x)*4+3));
for(const [x,y]of [[30,30],[90,30],[480,360],[900,660]])assert.deepEqual(pixel(start,x,y),pixel(finished,x,y));
assert.notDeepEqual(pixel(hold,480,360),pixel(finished,480,360),'Closed panels must cover the game completely');
assert.deepEqual(hashes(),sourceHashes,'Production sources changed during native verification');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({passed:true,sourceHashes,results,
  scope:'Real public owner and native render ABI, using original decoded data versus common pack on a diagnostic scene. No original executable was run.'},null,2)+'\n');
