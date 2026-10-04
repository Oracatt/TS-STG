import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const before=resolve(root,args.shift()??'build/th20-graphics-before'),after=resolve(root,args.shift()??'build/th20-graphics-after');
let output='reports/th20/game-performance.json',equalImages=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--out')output=args[++i];
  else if(args[i]==='--equal-images')equalImages=true;
  else throw new Error(`Unknown argument ${args[i]}`);
}
const json=path=>JSON.parse(readFileSync(path,'utf8')),sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const results=['title','reimu-shoot','marisa-bomb','pause'].map(scene=>{
  const path=(base,suffix)=>resolve(base,`${scene}${suffix}`);
  assert.deepEqual(json(path(after,'-state.json')),json(path(before,'-state.json')),`${scene}: simulation state changed`);
  const oldProfile=json(path(before,'-profile.json')),newProfile=json(path(after,'-profile.json'));
  assert.equal(oldProfile.simulationFrames,newProfile.simulationFrames);
  assert.equal(oldProfile.renderFrames,newProfile.renderFrames);
  assert.equal(oldProfile.warmupRenderFrames,newProfile.warmupRenderFrames);
  const oldImage=sha(path(before,'.png')),newImage=sha(path(after,'.png'));
  if(equalImages)assert.equal(newImage,oldImage,`${scene}: GPU image changed`);
  const stages=Object.fromEntries(['updateJsMs','renderJsMs','decodeMs','submitMs','frameWorkMs','frameTotalMs','gpuMs'].map(key=>[key,{before:oldProfile.metrics[key],after:newProfile.metrics[key]}]));
  return{scene,simulationFrames:oldProfile.simulationFrames,renderFrames:oldProfile.renderFrames,statesEqual:true,
    screenshotSha256:{before:oldImage,after:newImage},imagesEqual:oldImage===newImage,
    gpuDevice:newProfile.gpuDevice,stages};
});
const report={format:'ts-stg-th20-performance-comparison-v1',before,after,equalImagesRequired:equalImages,
  scope:'Real QuickJS and GPU, fixed one-update-per-render benchmark. frameWork excludes swap, intentional frame pacing and profiler overhead. GPU timings overlap CPU work; none of these values guarantee normal-play FPS. Snapshots compare all serialized gameplay and RNG state. Old vs fixed alpha presentation may intentionally change pixels.',results};
const target=resolve(root,output);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2));
for(const {scene,stages}of results){const a=stages.frameWorkMs.before,b=stages.frameWorkMs.after;console.log(`${scene}: work mean ${a.mean.toFixed(2)} -> ${b.mean.toFixed(2)} ms; p95 ${a.p95.toFixed(2)} -> ${b.p95.toFixed(2)} ms; state identical`);}
console.log(`Report: ${target}`);
