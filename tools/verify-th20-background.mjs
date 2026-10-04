// Compile only reconstruction C++ source and the OS D3DX surface-copy service.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {Th20TitleBackground} from '../games/touhou20/src/title-background.js';
import {Th20RNG} from '../games/touhou20/src/math.js';
import {applyPauseNoise,copyPauseSurface} from '../games/touhou20/src/pause-capture.js';
const root=path.resolve(import.meta.dirname,'..'),reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction'),dir=path.join(root,'build/th20-background-oracle'),src=path.join(reference,'source_reconstruction');fs.mkdirSync(dir,{recursive:true});
const unix=p=>p.replaceAll('\\','/'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),bits=x=>new Uint32Array(new Float32Array([x]).buffer)[0];
function body(text,name){const start=text.indexOf(name+'(');if(start<0)throw Error(name);const begin=text.lastIndexOf('\n',start)+1;let end=text.indexOf('{',start),depth=1;for(end++;depth;end++){if(text[end]==='{')depth++;if(text[end]==='}')depth--;}return text.slice(begin,end);}
const meshSource=fs.readFileSync(path.join(src,'sprite_renderer/render_mesh.cpp'),'utf8'),captureSource=fs.readFileSync(path.join(src,'pause_system/capture.cpp'),'utf8');
fs.writeFileSync(path.join(dir,'mesh-source.inc'),['render_mesh_uv','initialize_display_render_mesh'].map(name=>body(meshSource,name)).join('\n'));
const titleSource=fs.readFileSync(path.join(src,'title_system/background_math.cpp'),'utf8');fs.writeFileSync(path.join(dir,'title-source.inc'),['shade_component','deform_background'].map(name=>body(titleSource,name)).join('\n'));
fs.writeFileSync(path.join(dir,'noise-source.inc'),captureSource.slice(captureSource.indexOf('        auto* row='),captureSource.indexOf('        destination->UnlockRect();')));
fs.writeFileSync(path.join(dir,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)
project(th20_background_oracle LANGUAGES CXX)
add_executable(oracle "${unix(path.join(root,'native/tests/th20_background_oracle.cpp'))}" "${unix(src)}/ecl_vm/math.cpp")
target_include_directories(oracle PRIVATE "${unix(src)}" "${unix(src)}/core_scheduler" "${unix(path.join(reference,'native_recovered'))}" "${unix(dir)}")
target_compile_features(oracle PRIVATE cxx_std_17)
target_compile_options(oracle PRIVATE /fp:strict /arch:SSE2 /utf-8)
target_link_libraries(oracle PRIVATE d3d9 user32)
`);
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',maxBuffer:64*1024*1024,...options});if(r.error||r.status!==0)throw Error(`${cmd}: ${r.error??r.stderr}\n${r.stdout}`);return r.stdout;}
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','Win32']);run('cmake',['--build','compiled','--config','Release']);
const oracle=(mode,lines)=>run(path.join(dir,'compiled/Release/oracle.exe'),[],{input:[mode,lines.length,...lines].join('\n')}).trim().split(/\r?\n/).map(line=>line.trim().split(' ').map(Number));
const titleCases=[];for(const width of[640,960,1280])for(const wave of[-3000,-500,0,999,2999,3000,3001])titleCases.push({width,height:width*.75,wave,seed:0x123456,modulus:0x7fffffff,color:wave===999?[3,77,259,129]:[208,208,208,255],offsetX:wave===999?12:0,offsetY:wave===999?-7:0});
const titleOutput=oracle('title',titleCases.map(c=>[c.width,c.height,c.offsetX,c.offsetY,bits(c.wave),c.seed,c.modulus,...c.color].join(' ')));
const failures=[],title=[];let titleWords=0;
titleCases.forEach((c,i)=>{const rng=new Th20RNG(c.seed,c.modulus);rng.last=0;const actual=new Th20TitleBackground({width:c.width,height:c.height,displayOffsetX:c.offsetX,displayOffsetY:c.offsetY,rng});actual.wave=c.wave;actual.color=c.color;actual.update();
 const words=[bits(actual.wave),rng.state,rng.last,...actual.mesh.vertices.flatMap(v=>[bits(v.x),bits(v.y),bits(v.z),bits(v.rhw),v.color,bits(v.u),bits(v.v)])],expected=titleOutput[i];titleWords+=words.length;
 const diff=words.flatMap((v,j)=>v===expected[j]?[]:[{word:j,actual:v,expected:expected[j]}]);if(diff.length)failures.push({type:'title',case:i,count:diff.length,first:diff.slice(0,5)});
 title.push({...c,sha256:hash(Buffer.from(new Uint32Array(expected).buffer))});});
const noiseCases=[{width:16,height:14,rect:{left:2,top:1,right:5,bottom:8},seed:1},{width:16,height:14,rect:{left:2,top:1,right:9,bottom:4},seed:0x123456},{width:512,height:512,rect:{left:0,top:0,right:255,bottom:255},seed:0x7ffffffe}];
const sourcePixel=i=>Math.imul(i+1,0x9e3779b1)>>>0;
const noiseOutput=oracle('noise',noiseCases.map(c=>[c.width,c.height,c.rect.left,c.rect.top,c.rect.right-c.rect.left,c.rect.bottom-c.rect.top,c.seed,...Array.from({length:c.width*c.height},(_,i)=>sourcePixel(i))].join(' ')));
const noise=noiseCases.map((c,i)=>{const pixels=new Uint8Array(c.width*c.height*4);for(let n=0;n<pixels.length/4;n++){const p=sourcePixel(n);pixels.set([(p>>>16)&255,(p>>>8)&255,p&255,p>>>24],n*4);}const rng=new Th20RNG(c.seed,13);applyPauseNoise({...c,pixels},c.rect,rng);const actual=[rng.state,...Array.from({length:pixels.length/4},(_,n)=>{const j=n*4;return((pixels[j+3]<<24)|(pixels[j]<<16)|(pixels[j+1]<<8)|pixels[j+2])>>>0;})];const expected=noiseOutput[i];if(actual.some((v,j)=>v!==expected[j]))failures.push({type:'noise',case:i});return{...c,sha256:hash(Buffer.from(new Uint32Array(expected).buffer))};});
const resizeCases=[{sw:997,sh:1,dw:4093,dh:1,s:[0,0,997,1],d:[0,0,4093,1]},{sw:1000,sh:1,dw:3000,dh:1,s:[0,0,1000,1],d:[0,0,3000,1]},{sw:7,sh:5,dw:3,dh:2,s:[0,0,7,5],d:[0,0,3,2]},{sw:3,sh:2,dw:7,dh:5,s:[0,0,3,2],d:[0,0,7,5]},{sw:9,sh:8,dw:6,dh:7,s:[2,1,8,7],d:[1,2,5,6]},{sw:960,sh:720,dw:512,dh:512,s:[48,24,624,696],d:[0,0,255,255]}];
const rect=a=>({left:a[0],top:a[1],right:a[2],bottom:a[3]}),resizeOutput=oracle('resize',resizeCases.map(c=>[c.sw,c.sh,c.dw,c.dh,...c.s,...c.d].join(' ')));
const resize=resizeCases.map((c,i)=>{const source=new Uint8Array(c.sw*c.sh*4);for(let n=0;n<c.sw*c.sh;n++)source.set([(n>>>16)&255,(n>>>8)&255,n&255,255],n*4);const pixels=new Uint8Array(c.dw*c.dh*4);copyPauseSurface({width:c.sw,height:c.sh,pixels:source},{width:c.dw,height:c.dh,pixels},rect(c.s),rect(c.d));const actual=Array.from({length:pixels.length/4},(_,n)=>{const j=n*4;return((pixels[j+3]<<24)|(pixels[j]<<16)|(pixels[j+1]<<8)|pixels[j+2])>>>0;});const expected=resizeOutput[i];const diff=actual.flatMap((v,j)=>v===expected[j]?[]:[{pixel:j,actual:v,expected:expected[j]}]);if(diff.length)failures.push({type:'resize',case:i,count:diff.length,first:diff.slice(0,5)});return{...c,sha256:hash(Buffer.from(new Uint32Array(expected).buffer))};});
const evidence={titleCases:title.length,titleWords,noiseCases:noise.length,resizeCases:resize.length,failures:failures.length,source:'Local reconstruction background_math.cpp, exact extracted render-mesh and pause-noise source; OS d3dx9_43 point resampling, no original executable',sourceSha256:Object.fromEntries(['title_system/background_math.cpp','sprite_renderer/render_mesh.cpp','pause_system/capture.cpp'].map(name=>[name,hash(fs.readFileSync(path.join(src,name)))]))};
fs.mkdirSync(path.join(root,'reports/th20'),{recursive:true});fs.writeFileSync(path.join(root,'reports/th20/background.json'),JSON.stringify({...evidence,differences:failures},null,2));if(failures.length)throw Error(JSON.stringify(failures.slice(0,5)));
fs.writeFileSync(path.join(root,'tests/fixtures/th20/background.json'),JSON.stringify({evidence,title,noise,resize},null,2));console.log(JSON.stringify(evidence));
