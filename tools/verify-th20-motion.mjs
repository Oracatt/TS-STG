import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Th20Motion } from '../games/touhou20/src/enemy.js';
const root=path.resolve(import.meta.dirname,'..'),reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction');
const directory=path.join(root,'build/th20-motion-oracle');fs.mkdirSync(directory,{recursive:true});
const read=file=>fs.readFileSync(path.join(reference,file),'utf8');
const source=read('source_reconstruction/runtime_state/motion.cpp'),math=read('source_reconstruction/ecl_vm/math.cpp');
function extract(text,signature){const start=text.indexOf(signature);if(start<0)throw new Error(signature);let cursor=text.indexOf('{',start),depth=1,end=cursor+1;for(;depth&&end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}return text.slice(start,end);}
const functions=['float sine(','float cosine(','float square_root(','float arctangent(','float wrap_angle(','float angle_difference(','void polar(','void rotate('].map(s=>extract(math,s)).join('\n');
fs.writeFileSync(path.join(directory,'oracle.cpp'),String.raw`#include <iostream>
#include <cmath>
#include <cstring>
#include "${path.join(reference,'native_recovered/native_core.hpp').replaceAll('\\','/')}"
namespace th20::source::sprite {struct Vec3{float x,y,z;};}
namespace th20::source::ecl::math {
constexpr float pi=3.1415927410125732f;
float a(float x,float y){return _mm_cvtss_f32(_mm_add_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float s(float x,float y){return _mm_cvtss_f32(_mm_sub_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float m(float x,float y){return _mm_cvtss_f32(_mm_mul_ss(_mm_set_ss(x),_mm_set_ss(y)));}
float d(float x,float y){return _mm_cvtss_f32(_mm_div_ss(_mm_set_ss(x),_mm_set_ss(y)));}
${functions}
}
namespace th20::source::state {
struct Motion{sprite::Vec3 position,velocity;float field_18,angle_1c,field_20,field_24,angle_28,field_2c,angle_30,field_34;sprite::Vec3 vector_38;std::uint32_t field_44;};
}
${source.replace(/^#include .*$/gm,'')}
int main(){using namespace th20::source::state;Motion value{};float rate;int frames;
while(std::cin>>value.field_44>>rate>>frames){
float* f=reinterpret_cast<float*>(&value);for(int i=0;i<17;i++)std::cin>>f[i];
for(int frame=0;frame<frames;frame++){update_motion(value,rate);for(int i=0;i<17;i++){std::uint32_t bits;std::memcpy(&bits,&f[i],4);std::cout<<bits<<' ';}std::cout<<'\n';}}
}
`);
fs.writeFileSync(path.join(directory,'CMakeLists.txt'),'cmake_minimum_required(VERSION 3.20)\nproject(th20_motion_oracle LANGUAGES CXX)\nadd_executable(oracle oracle.cpp)\ntarget_compile_features(oracle PRIVATE cxx_std_17)\ntarget_compile_options(oracle PRIVATE /fp:strict)\n');
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:directory,encoding:'utf8',maxBuffer:16*1024*1024,...options});if(result.error||result.status)throw new Error(`${command}: ${result.error??result.stderr}\n${result.stdout}`);return result.stdout;}
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','x64']);run('cmake',['--build','compiled','--config','Release']);
const state=motion=>[motion.position.x,motion.position.y,motion.position.z,motion.velocity.x,motion.velocity.y,motion.velocity.z,motion.speed,motion.angle,motion.radius,motion.angularVelocity,motion.axisAngle,motion.ellipseScale,motion.phase,motion.damping,motion.delta.x,motion.delta.y,motion.delta.z];
const cases=[];
for(const flags of [0,16,2,3,4,32])for(const rate of [0,.5,1,1.5,2])for(let sample=0;sample<3;sample++){
  const options={flags,position:{x:-30.122+sample*41,y:15.631+sample*.375,z:.1},velocity:{x:4.12,y:70.19,z:.2},delta:{x:5,y:-3,z:.11},speed:.7+sample*.9,angle:sample-1.7,radius:20.23+sample,angularVelocity:.12,axisAngle:.37,ellipseScale:.6,phase:1.27,damping:sample*.23};
  cases.push({options,rate,frames:8});
}
const input=cases.map(c=>[c.options.flags,c.rate,c.frames,...state(new Th20Motion(c.options))].join(' ')).join('\n');
const output=run(path.join(directory,'compiled/Release/oracle.exe'),[],{input}).trim().split(/\r?\n/).map(line=>line.trim().split(' ').map(Number));
const bits=v=>new Uint32Array(new Float32Array([v]).buffer)[0];let cursor=0;const failures=[];
for(const c of cases){const motion=new Th20Motion(c.options);c.expected=[];for(let frame=0;frame<c.frames;frame++){motion.update(c.rate);const expected=output[cursor++],actual=state(motion).map(bits);c.expected.push(expected);if(actual.some((v,i)=>v!==expected[i]))failures.push({options:c.options,rate:c.rate,frame,actual,expected});}}
const evidence={description:'Verbatim reconstruction runtime_state/motion.cpp with recovered math functions compiled as standalone C++; no original executable code.',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),cases:cases.length,frames:cursor,floatWords:cursor*17,failures:failures.length};
fs.mkdirSync(path.join(root,'reports/th20'),{recursive:true});fs.writeFileSync(path.join(root,'reports/th20/motion.json'),JSON.stringify({...evidence,failures},null,2));
if(failures.length)throw new Error(`${failures.length} original motion mismatches; see reports/th20/motion.json`);
fs.writeFileSync(path.join(root,'tests/fixtures/th20/motion.json'),JSON.stringify({evidence,cases}));console.log(JSON.stringify(evidence));
