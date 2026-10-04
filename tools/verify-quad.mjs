import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const oracle=path.resolve(root,option('--oracle','build/Release/tsstg-quad-oracle.exe'));
const executable=path.resolve(root,option('--exe','build/Release/ts-stg.exe'));
const reports=path.resolve(root,option('--out','reports/native-quad'));
function run(binary,argv){const result=spawnSync(binary,argv,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});if(result.error||result.status)throw new Error(`${binary}: ${result.error??result.stderr}\n${result.stdout}`);return result.stdout;}
const vectors=JSON.parse(run(oracle,[])),scratch=new ArrayBuffer(4),view=new DataView(scratch),f=Math.fround;
const fromBits=word=>{view.setUint32(0,word,true);return view.getFloat32(0,true);};
const bits=value=>{view.setFloat32(0,value,true);return view.getUint32(0,true);};
let words=0;
for(let test=0;test<vectors.length;test++){
  const q=vectors[test],n=q.input.map(fromBits),expected=[];
  for(let i=0;i<4;i++){
    let x=f(n[11]+f(f(n[8]+n[i*2])*n[10]));
    let y=f(n[12]+f(f(n[9]+n[i*2+1])*n[10]));
    if(q.snap){x=f(f(Math.sign(x)*Math.floor(Math.abs(x)+.5))-.5);y=f(f(Math.sign(y)*Math.floor(Math.abs(y)+.5))-.5);}
    expected.push(bits(x),bits(y),bits(n[i&1?15:13]),bits(n[i>>1?16:14]),q.colors[i],bits(0));
  }
  assert.deepEqual(q.vertices,expected,`native quad differs from portable mesh at case ${test}`);words+=expected.length;
}
const result={scope:'Generic CPU quad expansion versus portable JavaScript binary32 arithmetic, including signed zero, subnormals, half-pixel ties, negative scale and randomized transformed corners. This does not compare ANM rules.',numeric:{cases:vectors.length,words,mismatches:0}};
if(!args.includes('--numeric-only')){
  fs.mkdirSync(reports,{recursive:true});
  const snapshot=path.join(reports,'gpu.json'),screenshot=path.join(reports,'gpu.png');
  run(executable,['native/tests/quad-gpu.js','--root',root,'--benchmark','--frames','3','--snapshot',snapshot,'--screenshot',screenshot]);
  result.gpu=JSON.parse(fs.readFileSync(snapshot,'utf8'));assert.equal(result.gpu.cases,24);
  result.gpu.screenshot=screenshot;
  const coverage=path.join(reports,'coverage.json'),coverageImage=path.join(reports,'coverage.png');
  run(executable,['native/tests/mesh-texture-switch-gpu.js','--root',root,'--benchmark','--frames','3','--snapshot',coverage,'--screenshot',coverageImage]);
  result.coverage=JSON.parse(fs.readFileSync(coverage,'utf8'));assert.equal(result.coverage.expectedColors,true);
  result.coverage.screenshot=coverageImage;
  fs.writeFileSync(path.join(reports,'verification.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result));
