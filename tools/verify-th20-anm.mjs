// Recompile and execute the locally supplied source-only interpreter oracle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {AnmBank} from '../games/touhou20/src/anm-vm.js';
const root=path.resolve(import.meta.dirname,'..'),reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction');
const directory=path.join(root,'build/th20-anm-oracle');fs.mkdirSync(directory,{recursive:true});
const unix=p=>p.replaceAll('\\','/'),src=unix(path.join(reference,'source_reconstruction'));
fs.writeFileSync(path.join(directory,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)
project(th20_anm_oracle LANGUAGES CXX)
add_executable(oracle "${unix(path.join(root,'native/tests/th20_anm_oracle.cpp'))}" "${src}/sprite_renderer/anm_vm.cpp" "${src}/sprite_renderer/animation.cpp" "${src}/ecl_vm/math.cpp")
target_include_directories(oracle PRIVATE "${src}/sprite_renderer" "${unix(path.join(reference,'native_recovered'))}")
target_compile_features(oracle PRIVATE cxx_std_17)
target_compile_options(oracle PRIVATE /fp:strict /arch:SSE2 /utf-8)
`);
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:directory,encoding:'utf8',maxBuffer:32*1024*1024,...options});if(r.error||r.status!==0)throw new Error(`${command}: ${r.error??r.stderr}\n${r.stdout}`);return r.stdout;}
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','Win32']);run('cmake',['--build','compiled','--config','Release']);
const bits=value=>new Uint32Array(new Float32Array([value]).buffer)[0];
const cases=[];
for(const [name,ids]of[['pl00',[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]],['pl01',[0,1,2,3,4,5,6,7,8,9,10,11,12]],['front',[2,6,20,21,32,33,34,35,36,37,38,40,41,42,43,44,45,46,75,76,77,78,100]],['effect',[0,1,2,3,19,20,21,22,23]],['bullet',[0,1,2,3,4,5,6,7,8,9,10]],['enemy',[0,1,2,3,4,5,6,7]]]){
 const data=JSON.parse(fs.readFileSync(path.join(root,`games/touhou20/assets/anm/${name}.json`)));
 for(const id of ids){const script=data.scripts[id];if(script.instructions.some(i=>i.opcode>=500&&i.opcode<=510))continue;
 const events=(name==='front'&&id>=32&&id<=46)?[[2,2],[18,8],[30,3],[50,5],[60,9]]:(name==='pl00'||name==='pl01')&&id<6?[[30,1]]:[];
 cases.push({name,id,data,script,frames:90,events,seed:1});}
}
const inputs=[String(cases.length)];
for(const c of cases){inputs.push([c.data.scripts.length,c.id,c.data.sprites.length,c.frames,c.events.length,c.seed].join(' '));for(const script of c.data.scripts){const bytes=Buffer.alloc(script.instructions.at(-1).offset+8);for(const i of script.instructions){bytes.writeInt16LE(i.opcode,i.offset);bytes.writeUInt16LE(i.size,i.offset+2);bytes.writeInt16LE(i.time,i.offset+4);bytes.writeUInt16LE(i.mask,i.offset+6);i.args.forEach((v,j)=>bytes.writeUInt32LE(v,i.offset+8+j*4));}
 const words=Array.from({length:bytes.length/4},(_,i)=>bytes.readUInt32LE(i*4));inputs.push(String(words.length),words.join(' '));}inputs.push(c.data.sprites.flatMap(s=>[bits(s.width),bits(s.height)]).join(' '),c.events.flat().join(' '));}
const lines=run(path.join(directory,'compiled/Release/oracle.exe'),[],{input:inputs.join('\n')}).trim().split(/\r?\n/).map(line=>line.split(' ').map(Number));
const addresses=[0x14,0x20,0x2c,0x30,0x34,0x38,0x3c,0x40,0x44,0x48,0x4c,0x50,0x54,0x58,0x5c,0x60,0x64,0x68,0x6c,0x70,0x74,0x78,0x7c,0x444,0x448,0x44c,0x450,0x454,0x458,0x45c,0x460,0x484,0x488,0x48c,0x490,0x494,0x498,0x4a4,0x4a8,0x4ac];
let line=0;const failures=[],fixtures=[];
for(let caseIndex=0;caseIndex<cases.length;caseIndex++){const c=cases[caseIndex],bank=new AnmBank(c.data),vm=bank.create(c.id),expectedFrames=[];
 for(let frame=0;frame<c.frames;frame++){for(const event of c.events)if(event[0]===frame)vm.interrupt(event[1]);if(frame)vm.update();
 const expected=lines[line++].slice(2),actual=[+vm.alive,vm.time,vm.pc,bank.rng.state,...addresses.map(a=>vm.U(a))];
 if(actual.some((v,i)=>v!==expected[i])){if(failures.length<100)failures.push({archive:c.name,script:c.id,frame,differences:actual.flatMap((v,i)=>v===expected[i]?[]:[{field:i<4?['alive','time','pc','rng'][i]:`0x${addresses[i-4].toString(16)}`,expected:expected[i],actual:v}])});}
 expectedFrames.push(expected);}
 fixtures.push({archive:c.name,script:c.id,events:c.events,frames:expectedFrames});}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const evidence={description:'Original local ANM source compiled without original executable; selected observable state words compared bit-for-bit at clock 1. Rendering and children require separate validation.',scripts:cases.length,frames:lines.length,wordsPerFrame:addresses.length+4,sourceSha256:hash(path.join(reference,'source_reconstruction/sprite_renderer/anm_vm.cpp')),failures:failures.length};
fs.mkdirSync(path.join(root,'reports/th20'),{recursive:true});fs.writeFileSync(path.join(root,'reports/th20/anm.json'),JSON.stringify({...evidence,failures},null,2));
if(failures.length)throw new Error(`${failures.length} differences: reports/th20/anm.json`);
fs.writeFileSync(path.join(root,'tests/fixtures/th20/anm.json'),JSON.stringify({evidence,addresses,fixtures}));console.log(JSON.stringify(evidence));
