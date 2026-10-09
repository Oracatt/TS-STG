import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {TouhouConvergingParticles} from '../packages/thlib/dist/touhou/converging-particles.js';
import {TouhouRNG} from '../packages/thlib/dist/touhou/math.js';
import {AnmInterpolation} from '../packages/thlib/dist/touhou/anm-interpolation.js';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction/source_reconstruction'),dir=path.resolve(root,'build/touhou-converging-oracle');fs.mkdirSync(dir,{recursive:true});
const unix=p=>p.replaceAll('\\','/'),f=Math.fround,bits=value=>new Uint32Array(new Float32Array([value]).buffer)[0];
fs.writeFileSync(path.join(dir,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)
project(touhou_converging_oracle LANGUAGES CXX)
add_executable(oracle "${unix(path.join(root,'native/tests/th20_converging_oracle.cpp'))}" "${unix(source)}/effect_system/converging_particles.cpp" "${unix(source)}/ecl_vm/math.cpp")
target_include_directories(oracle PRIVATE "${unix(source)}" "${unix(source)}/core_scheduler" "${unix(path.resolve(source,'../native_recovered'))}" "${unix(path.resolve(source,'../include'))}")
target_compile_features(oracle PRIVATE cxx_std_20)
target_compile_options(oracle PRIVATE /fp:strict /arch:SSE2 /utf-8)
`);
const run=(command,args,options={})=>{const result=spawnSync(command,args,{cwd:dir,encoding:'utf8',maxBuffer:16*1024*1024,...options});if(result.error||result.status!==0)throw new Error(`${command}: ${result.error??result.stderr}\n${result.stdout}`);return result.stdout;};
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','Win32']);run('cmake',['--build','compiled','--config','Release']);
function fakeVm(){const memory=new DataView(new ArrayBuffer(0x5e4));return{alive:true,effectTrackedAge:0,interpolations:new Map(),F(offset,value){if(value!==undefined)memory.setFloat32(offset,value,true);return memory.getFloat32(offset,true);},U(offset,value){if(value!==undefined)memory.setUint32(offset,value>>>0,true);return memory.getUint32(offset,true);},interpolate(key,address,count,end,duration,mode,options){this.interpolations.set(key,{value:new AnmInterpolation(Array(count).fill(0),end,duration,mode,options)});},destroy(){this.alive=false;}};}
const cases=[],lines=[],expected=[];
for(let index=0;index<256;index++){
  const age=index%5===0?0:50+index%9,previous=age-1,seed=1+index*7897,duration=index%41,
    position=[f((index%17-8)*13.7),f(100+index*.3),f((index%11-5)*.25)],rotation=f((index%31-15)*.19),phase=f((index%7-3)*.11),color=(0xff000000|(index*1234567&0xffffff))>>>0,slowdown=f((index%5)*.25),existing=age===0?0:index%13;
  const parent=fakeVm(),children=[];Object.assign(parent,{x:position[0],y:position[1],z:position[2],rotation});parent.U(0x444,duration);parent.F(0x46c,phase);parent.U(0x490,color);parent.F(0x560,slowdown);
  const bank={rng:new TouhouRNG(seed),create(script){const child=fakeVm();child.script=script;child.id=children.length+1;children.push(child);return child;}};parent.bank=bank;
  const owner=new TouhouConvergingParticles(parent);owner.age.current=age;owner.age.value=age;owner.age.previous=previous;
  const input=[seed,age,previous,duration,...position.map(bits),bits(rotation),bits(phase),color,bits(slowdown),existing];
  for(let i=0;i<existing;i++){
    const stage=(i+index)%3,trackedAge=(i+index)%60,target=[f(i*1.7),f(index*.8),f(i*.23)],tangent=[f(index*.12),f(i*-.3),f(index*.17)];
    const child=bank.create(0);child.effectTrackedAge=trackedAge;owner.particles.push({vm:child,stage,target:{x:target[0],y:target[1],z:target[2]},tangent:{x:tangent[0],y:tangent[1],z:tangent[2]}});
    input.push(stage,trackedAge,...target.map(bits),...tangent.map(bits));
  }
  const result=owner.update(),actual=[result,bank.rng.state,bank.rng.last,owner.age.current,owner.age.previous,bits(owner.age.value),children.length];
  const zero=[0,0,0],vec=value=>value?[value.x,value.y,value.z]:zero;
  for(const particle of owner.particles){const child=particle.vm,curve=child.interpolations.get('position')?.value;
    actual.push(child.id,particle.stage,child.script,child.U(0x490),child.U(0x444),child.U(0x560),curve?.duration??0,curve?.mode??0,
      ...vec(particle.target).map(bits),...vec(particle.tangent).map(bits),...(curve?.start??zero).map(bits),...(curve?.end??zero).map(bits),...(curve?.current??zero).map(bits),...(curve?.tangentStart??zero).map(bits),...(curve?.tangentEnd??zero).map(bits));
  }
  cases.push({index,age,existing});lines.push(input.join(' '));expected.push(actual);
}
const raw=run(path.join(dir,'compiled/Release/oracle.exe'),[],{input:[lines.length,...lines].join('\n')});
const original=raw.trim().split(/\r?\n/).map(line=>line.trim().split(/\s+/).map(Number)),mismatches=[];let words=0;
for(let i=0;i<expected.length;i++){const actual=expected[i],reference=original[i];if(actual.length!==reference.length)mismatches.push({case:i,reason:'length',actual:actual.length,reference:reference.length});
  for(let j=0;j<actual.length;j++){words++;if(actual[j]!==reference[j])mismatches.push({case:i,word:j,actual:actual[j],reference:reference[j]});}}
const report={passed:mismatches.length===0,cases:cases.length,words,source:'effect_system/converging_particles.cpp (unmodified, compiled independently)',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'effect_system/converging_particles.cpp'))).digest('hex'),scope:'Original attached callback allocation boundary, all first/second Hermite control points, RNG order/state, colors, child descriptors, slowdown and timer values; actual ANM script lifecycle covered separately',mismatches};
const out=path.join(root,'reports/touhou-common/converging-source/report.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,mismatches:mismatches.slice(0,10),report:out}));if(!report.passed)process.exitCode=1;
