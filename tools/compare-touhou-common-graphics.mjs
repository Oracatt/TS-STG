// Historical player regression, independent of the full-vs-filtered comparison
// performed by verify-touhou-common-graphics. Both must pass after optimizing.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeRgbaPng} from './import-touhou-common-assets.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const before=resolve(root,args.shift()??'reports/touhou-common'),after=resolve(root,args.shift()??'reports/touhou-common/luastg-performance-regression');
let output='reports/touhou-common/luastg-performance-regression/comparison.json';
for(let i=0;i<args.length;i++)if(args[i]==='--out')output=args[++i];else throw Error(`Unknown option ${args[i]}`);
const json=file=>JSON.parse(readFileSync(file,'utf8')),sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const oldReport=json(resolve(before,'graphics.json')),newReport=json(resolve(after,'graphics.json'));
assert.equal(oldReport.passed,true);assert.equal(newReport.passed,true);
assert.deepEqual(newReport.results.map(scene=>scene.name),oldReport.results.map(scene=>scene.name),'Historical scene coverage changed');
const results=oldReport.results.map((scene,index)=>{
  const current=newReport.results[index];
  for(const key of['character','frames','bombFrame','focused','bombAge'])assert.deepEqual(current[key],scene[key],`${scene.name}: scene configuration changed`);
  const modes=Object.fromEntries(['original','shared'].map(mode=>{
    const old=scene.artifacts[mode],next=current.artifacts[mode];
    assert.deepEqual(json(next.snapshot),json(old.snapshot),`${scene.name}/${mode}: historical complete state changed`);
    const oldPng=decodeRgbaPng(readFileSync(old.image)),nextPng=decodeRgbaPng(readFileSync(next.image));
    assert.equal(nextPng.width,oldPng.width);assert.equal(nextPng.height,oldPng.height);
    assert.deepEqual(nextPng.rgba,oldPng.rgba,`${scene.name}/${mode}: historical RGBA pixels changed`);
    const beforeImageSha256=sha(old.image),afterImageSha256=sha(next.image);
    assert.equal(afterImageSha256,beforeImageSha256,`${scene.name}/${mode}: historical PNG bytes changed`);
    return [mode,{beforeImage:old.image,afterImage:next.image,beforeImageSha256,afterImageSha256,completeStateIdentical:true,pngBytesIdentical:true,changedPixels:0,width:oldPng.width,height:oldPng.height}];
  }));
  console.log(`PASS ${scene.name}: original and shared historical state/RGBA/PNG unchanged`);
  return{name:scene.name,frames:scene.frames,modes};
});
const report={format:'ts-stg-touhou-common-historical-graphics-v1',scope:'Actual QuickJS/GPU character captures versus pre-optimization local captures. Complete serialized character/ANM state, sound/cancellation traces and every RGBA pixel are compared. This does not execute the original game.',before,after,binarySha256:{before:oldReport.binarySha256,after:newReport.binarySha256},passed:true,results};
const destination=resolve(root,output);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log(`Report: ${destination}`);
