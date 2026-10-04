// Deliberately sequential: both hosts receive identical JS command arrays and
// real OpenGL work. This isolates native decoding/submission from thlib changes.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
let before='build/ts-stg-profile-before.exe',after='build/Release/ts-stg.exe',frames=240,output='reports/th20/native-renderer-performance';
for(let i=0;i<args.length;i++){if(args[i]==='--before')before=args[++i];else if(args[i]==='--after')after=args[++i];else if(args[i]==='--frames')frames=Number(args[++i]);else if(args[i]==='--out')output=args[++i];else throw Error(`Unknown option ${args[i]}`);}
assert.ok(Number.isSafeInteger(frames)&&frames>30);mkdirSync(resolve(root,output),{recursive:true});
const runs={};
for(const [label,binary] of [['before',before],['after',after]]){
  assert.ok(existsSync(resolve(root,binary)),`Missing ${binary}`);
  const prefix=resolve(root,output,label);
  const child=spawnSync(resolve(root,binary),['native/tests/state-benchmark.js','--root',root,'--benchmark','--frames',String(frames),'--profile-warmup','30','--profile',`${prefix}.json`,'--snapshot',`${prefix}-state.json`,'--screenshot',`${prefix}.png`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
  if(child.error)throw child.error;assert.equal(child.status,0,`${label}: ${child.stdout}\n${child.stderr}`);
  runs[label]={profile:JSON.parse(readFileSync(`${prefix}.json`,'utf8')),state:JSON.parse(readFileSync(`${prefix}-state.json`,'utf8')),screenshotSha256:createHash('sha256').update(readFileSync(`${prefix}.png`)).digest('hex'),binarySha256:createHash('sha256').update(readFileSync(resolve(root,binary))).digest('hex')};
}
assert.deepEqual(runs.before.state,runs.after.state,'Native optimization changed fixture state');
assert.equal(runs.before.screenshotSha256,runs.after.screenshotSha256,'Opaque fixture pixels changed');
const comparisons=Object.fromEntries(['decodeMs','submitMs','gpuMs','frameWorkMs','frameTotalMs'].map(key=>[key,{beforeMean:runs.before.profile.metrics[key].mean,afterMean:runs.after.profile.metrics[key].mean,beforeP95:runs.before.profile.metrics[key].p95,afterP95:runs.after.profile.metrics[key].p95}]));
const report={scope:'Real QuickJS and GPU, identical 2000-sprite command arrays per frame; native-only synthetic submission workload, not overall game FPS.',frames,warmup:30,gpuDevice:runs.after.profile.gpuDevice,identicalState:true,identicalScreenshot:true,comparisons,runs};
writeFileSync(resolve(root,output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({gpuDevice:report.gpuDevice,identicalState:true,identicalScreenshot:true,comparisons},null,2));
