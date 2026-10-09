import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {AnmBank} from '../games/touhou20/src/anm.js';import {projectedAnmWorld,createTh20Camera} from '../games/touhou20/src/anm-projection.js';import {PI,div} from '../games/touhou20/src/math.js';
import {projectedAnmBillboard} from '../packages/thlib/dist/touhou/anm-projection.js';
const root=path.resolve(import.meta.dirname,'..'),reference=path.resolve(process.argv[2]??'D:/AIWorkspace/Touhou20Reconstruction'),src=path.join(reference,'source_reconstruction'),dir=path.join(root,'build/th20-projection-oracle');fs.mkdirSync(dir,{recursive:true});const unix=p=>p.replaceAll('\\','/'),bits=x=>new Uint32Array(new Float32Array([x]).buffer)[0],hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function body(text,name){const start=text.search(new RegExp('^[A-Za-z_:][A-Za-z0-9_:<>*& ]+ '+name+'\\(', 'm')),begin=start;if(start<0)throw Error('Missing source function '+name);let i=text.indexOf('{',begin),depth=1;for(i++;depth;i++){if(text[i]==='{')depth++;if(text[i]==='}')depth--;}return text.slice(start,i);}
const projected=fs.readFileSync(path.join(src,'sprite_renderer/projected_draw.cpp'),'utf8'),anm=fs.readFileSync(path.join(src,'sprite_renderer/anm_vm.cpp'),'utf8');
fs.writeFileSync(path.join(dir,'projection-source.inc'),[...['inherited_animation_rotation','animation_position'].map(name=>body(anm,name)),...['rotate_matrix','transform_position','prepare_projected_billboard'].map(name=>body(projected,name))].join('\n'));
const full=body(projected,'p441f00'),start=full.indexOf('if(!(a.base.flags[1]&0x4000000))'),end=full.indexOf('    apply_animation_render_state');const z='world.elements[14]=n::add32(n::add32(a.base.vector_2c.z,a.vector_5bc.z),a.base.vector_484.z);';if(!full.includes(z))throw Error('Original Z assignment changed');fs.writeFileSync(path.join(dir,'world-source.inc'),full.slice(start,end)+'\n'+z);
fs.writeFileSync(path.join(dir,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)
project(th20_projection_oracle LANGUAGES CXX)
add_executable(oracle "${unix(path.join(root,'native/tests/th20_projection_oracle.cpp'))}" "${unix(src)}/ecl_vm/math.cpp")
target_include_directories(oracle PRIVATE "${unix(src)}" "${unix(src)}/sprite_renderer" "${unix(src)}/core_scheduler" "${unix(path.join(reference,'native_recovered'))}" "${unix(dir)}")
target_compile_features(oracle PRIVATE cxx_std_17)
target_compile_options(oracle PRIVATE /fp:strict /arch:SSE2 /utf-8)
`);
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',maxBuffer:16*1024*1024,...options});if(r.error||r.status!==0)throw Error(`${cmd}: ${r.error??r.stderr}\n${r.stdout}`);return r.stdout;}
run('cmake',['-S','.','-B','compiled','-G','Visual Studio 16 2019','-A','Win32']);run('cmake',['--build','compiled','--config','Release']);
const oracle=(mode,input)=>run(path.join(dir,'compiled/Release/oracle.exe'),[],{input:[mode,input.length,...input].join('\n')}).trim().split(/\r?\n/).map(l=>l.trim().split(' ').map(Number));
const data=JSON.parse(fs.readFileSync(path.join(root,'games/touhou20/assets/anm/effect.json'))),b=new AnmBank(data),cases=[],inputs=[];
for(const script of[33,37,40,41,45,49,50,51]){const rootVM=b.create(script,{x:31.25,y:145.75});for(let frame=0;frame<20;frame++){for(const vm of b.instances.filter(v=>v.alive&&v.renderType===8)){const nodes=[];const collect=v=>{if(v.parent)collect(v.parent);if(!nodes.includes(v))nodes.push(v);};collect(vm);const words=nodes.map(v=>{const w=Array.from(new Uint32Array(v.memory.buffer));const sprite=data.sprites[v.spriteIndex];for(let j=0;j<16;j++)w[0x3b8/4+j]=bits(j%5===0?1:0);w[0x3b8/4]=bits(sprite.width/256);w[0x3b8/4+5]=bits(sprite.height/256);return w;});const scale=frame%3===0?1:frame%3===1?1.5:2,offsets=[{x:480,y:136},{x:480,y:24}];vm.U(0x4a0,(vm.U(0x4a0)&~0x1c0000)|((frame%6)<<18));words.at(-1)[0x4a0/4]=vm.U(0x4a0);
 inputs.push([nodes.length,bits(scale),...offsets.flatMap(p=>[p.x,p.y]),...nodes.flatMap((v,i)=>[v.parent?nodes.indexOf(v.parent):-1,v.transformParent?nodes.indexOf(v.transformParent):-1,...words[i]])].join(' '));cases.push({script,frame,scale,offsets,words,parents:nodes.map(v=>[nodes.indexOf(v.parent),nodes.indexOf(v.transformParent)]),actual:projectedAnmWorld(vm,scale,offsets).map(bits)});
 }rootVM.update();}rootVM.destroy();b.collect();}
const worlds=oracle('world',inputs),failures=[];cases.forEach((c,i)=>{const diffs=c.actual.flatMap((v,j)=>v===worlds[i][j]?[]:[{word:j,actual:v,expected:worlds[i][j]}]);if(diffs.length)failures.push({script:c.script,frame:c.frame,differences:diffs});delete c.actual;c.expected=worlds[i];});
const cameras=[{x:0,y:0,width:640,height:480},{x:0,y:0,width:1280,height:960},{x:272,y:120,width:416,height:480},{x:0,y:0,width:960,height:720},{x:192,y:24,width:576,height:672},{x:128,y:16,width:384,height:448},{x:256,y:32,width:768,height:896}];const cameraOutput=oracle('camera',cameras.map(c=>[c.x,c.y,c.width,c.height,bits(div(PI,6))].join(' ')));cameras.forEach((c,i)=>{const a=createTh20Camera(c),words=[...a.view,...a.projection].map(bits),diff=words.flatMap((v,j)=>v===cameraOutput[i][j]?[]:[{word:j,actual:v,expected:cameraOutput[i][j]}]);if(diff.length)failures.push({camera:i,differences:diff});c.expected=cameraOutput[i];});
const evidence={worldCases:cases.length,worldWords:cases.length*16,cameraCases:cameras.length,failures:failures.length,source:'Verbatim p441f00 world-matrix block, inherited rotation/position, and transform_position from local reconstruction; OS D3DX9_43 matrices. CPU matrices only, no original executable or GPU pixel equivalence.',sourceSha256:hash(projected)};fs.writeFileSync(path.join(root,'reports/th20/projection.json'),JSON.stringify({...evidence,differences:failures.slice(0,20)},null,2));if(failures.length)throw Error(JSON.stringify(failures.slice(0,4)));fs.writeFileSync(path.join(root,'tests/fixtures/th20/projection.json'),JSON.stringify({evidence,cases,cameras}));console.log(JSON.stringify(evidence));
// Separate original p440340/type-4 billboard geometry oracle. The unmodified
// source function calls the real OS D3DXVec3Project, including its SSE rounding.
const billboardInputs=[],billboardCases=[];
for(const viewport of cameras.slice(0,4))for(let variant=0;variant<54;variant++){
 const bank=new AnmBank(data,{cameraComponent:()=>0}),parent=bank.create(14),vm=bank.create(133,{x:viewport.width*.5+variant*1.3,y:viewport.height*.4-variant*2.1,z:(variant%7-3)*100});
 parent.rotation=Math.fround((variant%13-6)*.19);if(variant%2){vm.parent=parent;vm.transformParent=parent;}
 vm.F(0x2c,Math.fround((variant%5-2)*3.17));vm.F(0x30,Math.fround((variant%3-1)*7.77));vm.F(0x34,Math.fround((variant%11-5)*.23));
 vm.rotation=Math.fround((variant%17-8)*.31);vm.scaleX=Math.fround(.5+(variant%5)*.2);vm.scaleY=Math.fround(.3+(variant%7)*.17);vm.scale2X=Math.fround(1+variant*.003);vm.scale2Y=Math.fround(.8+variant*.005);
 vm.U(0x4a8,variant%3);vm.U(0x4ac,Math.floor(variant/3)%3);
 if(variant===52)vm.z=100000;if(variant===53){vm.z=-100000;vm.rotation=25;}
 const camera={...createTh20Camera(viewport),billboardAxis:{x:variant%2?1:0,y:variant%2?0:1,z:variant%3?0:.1}},nodes=variant%2?[parent,vm]:[vm],words=nodes.map(node=>Array.from(new Uint32Array(node.memory.buffer))),links=nodes.map(node=>[nodes.indexOf(node.parent),nodes.indexOf(node.transformParent)]);
 billboardInputs.push([nodes.length,viewport.x,viewport.y,viewport.width,viewport.height,...Object.values(camera.billboardAxis).map(bits),...camera.view.map(bits),...camera.projection.map(bits),...nodes.flatMap((node,i)=>[...links[i],...words[i]])].join(' '));
 const actual=projectedAnmBillboard(vm,{projection:camera});billboardCases.push({viewport,variant,camera,words,links,actual:actual.sourceVertices.length?[0,...actual.sourceVertices.flat().map(bits)]:[-1],actualRotation:nodes.flatMap(node=>[node.F(0x38),node.F(0x3c),node.F(0x40)]).map(bits)});bank.dispose();
}
const billboardOriginal=oracle('billboard',billboardInputs),billboardOriginalRotation=oracle('billboard-state',billboardInputs),billboardFailures=[];let billboardWords=0,maxBillboardUlp=0,billboardRotationWords=0;
for(let i=0;i<billboardCases.length;i++){const entry=billboardCases[i],reference=billboardOriginal[i];billboardWords+=reference.length;
 const differences=entry.actual.flatMap((value,j)=>{const expected=reference[j];maxBillboardUlp=Math.max(maxBillboardUlp,Math.abs(value-expected));return value===expected?[]:[{word:j,actual:value,expected}];});
 const rotationDifferences=entry.actualRotation.flatMap((value,j)=>value===billboardOriginalRotation[i][j]?[]:[{word:j,actual:value,expected:billboardOriginalRotation[i][j]}]);billboardRotationWords+=entry.actualRotation.length;
 if(entry.actual.length!==reference.length||differences.length||rotationDifferences.length)billboardFailures.push({case:i,variant:entry.variant,viewport:entry.viewport,differences,rotationDifferences});entry.expected=reference;entry.expectedRotation=billboardOriginalRotation[i];delete entry.actual;delete entry.actualRotation;
}
// Check every normalized binary32 mantissa against the actual SSE instruction.
// The native tool emits only bucket boundaries, but examines all 2^23 inputs.
const reciprocalBuckets=oracle('reciprocal-table',[]);
if(reciprocalBuckets.length!==2048)throw Error('Unexpected SSE reciprocal bucket count');
for(let bucket=0;bucket<2048;bucket++){
 const mantissa=Math.round((2/(1+(bucket+.5)/2048)-1)*4096),expected=(126<<23)|(mantissa<<11);
 if(reciprocalBuckets[bucket][0]!==bucket*4096||reciprocalBuckets[bucket][1]!==expected)throw Error(`SSE reciprocal estimate mismatch at bucket ${bucket}`);
}
const billboardEvidence={passed:billboardFailures.length===0,cases:billboardCases.length,words:billboardWords,rotationWords:billboardRotationWords,maxUlp:maxBillboardUlp,reciprocalEstimateMantissas:2**23,reciprocalEstimateBuckets:reciprocalBuckets.length,source:'Verbatim prepare_projected_billboard + inherited_animation_rotation from local reconstruction, with real OS D3DXVec3Project; XYZ vertex bits, all nine anchor pairs, inherited rotations and clipping side effects, scale, viewport and clipping',sourceSha256:hash(projected),failures:billboardFailures.length};
fs.mkdirSync(path.join(root,'reports/touhou-common/billboard-source'),{recursive:true});fs.writeFileSync(path.join(root,'reports/touhou-common/billboard-source/report.json'),JSON.stringify({...billboardEvidence,differences:billboardFailures.slice(0,20)},null,2));
fs.writeFileSync(path.join(root,'tests/fixtures/th20/billboard.json'),JSON.stringify({evidence:billboardEvidence,cases:billboardCases}));console.log(JSON.stringify(billboardEvidence));
if(billboardFailures.length)throw Error(JSON.stringify(billboardFailures.slice(0,2)));
