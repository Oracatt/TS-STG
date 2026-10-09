import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {RUSH_DIALOGUE_DATA} from '../games/rushboss/src/dialogue-data.js';
import {TouhouDialogue,createTouhouResources} from '../packages/thlib/dist/touhou/index.js';import {Keys} from '../packages/thlib/dist/input.js';
const root=path.resolve(import.meta.dirname,'..'),directory=path.resolve(root,'build/rushboss-dialogue-oracle'),reference='D:/c++/TouhouRushBoss-main/src/Dialog.h';fs.mkdirSync(directory,{recursive:true});
const source=fs.readFileSync(reference,'utf8'),at=source.indexOf('void OnUpdate() override'),begin=source.indexOf('{',at);let end=begin+1,depth=1;
for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
fs.writeFileSync(path.join(directory,'dialogue-update.inc'),source.slice(begin,end));
fs.writeFileSync(path.join(directory,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)\nproject(rush_dialogue_oracle LANGUAGES CXX)\nadd_executable(oracle "${root.replaceAll('\\','/')}/native/tests/rush_dialogue_oracle.cpp")\ntarget_include_directories(oracle PRIVATE "${directory.replaceAll('\\','/')}")\ntarget_compile_features(oracle PRIVATE cxx_std_17)\n`);
function run(cmd,args,input){const result=spawnSync(cmd,args,{cwd:directory,encoding:'utf8',input,maxBuffer:64*1024*1024,windowsHide:true});if(result.error||result.status)throw Error(result.error??result.stderr??result.stdout);return result.stdout;}
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','Win32']);run('cmake',['--build','compiled','--config','Release']);
const cases=[];for(const sequence of Object.values(RUSH_DIALOGUE_DATA.sequences))for(let profile=0;profile<4;profile++){
 const frames=sequence.steps.length*625,input=[];
 for(let frame=0;frame<frames;frame++){let mask=profile===0?0:profile===1?1:profile===2?(frame%47===32?2:0):(frame%173>=83?1:frame%29===0?2:0);input.push(mask);}
 cases.push({sequence,profile,input});
}
const expected=run(path.join(directory,'compiled/Release/oracle.exe'),[],[cases.length,...cases.map(c=>[c.sequence.steps.length,c.input.length,...c.sequence.steps.map(s=>s.coldFrames),...c.input].join(' '))].join('\n')).trim().split(/\r?\n/).map(line=>line.trim().split(' ').map(Number));
const base=path.resolve(root,'packages/thlib/assets/touhou-common');let id=1;const host={readText:file=>fs.readFileSync(file,'utf8'),loadTexture:()=>id++};
const resources=createTouhouResources(host,{basePath:base});resources.writeAnimationText=()=>{};resources.encodeText=text=>new Uint8Array(Array.from(text).reduce((size,c)=>size+(c.codePointAt(0)>127?2:1),0));
const failures=[];let frames=0,words=0;
for(let c=0;c<cases.length;c++){
 const {sequence,profile,input}=cases[c],dialogue=new TouhouDialogue({resources,steps:sequence.steps,character:sequence.character,codePage:936,skipHoldFrames:1});let previous=0;
 for(let frame=0;frame<input.length;frame++){
  const mask=((input[frame]&1)?Keys.FOCUS:0)|((input[frame]&2)?Keys.SHOOT:0);dialogue.update(mask);previous=mask;
  const actual=[dialogue.index,dialogue.cold,dialogue.auto,+dialogue.complete],original=expected[c].slice(frame*4,frame*4+4);frames++;words+=4;
  if(actual.some((v,i)=>v!==original[i])){failures.push({id:sequence.id,profile,frame,actual,expected:original});break;}
 }dialogue.dispose();
}resources.dispose();
const report={passed:failures.length===0,cases:cases.length,frames,words,source:'Verbatim original Dialog.h::OnUpdate; injected source StepChange coldFrame overrides, completion boundary and input services',sourceSha256:createHash('sha256').update(fs.readFileSync(reference)).digest('hex'),scope:'Integer cold/automatic counters, step advance and completion for all 10 source sequences under idle, held skip, pressed Z and mixed input; source message text/art/GPU checked separately',failures};
const out=path.resolve(root,'reports/rushboss/dialogue-timers.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
