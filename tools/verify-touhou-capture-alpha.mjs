// Native evidence for source p14: RGB stays untouched while camera-3 alpha
// becomes opaque, before source Boss grid and any DESTALPHA consumer.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';
const root=resolve(import.meta.dirname,'..'),baseline=process.argv.includes('--baseline');
const outputArg=process.argv.indexOf('--out'),out=resolve(root,outputArg>=0?process.argv[outputArg+1]:'reports/rushboss/capture-alpha');
const scratch=join(root,'build/capture-alpha-verification');mkdirSync(out,{recursive:true});mkdirSync(scratch,{recursive:true});
const run=(label,code,frames)=>{
 const entry=join(scratch,`${label}.js`),prefix=join(out,label);writeFileSync(entry,code);
 const r=spawnSync(join(root,'build/Release/ts-stg.exe'),[relative(root,entry),'--root',root,'--backend','v8','--frames',String(frames),'--benchmark','--snapshot',`${prefix}.json`,'--screenshot',`${prefix}.png`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:90000});
 writeFileSync(`${prefix}.log`,(r.stdout??'')+(r.stderr??''));if(r.error)throw r.error;assert.equal(r.status,0,`${label}: ${r.stderr}`);
 return {state:JSON.parse(readFileSync(`${prefix}.json`)),png:`${prefix}.png`};
};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const compare=(a,b)=>{
 const x=decodeRgbaPng(readFileSync(a)),y=decodeRgbaPng(readFileSync(b));assert.equal(x.width,y.width);assert.equal(x.height,y.height);
 let changedPixels=0,maxChannelDifference=0,absoluteDifference=0;const box={x:x.width,y:x.height,right:0,bottom:0};
 for(let row=0;row<x.height;row++)for(let col=0;col<x.width;col++){
  const i=(row*x.width+col)*4;let changed=false;
  for(let c=0;c<3;c++){const delta=Math.abs(x.rgba[i+c]-y.rgba[i+c]);changed||=delta!==0;maxChannelDifference=Math.max(maxChannelDifference,delta);absoluteDifference+=delta;}
  if(changed){changedPixels++;box.x=Math.min(box.x,col);box.y=Math.min(box.y,row);box.right=Math.max(box.right,col);box.bottom=Math.max(box.bottom,row);}
 }
 return{changedPixels,maxChannelDifference,absoluteDifference,bounds:box};
};
const production=[];
for(const frames of [120,600]){
 const results={};
 for(const variant of baseline?['no-mask']:['full','no-mask']){
  results[variant]=run(`sunny-spell-${frames}-${variant}`,`import {createRushPortraitGame} from '../../games/rushboss/src/portrait-application.js';
import {SaveStore} from '@ts-stg/thlib';
const game=createRushPortraitGame(tsstg,{startBoss:'sunny',phaseIndex:1,difficulty:3,mode:'spell',invincible:true,skipDialogue:true,store:new SaveStore()});
game.setVolume('musicVolume',0);game.setVolume('soundVolume',0);
${variant==='no-mask'?'game.graphics.compositor._opaqueCapture=()=>{};':''}
let frame=0;globalThis.__tsstg_game={update(){game.update(0);frame++;},render(){return game.render();},snapshot(){return{hostFrames:frame,...game.snapshot()};}};`,frames);
 }
 if(!baseline){
  assert.deepEqual(results.full.state,results['no-mask'].state,`frame${frames}: alpha composition changed simulation`);
  const delta=compare(results.full.png,results['no-mask'].png);
  assert.ok(delta.changedPixels>0,`frame${frames}: p14 mask must visibly affect original captured translucent ANM`);
  production.push({frames,simulationIdentical:true,delta,pngSha256:{full:sha(results.full.png),withoutMask:sha(results['no-mask'].png)}});
 }else production.push({frames,pngSha256:sha(results['no-mask'].png),baseline:true});
 console.log(`PASS production frame${frames} ${baseline?'baseline captured':`${production.at(-1).delta.changedPixels} RGB pixels changed`}`);
}
const fixtures=[];
if(!baseline)for(const masked of [false,true]){
 const label=`contrast-${masked?'mask':'no-mask'}`,r=run(label,`import {DrawList} from '@ts-stg/thlib';
import {TouhouGameplayCompositor,TouhouRenderQueue} from '@ts-stg/thlib/touhou';
const a=tsstg.createRenderTarget(960,720),b=tsstg.createRenderTarget(960,720),comp=new TouhouGameplayCompositor({renderTarget:a,compositeTarget:b});
if(!${masked})comp._opaqueCapture=()=>{};
let frame=0,pixels=null,masks=[],firstCaptureEnd=-1;const pixel=(image,x,y)=>Array.from(image.pixels.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));
globalThis.__tsstg_game={update(){frame++;if(frame===2){const image=tsstg.readTexturePixels();pixels={original:pixel(image,110,210),warped:pixel(image,410,310),cameraAlpha:pixel(image,600,350),outsideCameraAlpha:pixel(image,700,350),destAlphaConsumer:pixel(image,600,500)};}},render(){
 const d=new DrawList(),q=new TouhouRenderQueue();
 q.enqueuePriority(5,t=>t.blendFactors('one','zero','add','one','zero','add').rect(0,0,960,720,0x20406040).blendEnd());
 q.enqueuePriority(13,t=>t.blendFactors('srcAlpha','one','add','one','zero','add').rect(100,200,40,40,0xff000080).blendEnd());
 q.enqueuePriority(16,t=>t.blendFactors('dstAlpha','oneMinusDstAlpha','add','one','zero','add').rect(580,480,40,40,0xff0000ff).blendEnd());
 comp.draw(d,q,{drawDistortion:(t,texture)=>{t.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add').sampler(texture,'point','clamp','clamp');t.mesh(texture,[[400,300,100/960,200/720,0xffffffff],[440,300,140/960,200/720,0xffffffff],[400,340,100/960,240/720,0xffffffff],[440,340,140/960,240/720,0xffffffff]],[0,1,2,1,3,2]).blendEnd();}});
 masks=[];firstCaptureEnd=-1;let target=null;for(let i=0;i<d.commands.length;i++){const c=d.commands[i];if(c[0]==='targetBegin')target=c[1];else if(c[0]==='targetEnd'){if(firstCaptureEnd<0)firstCaptureEnd=i;target=null;}else if(c[0]==='rect'&&c[5]===0x000000ff)masks.push({target,index:i,bounds:c.slice(1,5),blend:d.commands[i-1]});}return d.commands;
},snapshot(){return{masked:${masked},pixels,masks,firstCaptureEnd,targets:{a,b}};}};`,2);
 const expected=masked?{original:[160,64,96,255],warped:[160,64,96,255],cameraAlpha:[32,64,96,255],outsideCameraAlpha:[32,64,96,64],destAlphaConsumer:[255,0,0,255]}:{original:[160,64,96,128],warped:[96,64,96,128],cameraAlpha:[32,64,96,64],outsideCameraAlpha:[32,64,96,64],destAlphaConsumer:[88,48,72,255]};
 assert.deepEqual(r.state.pixels,expected,label);
 assert.equal(r.state.masks.length,masked?1:0,`${label}: exactly one original p14 mask`);
 if(masked){const mask=r.state.masks[0];assert.equal(mask.target,r.state.targets.a,'Only first source capture may be masked');assert.ok(mask.index<r.state.firstCaptureEnd,'Mask must run before A is sampled');assert.deepEqual(mask.bounds,[24,0,624,720],'Source camera 3 is 416x480 units with 16-unit field margins at scale1.5');assert.deepEqual(mask.blend,['blendFactors','zero','one','add','one','zero','add']);}
 fixtures.push(r.state);console.log(`PASS ${label}: source mask RGB preservation, camera scope, warp alpha and DESTALPHA pixel checks`);
}
const textureAlphaProof=[];
if(!baseline)for(const alpha of [64,128,255]){
 const cases={};
 for(const mode of ['current','mask','vertex-alpha']){
  const r=run(`source-selectarg2-${mode}-${alpha}`,`import {DrawList} from '@ts-stg/thlib';
const a=tsstg.createRenderTarget(960,720),b=tsstg.createRenderTarget(960,720);
const shader=${mode==='vertex-alpha'?"tsstg.createShader('#version 330\\nin vec2 fragTexCoord;in vec4 fragColor;uniform sampler2D texture0;uniform vec4 colDiffuse;out vec4 finalColor;void main(){vec4 t=texture(texture0,fragTexCoord);finalColor=vec4(t.rgb*colDiffuse.rgb*fragColor.rgb,colDiffuse.a*fragColor.a);}')":'null'};
let frame=0,pixels=null;const pixel=(image,x,y)=>Array.from(image.pixels.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));
globalThis.__tsstg_game={update(){frame++;if(frame===2)pixels={capture:pixel(tsstg.readTexturePixels(a),110,210),warped:pixel(tsstg.readTexturePixels(b),410,310)};},render(){
 const d=new DrawList();d.targetBegin(a,0x000000ff);
 d.blendFactors('srcAlpha','one','add','one','zero','add').rect(100,200,40,40,${(0xff000000+alpha)>>>0}).blendEnd();
 ${mode==='mask'?"d.blendFactors('zero','one','add','one','zero','add').rect(24,0,624,720,0x000000ff).blendEnd();":''}
 d.targetEnd().targetBegin(b,0x000000ff);
 d.blendFactors('one','zero','add','one','zero','add').sprite(a,480,360,960,720).blendEnd();
 d.blendFactors('srcAlpha','oneMinusSrcAlpha','add','one','zero','add').sampler(a,'point','clamp','clamp');
 if(shader!==null)d.shaderBegin(shader);
 d.mesh(a,[[400,300,100/960,200/720,0xffffffff],[440,300,140/960,200/720,0xffffffff],[400,340,100/960,240/720,0xffffffff],[440,340,140/960,240/720,0xffffffff]],[0,1,2,1,3,2]);
 if(shader!==null)d.shaderEnd();d.blendEnd().targetEnd();
 d.blendFactors('one','zero','add','one','zero','add').sprite(b,480,360,960,720).blendEnd();return d.commands;
},snapshot(){return{mode:${JSON.stringify(mode)},alpha:${alpha},pixels};}};`,2);
  cases[mode]=r.state;
 }
 assert.equal(cases.current.pixels.capture[0],alpha);assert.equal(cases.current.pixels.capture[3],alpha);
 assert.equal(cases.mask.pixels.capture[3],255);assert.deepEqual(cases.mask.pixels.warped,cases['vertex-alpha'].pixels.warped);
 assert.equal(cases.mask.pixels.warped[0],alpha);
 if(alpha<255)assert.ok(cases.current.pixels.warped[0]<cases.mask.pixels.warped[0]);
 textureAlphaProof.push({alpha,cases});console.log(`PASS source SELECTARG2 alpha${alpha}: mask matches independent vertex-alpha shader`);
}
writeFileSync(join(out,'report.json'),JSON.stringify({format:'ts-stg-capture-alpha-v1',backend:'v8',baseline,originalExecutableRun:false,sourceCompositorSha256:sha(join(root,'packages/thlib/src/touhou/gameplay-compositor.js')),scope:'Native GPU contrasting-color original p14 blend oracle, independent original SELECTARG2 vertex-alpha shader, and paired actual Sunny spell frame120/600 renders; complete game snapshots identical. Source executable is not run.',passed:true,fixtures,textureAlphaProof,production},null,2)+'\n');
